import { useEffect, useMemo, useState } from "react";
import { FaSearch } from "react-icons/fa";
import StaffSidebar from "../components/StaffSidebar";
import { supabase } from "../services/supabase";

function StaffStudentRecords() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadStudents() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, auth_user_id, full_name, created_at, last_online")
        .order("full_name");

      if (!active) return;
      if (error) {
        console.error("Unable to load assigned student records:", error);
        setErrorMessage(`Unable to load student records: ${error.message}`);
      } else {
        setStudents(data || []);
      }
      setLoading(false);
    }

    loadStudents();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      [student.full_name, student.id, student.auth_user_id]
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [search, students]);

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" /><div className="float-orb orb-two" /><div className="float-orb orb-three" />
      <StaffSidebar />
      <main className="relative ml-20 flex max-w-7xl flex-col gap-6 px-4 py-8 md:ml-64 md:px-8">
        <section className="glass-card rounded-[2rem] border border-white/70 p-8 shadow-xl ring-1 ring-sky-100/80">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-sky-700">Staff Workspace</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Assigned Student Records</h1>
          <p className="mt-3 text-slate-600">Only students assigned to your account are shown.</p>
        </section>

        {errorMessage && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{errorMessage}</p>}

        <section className="glass-card overflow-hidden rounded-[2rem] border border-white/70 shadow-xl ring-1 ring-sky-100/80">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Student records</h2>
              <p className="mt-1 text-sm text-slate-500">{filtered.length} assigned students</p>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Search students..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {["Student name", "Student ID", "Added", "Last online"].map((heading) => (
                    <th key={heading} className="px-5 py-4">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="4" className="px-5 py-12 text-center text-slate-500">Loading student records...</td></tr>
                ) : errorMessage ? null : filtered.length === 0 ? (
                  <tr><td colSpan="4" className="px-5 py-12 text-center text-slate-500">No students are assigned to you yet.</td></tr>
                ) : filtered.map((student) => (
                  <tr key={student.id} className="hover:bg-sky-50/50">
                    <td className="px-5 py-4 font-semibold">{student.full_name || "Unnamed student"}</td>
                    <td className="px-5 py-4">{student.auth_user_id || student.id}</td>
                    <td className="px-5 py-4">{student.created_at ? new Date(student.created_at).toLocaleDateString() : "—"}</td>
                    <td className="px-5 py-4">{student.last_online ? new Date(student.last_online).toLocaleString() : "—"}</td>
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

export default StaffStudentRecords;
