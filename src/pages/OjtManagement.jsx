import { useEffect, useMemo, useState } from "react";
import { FaEdit, FaPlus, FaSearch, FaTrash } from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

const blankRecord = { student_name: "", student_number: "", course: "", company_name: "" };
const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function OjtManagement() {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(blankRecord);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadRecords() {
      const { data, error } = await supabase
        .from("ojt_records")
        .select("*")
        .order("student_name");

      if (error) {
        console.error("Unable to load OJT records:", error);
        setErrorMessage(`Unable to load OJT records: ${error.message}`);
      } else {
        setRecords(data || []);
      }
      setLoading(false);
    }

    loadRecords();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) =>
      [record.student_name, record.student_number, record.course, record.company_name]
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [records, search]);

  function startNew() {
    setForm(blankRecord);
    setEditing(null);
    setFormOpen(true);
    setMessage("");
    setErrorMessage("");
  }

  function startEdit(record) {
    setForm({
      student_name: record.student_name || "",
      student_number: record.student_number || "",
      course: record.course || "",
      company_name: record.company_name || "",
    });
    setEditing(record);
    setFormOpen(true);
    setMessage("");
    setErrorMessage("");
  }

  function closeForm() {
    setForm(blankRecord);
    setEditing(null);
    setFormOpen(false);
  }

  async function saveRecord(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const payload = {
      student_name: form.student_name.trim(),
      student_number: form.student_number.trim(),
      course: form.course.trim(),
      company_name: form.company_name.trim(),
    };
    const query = editing
      ? supabase.from("ojt_records").update(payload).eq("id", editing.id).select().single()
      : supabase.from("ojt_records").insert(payload).select().single();
    const { data, error } = await query;

    if (error) {
      console.error("Unable to save OJT record:", error);
      setErrorMessage(`Unable to save OJT record: ${error.message}`);
      setSaving(false);
      return;
    }

    setRecords((rows) => editing
      ? rows.map((row) => row.id === data.id ? data : row)
      : [...rows, data].sort((a, b) => a.student_name.localeCompare(b.student_name)));
    setForm(blankRecord);
    setEditing(null);
    setFormOpen(false);
    setMessage(editing ? "OJT record updated." : "OJT record added.");
    setSaving(false);
  }

  async function deleteRecord(record) {
    if (!window.confirm(`Delete the OJT record for ${record.student_name}?`)) return;
    const { error } = await supabase.from("ojt_records").delete().eq("id", record.id);
    if (error) {
      console.error("Unable to delete OJT record:", error);
      setErrorMessage(`Unable to delete OJT record: ${error.message}`);
      return;
    }
    setRecords((rows) => rows.filter((row) => row.id !== record.id));
    if (editing?.id === record.id) {
      setEditing(null);
      setForm(blankRecord);
      setFormOpen(false);
    }
    setMessage("OJT record deleted.");
  }

  const distinctCourses = new Set(records.map((record) => record.course).filter(Boolean)).size;
  const distinctCompanies = new Set(records.map((record) => record.company_name).filter(Boolean)).size;

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" /><div className="float-orb orb-two" /><div className="float-orb orb-three" />
      <AdminSidebar />
      <main className="relative ml-20 flex max-w-7xl flex-col gap-6 px-4 py-8 md:ml-64 lg:px-8">
        <section className="glass-card rounded-[2rem] border border-white/70 p-8 shadow-xl ring-1 ring-sky-100/80">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-sky-700">Administration</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">OJT Management</h1>
          <p className="mt-3 text-slate-600">Manage trainee records using the fields in your Supabase OJT table.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["Total trainees", records.length],
              ["Courses", distinctCourses],
              ["Companies", distinctCompanies],
            ].map(([label, count]) => (
              <div key={label} className="stat-card rounded-2xl bg-white/80 p-5 ring-1 ring-sky-100">
                <p className="text-sm uppercase text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-semibold">{count}</p>
              </div>
            ))}
          </div>
        </section>

        {(errorMessage || message) && (
          <p role="status" className={`rounded-2xl border p-4 text-sm ${errorMessage ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {errorMessage || message}
          </p>
        )}

        <section className="glass-card rounded-[2rem] border border-white/70 p-6 shadow-xl ring-1 ring-sky-100/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">{editing ? "Edit OJT trainee" : "OJT trainee records"}</h2>
              <p className="mt-1 text-sm text-slate-500">Student name, student number, course, and company.</p>
            </div>
            {formOpen ? (
              <button type="button" onClick={closeForm} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
            ) : (
              <button type="button" onClick={startNew} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white">
                <FaPlus /> Add OJT trainee
              </button>
            )}
          </div>
          {formOpen && (
            <form onSubmit={saveRecord} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-medium">
                Student name *
                <input required className={`${inputClass} mt-2`} value={form.student_name} onChange={(event) => setForm({ ...form, student_name: event.target.value })} />
              </label>
              <label className="text-sm font-medium">
                Student number
                <input className={`${inputClass} mt-2`} value={form.student_number} onChange={(event) => setForm({ ...form, student_number: event.target.value })} />
              </label>
              <label className="text-sm font-medium">
                Course
                <input className={`${inputClass} mt-2`} value={form.course} onChange={(event) => setForm({ ...form, course: event.target.value })} />
              </label>
              <label className="text-sm font-medium">
                Company name
                <input className={`${inputClass} mt-2`} value={form.company_name} onChange={(event) => setForm({ ...form, company_name: event.target.value })} />
              </label>
              <div className="sm:col-span-2 lg:col-span-4">
                <button disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  <FaPlus />{saving ? "Saving..." : editing ? "Save changes" : "Add trainee"}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="glass-card overflow-hidden rounded-[2rem] border border-white/70 shadow-xl ring-1 ring-sky-100/80">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">OJT records</h2>
              <p className="mt-1 text-sm text-slate-500">{filtered.length} matching records</p>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-11`} placeholder="Search records..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>{["Student name", "Student number", "Course", "Company", "Actions"].map((heading) => <th key={heading} className="px-5 py-4">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="5" className="px-5 py-12 text-center text-slate-500">Loading OJT records...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan="5" className="px-5 py-12 text-center text-slate-500">No OJT records found.</td></tr>
                ) : filtered.map((record) => (
                  <tr key={record.id} className="hover:bg-sky-50/50">
                    <td className="px-5 py-4 font-semibold">{record.student_name}</td>
                    <td className="px-5 py-4">{record.student_number || "—"}</td>
                    <td className="px-5 py-4">{record.course || "—"}</td>
                    <td className="px-5 py-4">{record.company_name || "—"}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button type="button" aria-label={`Edit ${record.student_name}`} onClick={() => startEdit(record)} className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><FaEdit /></button>
                        <button type="button" aria-label={`Delete ${record.student_name}`} onClick={() => deleteRecord(record)} className="rounded-xl bg-rose-50 p-2.5 text-rose-700"><FaTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default OjtManagement;
