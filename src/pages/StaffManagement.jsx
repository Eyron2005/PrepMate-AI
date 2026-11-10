import { useEffect, useMemo, useState } from "react";
import { FaEdit, FaPlus, FaSearch, FaTrash, FaUserTie, FaBuilding, FaBriefcase, FaEnvelope, FaUser, FaCheck, FaExclamationTriangle } from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

const initialForm = { full_name: "", email: "", department: "", position: "", can_email_unassigned_students: false };
const inputClass = "w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15";

function getInitials(name) {
  if (!name) return "S";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadStaff() {
      const { data, error } = await supabase
        .from("staff")
        .select("id, full_name, email, department, position, can_email_unassigned_students")
        .order("full_name");
      if (error) {
        console.error("Unable to load staff:", error);
        setErrorMessage(`Unable to load staff: ${error.message}`);
      } else {
        setStaff(data || []);
      }
      setLoading(false);
    }
    loadStaff();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return staff;
    return staff.filter((person) =>
      [person.full_name, person.email, person.department, person.position]
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [search, staff]);

  function editStaff(person) {
    setEditing(person);
    setForm({
      full_name: person.full_name || "",
      email: person.email || "",
      department: person.department || "",
      position: person.position || "",
      can_email_unassigned_students: Boolean(person.can_email_unassigned_students),
    });
    setErrorMessage("");
  }

  function resetForm() {
    setEditing(null);
    setForm(initialForm);
  }

  async function saveStaff(event) {
    event.preventDefault();
    if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setErrorMessage("Enter a valid email address to send the staff invitation.");
      return;
    }
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      department: form.department.trim() || null,
      position: form.position.trim() || null,
      ...(editing ? { can_email_unassigned_students: Boolean(form.can_email_unassigned_students) } : {}),
    };
    try {
      let data;
      if (editing) {
        const result = await supabase
          .from("staff")
          .update(payload)
          .eq("id", editing.id)
          .select("id, full_name, email, department, position, can_email_unassigned_students")
          .single();
        if (result.error) throw result.error;
        data = result.data;
      } else {
        const { data: result, error } = await supabase.functions.invoke("create-staff-account", {
          body: payload,
        });
        if (error) {
          const response = error.context;
          if (response instanceof Response) {
            const details = await response.json();
            throw new Error(details.error || error.message);
          }
          throw error;
        }
        if (!result?.staff) throw new Error("The invitation was sent without a pending staff profile.");
        data = result.staff;
      }

      setStaff((rows) => editing
        ? rows.map((row) => row.id === data.id ? data : row)
        : [...rows, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setMessage(editing
        ? "Staff profile updated successfully."
        : "Staff invitation sent. Staff access will be enabled after the recipient accepts it.");
      resetForm();
    } catch (error) {
      console.error("Unable to save staff:", error);
      const detail = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Unable to save staff: ${detail}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteStaff(person) {
    if (!window.confirm(`Delete ${person.full_name}'s staff profile? Linked OJT supervisor assignments will be cleared. Their login account will remain.`)) return;
    const { error } = await supabase.from("staff").delete().eq("id", person.id);
    if (error) {
      console.error("Unable to delete staff:", error);
      setErrorMessage(`Unable to delete staff: ${error.message}`);
      return;
    }
    setStaff((rows) => rows.filter((row) => row.id !== person.id));
    if (editing?.id === person.id) resetForm();
    setMessage("Staff profile deleted. The login account was not deleted.");
  }

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar />

      <main className="relative ml-20 flex max-w-7xl flex-col gap-8 px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Banner Hero */}
        <section className="glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-slate-200 p-7 shadow-sm fade-in-up sm:p-9">
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-indigo-800 shadow-sm">
              <FaUserTie className="text-[11px]" />
              Staff Accounts
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              Staff Management
            </h1>
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Invite staff members, set their departments and roles, and manage their access.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="relative mt-8 grid gap-4 sm:grid-cols-2">
            <div className="stat-card rounded-[1.75rem] border border-violet-200 bg-violet-50 p-6 shadow-xs">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-800">Total Staff</p>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">{staff.length}</p>
              <p className="mt-1 text-xs text-slate-500">Active staff members</p>
            </div>
            <div className="stat-card rounded-[1.75rem] border border-sky-200 bg-sky-50 p-6 shadow-xs">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-800">Departments</p>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">
                {new Set(staff.map((item) => item.department).filter(Boolean)).size}
              </p>
              <p className="mt-1 text-xs text-slate-500">Departments added</p>
            </div>
          </div>
        </section>

        {/* Notifications */}
        {(errorMessage || message) && (
          <div
            role="status"
            className={`flex items-center gap-3 rounded-2xl border p-4 text-xs font-bold shadow-sm ${
              errorMessage
                ? "border-rose-200 bg-rose-50/90 text-rose-800"
                : "border-emerald-200 bg-emerald-50/90 text-emerald-800"
            }`}
          >
            {errorMessage ? <FaExclamationTriangle className="text-sm shrink-0" /> : <FaCheck className="text-sm shrink-0" />}
            <span>{errorMessage || message}</span>
          </div>
        )}

        {/* Form Card */}
        <section className="glass-card rounded-[2.25rem] border border-slate-200 p-6 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-700">Staff Details</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">
                {editing ? `Editing: ${editing.full_name}` : "Invite Staff Member"}
              </h2>
            </div>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={saveStaff} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                <span className="flex items-center gap-1.5"><FaUser className="text-[10px] text-slate-400" /> Full Name *</span>
              </label>
              <input
                className={inputClass}
                required
                placeholder="Dr. Eleanor Vance"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                <span className="flex items-center gap-1.5"><FaEnvelope className="text-[10px] text-slate-400" /> Email Address{!editing && " *"}</span>
              </label>
              <input
                className={inputClass}
                type="email"
                required={!editing}
                readOnly={Boolean(editing)}
                placeholder="eleanor@university.edu"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                <span className="flex items-center gap-1.5"><FaBriefcase className="text-[10px] text-slate-400" /> Position / Title</span>
              </label>
              <input
                className={inputClass}
                placeholder="OJT Coordinator"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                <span className="flex items-center gap-1.5"><FaBuilding className="text-[10px] text-slate-400" /> Department</span>
              </label>
              <input
                className={inputClass}
                placeholder="Computer Studies"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>

            {editing && (
              <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-sky-200/80 bg-sky-50/60 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-900">Allow emailing unassigned students</p>
                  <p className="text-[11px] text-slate-600">
                    When disabled (default), this staff supervisor can only email students assigned to them.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-sky-900">
                  <input
                    type="checkbox"
                    checked={Boolean(form.can_email_unassigned_students)}
                    onChange={(e) =>
                      setForm({ ...form, can_email_unassigned_students: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>{form.can_email_unassigned_students ? "Authorized" : "Assigned Only"}</span>
                </label>
              </div>
            )}

            <div className="sm:col-span-2 lg:col-span-4 mt-2">
              <button
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-500/30 transition hover:shadow-sky-500/50 disabled:opacity-60"
              >
                <FaPlus className="text-xs" />
                <span>{saving ? "Processing..." : editing ? "Save Profile Changes" : "Send Staff Invitation"}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Directory Table */}
        <section className="glass-card overflow-hidden rounded-[2.25rem] border border-slate-200 p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Staff Directory</h2>
              <p className="mt-1 text-xs text-slate-500">{filtered.length} matching staff profiles</p>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 pl-10 pr-4 py-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                placeholder="Search staff members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs text-slate-700">
                <thead className="bg-slate-50/90 text-left uppercase tracking-wider text-[11px] font-bold text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Staff Member</th>
                    <th className="px-4 py-3.5">Email</th>
                    <th className="px-4 py-3.5">Position</th>
                    <th className="px-4 py-3.5">Department</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="px-5 py-12 text-center text-slate-400">Loading staff records...</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-5 py-12 text-center text-slate-400">No staff profiles found.</td>
                    </tr>
                  ) : (
                    filtered.map((person) => (
                      <tr key={person.id} className="transition-colors hover:bg-sky-50/50">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-bold text-white shadow-sm">
                              {getInitials(person.full_name)}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">{person.full_name}</span>
                              {person.can_email_unassigned_students && (
                                <span className="mt-0.5 block w-fit rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                                  Can email all students
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{person.email || "—"}</td>
                        <td className="px-4 py-3.5">
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {person.position || "Staff"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded-lg bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200/70">
                            {person.department || "General"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={`Edit ${person.full_name}`}
                              onClick={() => editStaff(person)}
                              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-sky-50 hover:text-sky-800"
                              title="Edit Staff Member"
                            >
                              <FaEdit className="text-xs" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${person.full_name}`}
                              onClick={() => deleteStaff(person)}
                              className="rounded-xl bg-rose-50 p-2 text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                              title="Delete Staff Member"
                            >
                              <FaTrash className="text-xs" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default StaffManagement;
