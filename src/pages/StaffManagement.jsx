import { useEffect, useMemo, useState } from "react";
import { FaEdit, FaPlus, FaSearch, FaTrash } from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

const initialForm = { full_name: "", email: "", department: "", position: "" };
const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

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
      const { data, error } = await supabase.from("staff").select("*").order("full_name");
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
    });
    setErrorMessage("");
  }

  function resetForm() {
    setEditing(null);
    setForm(initialForm);
  }

  async function saveStaff(event) {
    event.preventDefault();
    if (!editing && !form.email.trim()) {
      setErrorMessage("An email address is required to send the staff account invitation.");
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
    };
    try {
      let data;
      if (editing) {
        const result = await supabase
          .from("staff")
          .update(payload)
          .eq("id", editing.id)
          .select()
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
        if (!result?.staff) throw new Error("The staff account was created without a staff profile.");
        data = result.staff;
      }

      setStaff((rows) => editing
        ? rows.map((row) => row.id === data.id ? data : row)
        : [...rows, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setMessage(editing
        ? "Staff profile updated."
        : "Staff account created and an invitation email was sent.");
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
      <div className="float-orb orb-one" /><div className="float-orb orb-two" /><div className="float-orb orb-three" />
      <AdminSidebar />
      <main className="relative ml-20 flex max-w-7xl flex-col gap-6 px-4 py-8 md:ml-64 lg:px-8">
        <section className="glass-card rounded-[2rem] border border-white/70 p-8 shadow-xl ring-1 ring-sky-100/80">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-sky-700">Administration</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Staff Management</h1>
          <p className="mt-3 text-slate-600">Maintain staff profiles and assign supervisors for OJT placements.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="stat-card rounded-2xl bg-white/80 p-5 ring-1 ring-sky-100"><p className="text-sm uppercase text-slate-500">Total staff</p><p className="mt-2 text-3xl font-semibold">{staff.length}</p></div>
            <div className="stat-card rounded-2xl bg-white/80 p-5 ring-1 ring-sky-100"><p className="text-sm uppercase text-slate-500">Departments</p><p className="mt-2 text-3xl font-semibold text-emerald-700">{new Set(staff.map((item) => item.department).filter(Boolean)).size}</p></div>
          </div>
        </section>

        {(errorMessage || message) && <p role="status" className={`rounded-2xl border p-4 text-sm ${errorMessage ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{errorMessage || message}</p>}

        <section className="glass-card rounded-[2rem] border border-white/70 p-6 shadow-xl ring-1 ring-sky-100/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-2xl font-semibold">{editing ? "Edit staff member" : "Add staff member"}</h2><p className="mt-1 text-sm text-slate-500">{editing ? "Update the staff profile details." : "Create a login account and send an invitation by email."}</p></div>
            {editing && <button type="button" onClick={resetForm} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold">Cancel</button>}
          </div>
          <form onSubmit={saveStaff} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium">Full name *<input className={`${inputClass} mt-2`} required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
            <label className="text-sm font-medium">Email{!editing && " *"}<input className={`${inputClass} mt-2`} type="email" required={!editing} readOnly={Boolean(editing)} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="text-sm font-medium">Position<input className={`${inputClass} mt-2`} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></label>
            <label className="text-sm font-medium">Department<input className={`${inputClass} mt-2`} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
            <div className="sm:col-span-2 lg:col-span-4"><button disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"><FaPlus />{saving ? "Saving..." : editing ? "Save changes" : "Create account and invite"}</button></div>
          </form>
        </section>

        <section className="glass-card overflow-hidden rounded-[2rem] border border-white/70 shadow-xl ring-1 ring-sky-100/80">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-2xl font-semibold">Staff directory</h2><p className="mt-1 text-sm text-slate-500">{filtered.length} matching profiles</p></div>
            <div className="relative w-full sm:max-w-sm"><FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-11`} placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Full name", "Email", "Position", "Department", "Actions"].map((heading) => <th key={heading} className="px-5 py-4">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="5" className="px-5 py-12 text-center text-slate-500">Loading staff...</td></tr> : filtered.length === 0 ? <tr><td colSpan="5" className="px-5 py-12 text-center text-slate-500">No staff profiles found.</td></tr> : filtered.map((person) => (
                <tr key={person.id} className="hover:bg-sky-50/50"><td className="px-5 py-4 font-semibold">{person.full_name}</td><td className="px-5 py-4">{person.email || "—"}</td><td className="px-5 py-4">{person.position || "—"}</td><td className="px-5 py-4">{person.department || "—"}</td><td className="px-5 py-4"><div className="flex gap-2"><button type="button" aria-label={`Edit ${person.full_name}`} onClick={() => editStaff(person)} className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><FaEdit /></button><button type="button" aria-label={`Delete ${person.full_name}`} onClick={() => deleteStaff(person)} className="rounded-xl bg-rose-50 p-2.5 text-rose-700"><FaTrash /></button></div></td></tr>
              ))}
            </tbody>
          </table></div>
        </section>
      </main>
    </div>
  );
}

export default StaffManagement;
