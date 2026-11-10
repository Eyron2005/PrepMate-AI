import { useMemo, useState } from "react";
import {
  FaPlus,
  FaSearch,
  FaEdit,
  FaTrash,
  FaPowerOff,
  FaBriefcase,
  FaIndustry,
  FaTimes,
  FaExclamationTriangle,
} from "react-icons/fa";
import {
  canDeleteConfigRecord,
  deleteJobRole,
  saveJobRole,
  setJobRoleActive,
} from "../../services/interviewMode";

export default function JobRoleManagerSection({
  industries,
  jobRoles,
  usageByJobRoleId,
  onReload,
  onSuccess,
  onError,
  onRequestConfirm,
}) {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formState, setFormState] = useState({
    industry_id: "",
    name: "",
    description: "",
    is_active: true,
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const industryById = useMemo(
    () => Object.fromEntries(industries.map((ind) => [ind.id, ind])),
    [industries]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobRoles.filter((role) => {
      const indName = industryById[role.industry_id]?.name || "";
      const matchesSearch =
        !query ||
        role.name.toLowerCase().includes(query) ||
        (role.description || "").toLowerCase().includes(query) ||
        indName.toLowerCase().includes(query);
      const matchesIndustry = !industryFilter || role.industry_id === industryFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? role.is_active : !role.is_active);
      return matchesSearch && matchesIndustry && matchesStatus;
    });
  }, [jobRoles, industryById, search, industryFilter, statusFilter]);

  function openAddModal() {
    setEditing(null);
    const firstActiveIndustry = industries.find((i) => i.is_active) || industries[0];
    setFormState({
      industry_id: firstActiveIndustry?.id || "",
      name: "",
      description: "",
      is_active: true,
    });
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(role) {
    setEditing(role);
    setFormState({
      industry_id: role.industry_id || "",
      name: role.name || "",
      description: role.description || "",
      is_active: role.is_active !== false,
    });
    setFormError("");
    setModalOpen(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    const result = await saveJobRole(
      {
        id: editing?.id || null,
        ...formState,
      },
      jobRoles
    );

    setSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    setModalOpen(false);
    await onReload();
    onSuccess(
      editing
        ? `Job role "${result.data.name}" updated.`
        : `Job role "${result.data.name}" created and synced to Supabase.`
    );
  }

  function handleToggleActive(role) {
    const nextActive = !role.is_active;
    if (nextActive) {
      executeToggleActive(role, true);
      return;
    }

    const usage = usageByJobRoleId[role.id] || {};
    onRequestConfirm({
      variant: "power",
      title: `Deactivate "${role.name}"?`,
      message: `Inactive job roles are hidden from the Android app's Job Role dropdown while keeping ${
        usage.questions || 0
      } question(s) and ${usage.sessions || 0} historical session(s) intact.`,
      confirmLabel: "Deactivate Job Role",
      action: () => executeToggleActive(role, false),
    });
  }

  async function executeToggleActive(role, nextActive) {
    const res = await setJobRoleActive(role.id, nextActive);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    await onReload();
    onSuccess(`Job role "${role.name}" is now ${nextActive ? "Active" : "Inactive"}.`);
  }

  function handleDelete(role) {
    const usage = usageByJobRoleId[role.id] || {};
    const guard = canDeleteConfigRecord(usage);
    if (!guard.allowed) {
      onError(`Cannot delete job role "${role.name}": ${guard.reason}`);
      return;
    }

    onRequestConfirm({
      variant: "danger",
      title: `Delete "${role.name}"?`,
      message: "This job role has no linked questions or interview sessions and will be permanently removed.",
      confirmLabel: "Delete Job Role",
      action: async () => {
        const res = await deleteJobRole(role.id);
        if (!res.ok) {
          onError(res.error);
          return;
        }
        await onReload();
        onSuccess(`Job role "${role.name}" removed.`);
      },
    });
  }

  const selectableIndustries = industries.filter(
    (ind) => ind.is_active || ind.id === editing?.industry_id || ind.id === formState.industry_id
  );

  return (
    <section className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search job roles or industries..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
            />
          </div>

          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            aria-label="Filter job roles by industry"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500"
          >
            <option value="">All Industries</option>
            {industries.map((ind) => (
              <option key={ind.id} value={ind.id}>
                {ind.name}
                {!ind.is_active ? " (Inactive)" : ""}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter job roles by status"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500"
          >
            <option value="all">All Statuses ({jobRoles.length})</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          disabled={industries.length === 0}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-500/25 transition hover:shadow-sky-500/40 disabled:opacity-50"
        >
          <FaPlus className="text-[11px]" />
          <span>Add Job Role</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-xs text-slate-700">
            <thead className="bg-slate-50/90 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Job Role</th>
                <th className="px-4 py-3.5">Corresponding Industry</th>
                <th className="px-4 py-3.5">Questions / Sessions</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                    No job roles match your current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((role) => {
                  const ind = industryById[role.industry_id];
                  const usage = usageByJobRoleId[role.id] || {};
                  const delCheck = canDeleteConfigRecord(usage);
                  const parentInactive = ind && !ind.is_active;

                  return (
                    <tr key={role.id} className="transition hover:bg-sky-50/40 align-top">
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                            <FaBriefcase className="text-xs" />
                          </span>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{role.name}</p>
                            <p className="mt-0.5 max-w-md text-[11px] text-slate-500">
                              {role.description || "No role description provided."}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-800 ring-1 ring-sky-200/80">
                          <FaIndustry className="text-[10px] text-sky-600" />
                          {ind?.name || "Unassigned Industry"}
                        </span>
                        {parentInactive && (
                          <p className="mt-1 text-[10px] font-bold text-amber-700">
                            Parent industry inactive (hidden in Android app)
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-[11px] text-slate-600 whitespace-nowrap">
                        <span className="font-semibold text-slate-800">{usage.questions || 0}</span> questions ·{" "}
                        <span className="font-semibold text-slate-800">{usage.sessions || 0}</span> sessions
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                            role.is_active && !parentInactive
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                              : role.is_active && parentInactive
                                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                                : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                          }`}
                        >
                          {role.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(role)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-sky-50 hover:text-sky-800"
                          >
                            <FaEdit className="text-[10px]" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(role)}
                            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold ring-1 transition ${
                              role.is_active
                                ? "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100"
                                : "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
                            }`}
                          >
                            <FaPowerOff className="text-[10px]" /> {role.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(role)}
                            title={delCheck.allowed ? "Delete unused job role" : delCheck.reason}
                            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold ring-1 transition ${
                              delCheck.allowed
                                ? "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100"
                                : "bg-slate-100 text-slate-400 ring-slate-200 cursor-not-allowed"
                            }`}
                          >
                            <FaTrash className="text-[10px]" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Job Role Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-md">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-white p-7 shadow-2xl ring-1 ring-slate-200/80"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-700">Job Role Management</p>
                <h3 className="mt-0.5 text-xl font-extrabold text-slate-950">
                  {editing ? "Edit Job Role" : "Add New Job Role"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-100"
              >
                <FaTimes className="text-xs" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {formError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
                  <FaExclamationTriangle className="mt-0.5 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Corresponding Industry <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formState.industry_id}
                  onChange={(e) => {
                    setFormState((prev) => ({ ...prev, industry_id: e.target.value }));
                    setFormError("");
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                >
                  <option value="">Select Industry...</option>
                  {selectableIndustries.map((ind) => (
                    <option key={ind.id} value={ind.id}>
                      {ind.name}
                      {!ind.is_active ? " (Inactive)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Job Role Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(e) => {
                    setFormState((prev) => ({ ...prev, name: e.target.value }));
                    setFormError("");
                  }}
                  placeholder="e.g., Full Stack Developer"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formState.description}
                  onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Core skills, tools, and responsibilities covered by this job role."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3">
                <div>
                  <p className="text-xs font-bold text-slate-900">Active Job Role</p>
                  <p className="text-[11px] text-slate-500">Show this role in the Android app&apos;s Job Role dropdown.</p>
                </div>
                <input
                  type="checkbox"
                  checked={formState.is_active}
                  onChange={(e) => setFormState((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="h-4 w-4 accent-sky-600"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Job Role"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
