import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaTrash,
  FaPlus,
  FaSearch,
  FaTimes,
  FaSyncAlt,
  FaUserTie,
  FaUserGraduate,
  FaCalendarAlt,
  FaCheck,
  FaExclamationTriangle,
  FaLink,
  FaShieldAlt,
  FaUsers,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

function getInitials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function StaffAssignments() {
  const [mounted, setMounted] = useState(false);
  const [staff, setStaff] = useState([]);
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [staffId, setStaffId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const loadAssignments = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage("");

    try {
      const [staffResult, studentResult, assignmentResult] = await Promise.all([
        supabase
          .from("staff")
          .select("id, full_name, department, is_active")
          .order("full_name"),
        supabase
          .from("profiles")
          .select("id, auth_user_id, full_name, email")
          .order("full_name"),
        supabase
          .from("staff_student_assignments")
          .select("id, staff_id, student_user_id, created_at")
          .order("created_at", { ascending: false }),
      ]);

      const failed = [staffResult, studentResult, assignmentResult].find(
        (result) => result.error
      );
      if (failed) {
        throw failed.error;
      }

      setStaff(staffResult.data || []);
      setStudents(
        (studentResult.data || [])
          .map((profile) => ({
            userId: profile.auth_user_id || profile.id,
            name: profile.full_name || "Unnamed student",
            email: profile.email || "",
          }))
          .filter((profile) => profile.userId)
      );
      setAssignments(assignmentResult.data || []);
    } catch (err) {
      console.error("Unable to load staff assignments:", err);
      setErrorMessage(`Unable to load assignments: ${err.message || "Network error"}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      loadAssignments();
    });
    return () => cancelAnimationFrame(frameId);
  }, [loadAssignments]);

  async function addAssignment(event) {
    event.preventDefault();
    if (!staffId || !studentId) return;

    // Check if duplicate assignment exists locally
    const alreadyAssigned = assignments.some(
      (a) => a.staff_id === staffId && a.student_user_id === studentId
    );
    if (alreadyAssigned) {
      setErrorMessage("This candidate is already assigned to the selected staff supervisor.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw userError || new Error("No authenticated admin session found.");
      }

      const { error } = await supabase.from("staff_student_assignments").insert({
        staff_id: staffId,
        student_user_id: studentId,
        assigned_by: userData.user.id,
      });

      if (error) {
        if (error.code === "23505") {
          throw new Error("This candidate is already assigned to this supervisor.");
        }
        throw error;
      }

      setSuccessMessage("Student successfully assigned to staff supervisor.");
      setStudentId("");
      await loadAssignments(true);
    } catch (err) {
      console.error("Unable to assign student:", err);
      setErrorMessage(`Failed to create assignment: ${err.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmRemove() {
    if (!removeTarget) return;

    setActionLoading(true);
    setErrorMessage("");

    try {
      const { error } = await supabase
        .from("staff_student_assignments")
        .delete()
        .eq("id", removeTarget.id);

      if (error) throw error;

      setAssignments((rows) => rows.filter((row) => row.id !== removeTarget.id));
      setRemoveTarget(null);
      setSuccessMessage("Student assignment successfully removed.");
    } catch (err) {
      console.error("Unable to remove student assignment:", err);
      setErrorMessage(`Failed to remove assignment: ${err.message || "Unknown error"}`);
    } finally {
      setActionLoading(false);
    }
  }

  const staffMap = useMemo(() => {
    return new Map(staff.map((person) => [person.id, person]));
  }, [staff]);

  const studentMap = useMemo(() => {
    return new Map(students.map((student) => [student.userId, student]));
  }, [students]);

  const studentNames = useMemo(() => {
    return Object.fromEntries(students.map((student) => [student.userId, student.name]));
  }, [students]);

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    let result = assignments;

    if (staffFilter !== "all") {
      result = result.filter((a) => a.staff_id === staffFilter);
    }

    if (searchTerm.trim()) {
      const query = searchTerm.trim().toLowerCase();
      result = result.filter((a) => {
        const staffObj = staffMap.get(a.staff_id);
        const studentObj = studentMap.get(a.student_user_id);
        const staffName = staffObj?.full_name?.toLowerCase() || "";
        const studentName = (studentObj?.name || "").toLowerCase();
        const studentEmail = (studentObj?.email || "").toLowerCase();
        const dept = staffObj?.department?.toLowerCase() || "";
        return (
          staffName.includes(query) ||
          studentName.includes(query) ||
          studentEmail.includes(query) ||
          dept.includes(query)
        );
      });
    }

    return result;
  }, [assignments, staffFilter, searchTerm, staffMap, studentMap]);

  // Statistics
  const activeStaffCount = useMemo(() => {
    return new Set(assignments.map((a) => a.staff_id)).size;
  }, [assignments]);

  const assignedStudentsCount = useMemo(() => {
    return new Set(assignments.map((a) => a.student_user_id)).size;
  }, [assignments]);

  const unassignedStudentsCount = useMemo(() => {
    const assignedSet = new Set(assignments.map((a) => a.student_user_id));
    return Math.max(0, students.filter((s) => !assignedSet.has(s.userId)).length);
  }, [assignments, students]);

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar />

      <main className="relative ml-20 flex max-w-7xl flex-col gap-8 px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Banner Hero */}
        <section
          className={`glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-slate-200 p-7 shadow-sm transition-all duration-700 sm:p-9 ${
            mounted ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
          }`}
        >
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-sky-800 shadow-sm">
                <FaUserGraduate className="text-sky-600 text-[11px]" />
                Assign Students
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Staff Assignments
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Pair students with staff advisors so staff can see their progress, interview results, and readiness scores.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadAssignments(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-sky-200/80 bg-white/80 px-4 py-2.5 text-xs font-bold text-sky-700 shadow-sm transition hover:bg-sky-50 hover:shadow disabled:opacity-50"
            >
              <FaSyncAlt className={`text-xs ${refreshing || loading ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Refreshing..." : "Refresh List"}</span>
            </button>
          </div>

          {/* Metric Cards Bar */}
          <div className="relative mt-8 grid gap-4 sm:grid-cols-4">
            {/* Total Assignments */}
            <div
              className={`stat-card rounded-[1.75rem] bg-blue-600 p-5 text-white shadow-xs transition duration-500 ${
                mounted ? "scale-100" : "scale-95"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-100">Total Assignments</p>
                <span className="rounded-full bg-blue-700 px-2 py-0.5 text-[10px] font-extrabold text-white">ALL</span>
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight">{assignments.length}</p>
              <p className="mt-1.5 text-xs text-sky-100/90">Active student-supervisor links</p>
            </div>

            {/* Active Supervisors */}
            <div
              className={`stat-card rounded-[1.75rem] border border-indigo-200 bg-indigo-50 p-5 shadow-xs transition duration-500 ${
                mounted ? "scale-100" : "scale-95"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-800">Supervisors</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold text-indigo-800">
                  <FaUserTie className="text-[10px]" /> ACTIVE
                </span>
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{activeStaffCount}</p>
              <p className="mt-1.5 text-xs text-slate-500">Staff with assigned students</p>
            </div>

            {/* Assigned Students */}
            <div
              className={`stat-card rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-5 shadow-xs transition duration-500 ${
                mounted ? "scale-100" : "scale-95"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-800">Assigned</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                  <FaLink className="text-[10px]" /> LINKED
                </span>
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{assignedStudentsCount}</p>
              <p className="mt-1.5 text-xs text-slate-500">Students assigned to staff</p>
            </div>

            {/* Unassigned Students Pool */}
            <div
              className={`stat-card rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5 shadow-xs transition duration-500 ${
                mounted ? "scale-100" : "scale-95"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800">Not Assigned</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                  <FaUsers className="text-[10px]" /> WAITING
                </span>
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{unassignedStudentsCount}</p>
              <p className="mt-1.5 text-xs text-slate-500">Students without a staff advisor</p>
            </div>
          </div>
        </section>

        {/* Notifications */}
        {(errorMessage || successMessage) && (
          <div
            role="status"
            className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-xs font-bold shadow-sm ${
              errorMessage
                ? "border-rose-200 bg-rose-50/90 text-rose-800"
                : "border-emerald-200 bg-emerald-50/90 text-emerald-800"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {errorMessage ? (
                <FaExclamationTriangle className="text-base shrink-0 text-rose-600" />
              ) : (
                <FaCheck className="text-base shrink-0 text-emerald-600" />
              )}
              <span>{errorMessage || successMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className="text-slate-400 hover:text-slate-700"
            >
              <FaTimes className="text-xs" />
            </button>
          </div>
        )}

        {/* Assign a Student Form Section */}
        <section className="glass-card rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.4)] ring-1 ring-sky-100/90 sm:p-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">
                <FaLink className="text-[10px]" /> Assign Student
              </span>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Pair a Student with a Staff Member</h2>
            </div>
            <span className="rounded-xl bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800 ring-1 ring-sky-200/60">
              New Assignment
            </span>
          </div>

          <form onSubmit={addAssignment} className="mt-6 grid gap-5 sm:grid-cols-[1fr_1fr_auto]">
            {/* Staff Supervisor Select */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                <span className="flex items-center gap-1.5">
                  <FaUserTie className="text-[11px] text-sky-600" /> Staff Supervisor *
                </span>
              </label>
              <select
                required
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-xs text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
              >
                <option value="">Select staff supervisor...</option>
                {staff
                  .filter((person) => person.is_active !== false)
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                      {person.department ? ` (${person.department})` : ""}
                    </option>
                  ))}
              </select>
            </div>

            {/* Student Candidate Select */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                <span className="flex items-center gap-1.5">
                  <FaUserGraduate className="text-[11px] text-indigo-600" /> Student Candidate *
                </span>
              </label>
              <select
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-xs text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
              >
                <option value="">Select candidate...</option>
                {students.map((student) => (
                  <option key={student.userId} value={student.userId}>
                    {student.name}
                    {student.email ? ` (${student.email})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Submit Button */}
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving || loading || !staffId || !studentId}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-xs font-bold text-white shadow-md shadow-sky-600/30 transition hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
              >
                {saving ? (
                  <>
                    <FaSyncAlt className="animate-spin text-xs" />
                    <span>Assigning...</span>
                  </>
                ) : (
                  <>
                    <FaPlus className="text-xs" />
                    <span>Assign Student</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {staff.length === 0 && !loading && (
            <p className="mt-4 text-xs font-semibold text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
              No active staff supervisors found. Add a staff supervisor in Staff Management first.
            </p>
          )}
          {students.length === 0 && !loading && (
            <p className="mt-3 text-xs font-semibold text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
              No students found yet.
            </p>
          )}
        </section>

        {/* Current Assignments Table Card */}
        <section className="glass-card rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.4)] ring-1 ring-sky-100/90 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FaShieldAlt className="text-sky-600 text-sm" />
                <h2 className="text-xl font-bold text-slate-950">Current Assignments</h2>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Search, view, or remove student-to-staff assignments.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full max-w-xs">
              <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search staff or student..."
                className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 pl-10 pr-9 py-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <FaTimes className="text-xs" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStaffFilter("all")}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  staffFilter === "all"
                    ? "bg-sky-600 text-white shadow-sm shadow-sky-600/30"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Assignments ({assignments.length})
              </button>
            </div>

            {/* Filter by Staff Dropdown */}
            {staff.length > 0 && (
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <span>Filter by Staff:</span>
                <select
                  value={staffFilter}
                  onChange={(e) => setStaffFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-sm outline-none focus:border-sky-500"
                >
                  <option value="all">All Supervisors</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Table Container */}
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs text-slate-700">
                <thead className="bg-slate-50/90 text-left uppercase tracking-wider text-[11px] font-bold text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Staff Supervisor</th>
                    <th className="px-5 py-3.5">Assigned Candidate</th>
                    <th className="px-4 py-3.5">Assigned Date</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-14 text-center text-slate-400">
                        <FaSyncAlt className="mx-auto mb-2 animate-spin text-base text-sky-600" />
                        Loading staff assignments...
                      </td>
                    </tr>
                  ) : filteredAssignments.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-14 text-center text-slate-400">
                        <FaLink className="mx-auto mb-2 text-2xl text-slate-300" />
                        <p className="font-bold text-slate-700 text-sm">No Assignments Found</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {searchTerm || staffFilter !== "all"
                            ? "No assignments match your search or filter."
                            : "No students have been assigned to staff members yet."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredAssignments.map((assignment) => {
                      const staffMember = staffMap.get(assignment.staff_id);
                      const studentObj = studentMap.get(assignment.student_user_id);
                      const staffName = staffMember?.full_name || "Staff Supervisor";
                      const studentName = studentObj?.name || "Student Candidate";
                      const studentEmail = studentObj?.email || "No email on record";

                      return (
                        <tr
                          key={assignment.id}
                          className="transition-colors hover:bg-sky-50/60"
                        >
                          {/* Staff Member Cell */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-bold text-white shadow-sm">
                                {getInitials(staffName)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-bold text-slate-900">{staffName}</p>
                                <p className="truncate text-[11px] text-slate-500">
                                  {staffMember?.department || "General Department"}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Student Cell */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold text-white shadow-sm">
                                {getInitials(studentName)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-bold text-slate-900">{studentName}</p>
                                <p className="truncate text-[11px] text-slate-500">
                                  {studentEmail}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Assigned Date */}
                          <td className="px-4 py-4 text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <FaCalendarAlt className="text-slate-400 text-xs" />
                              {assignment.created_at
                                ? new Date(assignment.created_at).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : "—"}
                            </span>
                          </td>

                          {/* Action Button */}
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => setRemoveTarget(assignment)}
                              title="Remove Assignment"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-100 hover:shadow"
                            >
                              <FaTrash className="text-[11px]" />
                              <span>Remove</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Remove Assignment Confirmation Modal */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-rose-200/80">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <FaTrash className="text-lg" />
            </div>

            <h3 className="mt-4 text-xl font-extrabold text-slate-950">
              Remove Student Assignment?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
              Are you sure you want to remove this assignment? This staff member will no longer be able to view this student&apos;s interviews and scores.
            </p>

            {/* Target Card */}
            <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50/60 p-4 ring-1 ring-rose-200/50">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Supervisor:
                  </span>
                  <span className="font-bold text-slate-900">
                    {staffMap.get(removeTarget.staff_id)?.full_name || "Staff Supervisor"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Candidate:
                  </span>
                  <span className="font-bold text-slate-900">
                    {studentNames[removeTarget.student_user_id] || "Student Candidate"}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={actionLoading}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={actionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/30 transition hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoading ? (
                  <>
                    <FaSyncAlt className="animate-spin text-xs" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <FaTrash className="text-xs" />
                    <span>Confirm Removal</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffAssignments;
