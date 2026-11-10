import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaPlus,
  FaSearch,
  FaEdit,
  FaTrash,
  FaPowerOff,
  FaIndustry,
  FaTimes,
  FaExclamationTriangle,
} from "react-icons/fa";
import {
  canDeleteConfigRecord,
  deleteIndustry,
  saveIndustry,
  setIndustryActive,
} from "../../services/interviewMode";

export default function IndustryManagerSection({
  industries,
  usageByIndustryId,
  onReload,
  onSuccess,
  onError,
  onRequestConfirm,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formState, setFormState] = useState({ name: "", description: "", is_active: true });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return industries.filter((item) => {
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        (item.description || "").toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? item.is_active : !item.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [industries, search, statusFilter]);

  function openAddModal() {
    setEditing(null);
    setFormState({ name: "", description: "", is_active: true });
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(item) {
    setEditing(item);
    setFormState({
      name: item.name || "",
      description: item.description || "",
      is_active: item.is_active !== false,
    });
    setFormError("");
    setModalOpen(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    const result = await saveIndustry(
      {
        id: editing?.id || null,
        ...formState,
      },
      industries
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
        ? `Industry "${result.data.name}" has been updated.`
        : `Industry "${result.data.name}" has been added.`
    );
  }

  function handleToggleActive(item) {
    const nextActive = !item.is_active;
    if (nextActive) {
      executeToggleActive(item, true);
      return;
    }

    const usage = usageByIndustryId[item.id] || {};
    onRequestConfirm({
      variant: "power",
      title: `Deactivate "${item.name}"?`,
      message: `Students will no longer see "${item.name}" or its job roles in the mobile app when starting a new interview. Your ${usage.childRoles || 0} job role(s), ${usage.questions || 0} question(s), and ${usage.sessions || 0} past interview(s) will stay saved.`,
      confirmLabel: "Deactivate Industry",
      action: () => executeToggleActive(item, false),
    });
  }

  async function executeToggleActive(item, nextActive) {
    const res = await setIndustryActive(item.id, nextActive);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    await onReload();
    onSuccess(`Industry "${item.name}" is now ${nextActive ? "Active" : "Inactive"}.`);
  }

  function handleDelete(item) {
    const usage = usageByIndustryId[item.id] || {};
    const guard = canDeleteConfigRecord(usage);
    if (!guard.allowed) {
      onError(`Cannot delete "${item.name}": ${guard.reason}`);
      return;
    }

    onRequestConfirm({
      variant: "danger",
      title: `Delete "${item.name}"?`,
      message: "No job roles, questions, or past interviews use this industry. Deleting it cannot be undone.",
      confirmLabel: "Delete Industry",
      action: async () => {
        const res = await deleteIndustry(item.id);
        if (!res.ok) {
          onError(res.error);
          return;
        }
        await onReload();
        onSuccess(`Industry "${item.name}" was deleted.`);
      },
    });
  }

  return (
    <section className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search industries..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter industries by status"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500"
          >
            <option value="all">All Statuses ({industries.length})</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-500/25 transition hover:shadow-sky-500/40"
        >
          <FaPlus className="text-[11px]" />
          <span>Add Industry</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-xs text-slate-700">
            <thead className="bg-slate-50/90 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Industry</th>
                <th className="px-4 py-3.5">Job Roles</th>
                <th className="px-4 py-3.5">Questions &amp; Interviews</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                    No industries match your search or filter.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const usage = usageByIndustryId[item.id] || {};
                  const delCheck = canDeleteConfigRecord(usage);
                  return (
                    <tr key={item.id} className="transition hover:bg-sky-50/40">
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                            <FaIndustry className="text-xs" />
                          </span>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{item.name}</p>
                            <p className="mt-0.5 max-w-md text-[11px] text-slate-500">
                              {item.description || "No description added."}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-800">{usage.childRoles || 0} roles</td>
                      <td className="px-4 py-4 text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-800">{usage.questions || 0}</span> questions ·{" "}
                        <span className="font-semibold text-slate-800">{usage.sessions || 0}</span> interviews
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                            item.is_active
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                              : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                          }`}
                        >
                          {item.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-sky-50 hover:text-sky-800"
                          >
                            <FaEdit className="text-[10px]" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(item)}
                            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold ring-1 transition ${
                              item.is_active
                                ? "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100"
                                : "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
                            }`}
                          >
                            <FaPowerOff className="text-[10px]" /> {item.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            title={delCheck.allowed ? "Delete unused industry" : delCheck.reason}
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

      {/* Add / Edit Industry Modal */}
      {modalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget && !saving) setModalOpen(false);
            }}
          >
            <form
              onSubmit={handleSave}
              onKeyDown={(e) => {
                if (e.key === "Escape" && !saving) setModalOpen(false);
              }}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/80 bg-white p-7 shadow-2xl ring-1 ring-slate-200/80 fade-in-up sm:p-8"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-base text-white shadow-md shadow-sky-500/25">
                    <FaIndustry />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">Industry Details</p>
                    <h3 className="mt-0.5 text-xl font-extrabold text-slate-950">
                      {editing ? "Edit Industry" : "Add New Industry"}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  aria-label="Close modal"
                  className="rounded-xl border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
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
                    Industry Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={formState.name}
                    onChange={(e) => {
                      setFormState((prev) => ({ ...prev, name: e.target.value }));
                      setFormError("");
                    }}
                    placeholder="e.g., Healthcare"
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
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
                    placeholder="Short note about the jobs included in this industry (optional)."
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3.5 transition hover:border-sky-200 hover:bg-sky-50/40">
                  <div>
                    <p className="text-xs font-bold text-slate-900">Show in Mobile App (Active)</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Students can pick this industry when starting an interview.</p>
                  </div>
                  <div className="relative inline-flex shrink-0 items-center">
                    <input
                      type="checkbox"
                      checked={formState.is_active}
                      onChange={(e) => setFormState((prev) => ({ ...prev, is_active: e.target.checked }))}
                      className="peer sr-only"
                    />
                    <div className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-sky-600 peer-focus:ring-4 peer-focus:ring-sky-500/20" />
                    <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                  </div>
                </label>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2.5 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-500/25 transition hover:shadow-sky-500/40 disabled:opacity-60"
                >
                  {saving ? "Saving..." : editing ? "Save Changes" : "Add Industry"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </section>
  );
}
