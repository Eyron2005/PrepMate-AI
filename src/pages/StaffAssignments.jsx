import { useCallback, useEffect, useState } from "react";
import { FaTrash } from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

function StaffAssignments() {
  const [staff, setStaff] = useState([]);
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [staffId, setStaffId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const [staffResult, studentResult, assignmentResult] = await Promise.all([
      supabase.from("staff").select("id, full_name, department, is_active").order("full_name"),
      supabase.from("profiles").select("id, auth_user_id, full_name").order("full_name"),
      supabase.from("staff_student_assignments").select("id, staff_id, student_user_id, created_at"),
    ]);

    const failed = [staffResult, studentResult, assignmentResult].find((result) => result.error);
    if (failed) {
      console.error("Unable to load staff assignments:", failed.error);
      setErrorMessage(`Unable to load assignments: ${failed.error.message}`);
    } else {
      setStaff(staffResult.data || []);
      setStudents((studentResult.data || []).map((profile) => ({
        userId: profile.auth_user_id || profile.id,
        name: profile.full_name || "Unnamed student",
      })).filter((profile) => profile.userId));
      setAssignments(assignmentResult.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => loadAssignments());
    return () => cancelAnimationFrame(frameId);
  }, [loadAssignments]);

  async function addAssignment(event) {
    event.preventDefault();
    if (!staffId || !studentId) return;

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      const error = userError || new Error("No authenticated admin session.");
      console.error("Unable to identify assigning administrator:", error);
      setErrorMessage(`Unable to assign student: ${error.message}`);
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("staff_student_assignments").insert({
      staff_id: staffId,
      student_user_id: studentId,
      assigned_by: userData.user.id,
    });
    if (error) {
      console.error("Unable to assign student:", error);
      setErrorMessage(`Unable to assign student: ${error.message}`);
    } else {
      setSuccessMessage("Student assigned to staff.");
      await loadAssignments();
    }
    setSaving(false);
  }

  async function removeAssignment(assignment) {
    if (!window.confirm("Remove this student assignment?")) return;
    setErrorMessage("");
    setSuccessMessage("");
    const { error } = await supabase.from("staff_student_assignments").delete().eq("id", assignment.id);
    if (error) {
      console.error("Unable to remove student assignment:", error);
      setErrorMessage(`Unable to remove assignment: ${error.message}`);
      return;
    }
    setAssignments((rows) => rows.filter((row) => row.id !== assignment.id));
    setSuccessMessage("Student assignment removed.");
  }

  const staffNames = Object.fromEntries(staff.map((person) => [person.id, person.full_name]));
  const studentNames = Object.fromEntries(students.map((student) => [student.userId, student.name]));

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" /><div className="float-orb orb-two" /><div className="float-orb orb-three" />
      <AdminSidebar />
      <main className="relative ml-20 flex max-w-7xl flex-col gap-6 px-4 py-8 md:ml-64 md:px-8">
        <section className="glass-card rounded-[2rem] border border-white/70 p-8 shadow-xl ring-1 ring-sky-100/80">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-sky-700">Administration</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Staff Assignments</h1>
          <p className="mt-3 text-slate-600">Assign students to staff to control access to student profiles and interview results.</p>
        </section>

        {(errorMessage || successMessage) && (
          <p role="status" className={`rounded-2xl border p-4 text-sm ${errorMessage ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {errorMessage || successMessage}
          </p>
        )}

        <section className="glass-card rounded-[2rem] border border-white/70 p-6 shadow-xl ring-1 ring-sky-100/80">
          <h2 className="text-2xl font-semibold">Assign a student</h2>
          <form onSubmit={addAssignment} className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-sm font-medium">
              Staff member
              <select required value={staffId} onChange={(event) => setStaffId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <option value="">Select staff</option>
                {staff.filter((person) => person.is_active !== false).map((person) => (
                  <option key={person.id} value={person.id}>{person.full_name}{person.department ? ` — ${person.department}` : ""}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Student
              <select required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <option value="">Select student</option>
                {students.map((student) => (
                  <option key={student.userId} value={student.userId}>{student.name}</option>
                ))}
              </select>
            </label>
            <button disabled={saving || loading} className="self-end rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Assigning..." : "Assign student"}
            </button>
          </form>
          {staff.length === 0 && !loading && <p className="mt-4 text-sm text-amber-700">Add an active staff account before assigning students.</p>}
          {students.length === 0 && !loading && <p className="mt-2 text-sm text-amber-700">No student profiles are available to assign.</p>}
        </section>

        <section className="glass-card overflow-hidden rounded-[2rem] border border-white/70 shadow-xl ring-1 ring-sky-100/80">
          <div className="p-6">
            <h2 className="text-2xl font-semibold">Current assignments</h2>
            <p className="mt-1 text-sm text-slate-500">{assignments.length} student assignments</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>{["Staff member", "Student", "Assigned", "Actions"].map((heading) => <th key={heading} className="px-5 py-4">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="4" className="px-5 py-12 text-center text-slate-500">Loading assignments...</td></tr>
                ) : errorMessage ? null : assignments.length === 0 ? (
                  <tr><td colSpan="4" className="px-5 py-12 text-center text-slate-500">No student assignments yet.</td></tr>
                ) : assignments.map((assignment) => (
                  <tr key={assignment.id} className="hover:bg-sky-50/50">
                    <td className="px-5 py-4 font-semibold">{staffNames[assignment.staff_id] || "Staff account"}</td>
                    <td className="px-5 py-4">{studentNames[assignment.student_user_id] || "Student account"}</td>
                    <td className="px-5 py-4">{assignment.created_at ? new Date(assignment.created_at).toLocaleDateString() : "—"}</td>
                    <td className="px-5 py-4">
                      <button type="button" aria-label="Remove assignment" onClick={() => removeAssignment(assignment)} className="rounded-xl bg-rose-50 p-2.5 text-rose-700">
                        <FaTrash />
                      </button>
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

export default StaffAssignments;
