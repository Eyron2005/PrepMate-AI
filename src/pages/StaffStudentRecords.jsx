import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaSearch,
  FaSyncAlt,
  FaGraduationCap,
  FaEye,
  FaTimes,
  FaCopy,
  FaCheck,
  FaCalendarAlt,
  FaClock,
  FaExternalLinkAlt,
} from "react-icons/fa";
import StaffSidebar from "../components/StaffSidebar";
import { supabase } from "../services/supabase";
import {
  computeStudentEriSummary,
  fetchStudentEriAnalytics,
  formatEriScore,
  getEriClassification,
} from "../services/eri";
import {
  fetchAssignedStudentIds,
  isAssignedStudentProfile,
} from "../services/staffAssignments";
import StudentEriPanel from "../components/StudentEriPanel";
import StudentAvatar from "../components/StudentAvatar";

function StaffStudentRecords() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  // Selected student for ERI inspection modal
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentEriAnalytics, setStudentEriAnalytics] = useState(null);
  const [loadingEriHistory, setLoadingEriHistory] = useState(false);

  const loadStudents = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage("");

    try {
      const { data: rpcEriProfiles, error: rpcEriError } = await supabase.rpc(
        "get_staff_assigned_students_with_eri"
      );

      if (!rpcEriError && Array.isArray(rpcEriProfiles)) {
        const merged = rpcEriProfiles.map((p) => ({
          ...p,
          email: p.email || "",
          latest_eri:
            p.latest_eri !== null && p.latest_eri !== undefined ? Number(p.latest_eri) : null,
          latest_eri_date: p.latest_eri_date || null,
          hr_average:
            p.hr_average !== null && p.hr_average !== undefined ? Number(p.hr_average) : null,
          behavioral_average:
            p.behavioral_average !== null && p.behavioral_average !== undefined
              ? Number(p.behavioral_average)
              : null,
          situational_average:
            p.situational_average !== null && p.situational_average !== undefined
              ? Number(p.situational_average)
              : null,
          technical_average:
            p.technical_average !== null && p.technical_average !== undefined
              ? Number(p.technical_average)
              : null,
          available_categories_count: Number(p.available_categories_count || 0),
          completed_assessments_count: Number(p.completed_assessments_count || 0),
          incomplete_assessments_count: Number(p.incomplete_assessments_count || 0),
          in_progress_assessments_count: Number(p.in_progress_assessments_count || 0),
        }));

        setStudents(merged);
        setSelectedStudent((prev) => {
          if (!prev) return null;
          return merged.find((s) => s.id === prev.id) || prev;
        });
        return;
      }

      let profiles = null;
      const { data: rpcProfiles, error: rpcError } = await supabase.rpc("get_staff_assigned_students");
      if (!rpcError && Array.isArray(rpcProfiles)) {
        profiles = rpcProfiles;
      } else {
        // 1. Fetch explicit student assignments for the logged-in staff user
        const assignedStudentIds = await fetchAssignedStudentIds();

        if (assignedStudentIds.length === 0) {
          setStudents([]);
          setSelectedStudent(null);
          return;
        }

        // 2. Fetch assigned student profiles only (defense-in-depth alongside RLS)
        const quotedIds = assignedStudentIds.map((id) => `"${id}"`).join(",");
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, auth_user_id, full_name, email, avatar_url, created_at, last_online")
          .or(`id.in.(${quotedIds}),auth_user_id.in.(${quotedIds})`)
          .order("full_name");

        if (profileError) throw profileError;

        profiles = (profileData || []).filter((p) =>
          isAssignedStudentProfile(p, assignedStudentIds)
        );
      }

      if (!profiles || profiles.length === 0) {
        setStudents([]);
        setSelectedStudent(null);
        return;
      }

      const studentIds = [
        ...new Set(profiles.flatMap((p) => [p.id, p.auth_user_id]).filter(Boolean)),
      ];

      // 3. Fetch sessions + results + questions and compute strictly from completed sessions
      let sessionRows = [];
      let resultRows = [];
      let questionCategoryById = {};

      if (studentIds.length > 0) {
        const [sessionRes, resultRes] = await Promise.all([
          supabase
            .from("interview_sessions")
            .select("id, profile_id, overall_score, speech_score, camera_score, question_count, completed_count, summary, created_at")
            .in("profile_id", studentIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("interview_results")
            .select("id, profile_id, session_id, question_id, ai_score, created_at")
            .in("profile_id", studentIds),
        ]);

        if (!sessionRes.error && Array.isArray(sessionRes.data)) {
          sessionRows = sessionRes.data;
        }
        if (!resultRes.error && Array.isArray(resultRes.data)) {
          resultRows = resultRes.data;
        }

        const qIds = [...new Set(resultRows.map((r) => r.question_id).filter(Boolean))];
        if (qIds.length > 0) {
          const { data: qData } = await supabase
            .from("questions")
            .select("id, category")
            .in("id", qIds);
          questionCategoryById = Object.fromEntries((qData || []).map((q) => [q.id, q.category]));
        }
      }

      // 4. Merge profiles with verified completed-only ERI metrics
      const merged = profiles.map((p) => {
        const studentSessions = sessionRows.filter(
          (s) => s.profile_id === p.id || (p.auth_user_id && s.profile_id === p.auth_user_id)
        );
        const studentResults = resultRows.filter(
          (r) => !r.profile_id || r.profile_id === p.id || (p.auth_user_id && r.profile_id === p.auth_user_id)
        );
        const summary = computeStudentEriSummary({
          sessions: studentSessions,
          results: studentResults,
          questionCategoryById,
        });

        return {
          ...p,
          email: p.email || "",
          latest_eri: summary.latest_eri,
          latest_eri_date: summary.latest_eri_date,
          hr_average: summary.hr_average,
          behavioral_average: summary.behavioral_average,
          situational_average: summary.situational_average,
          technical_average: summary.technical_average,
          available_categories_count: summary.available_categories_count,
          completed_assessments_count: summary.completed_assessments_count,
          incomplete_assessments_count: summary.incomplete_assessments_count,
          in_progress_assessments_count: summary.in_progress_assessments_count,
        };
      });

      setStudents(merged);
      setSelectedStudent((prev) => {
        if (!prev) return null;
        return merged.find((s) => s.id === prev.id) || prev;
      });
    } catch (error) {
      console.error("Unable to load assigned student records:", error);
      setErrorMessage(`Unable to load student records: ${error.message || "Network error"}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      loadStudents();
    });
    return () => cancelAnimationFrame(frameId);
  }, [loadStudents]);

  const selectedStudentId = selectedStudent?.id;
  const selectedStudentAuthId = selectedStudent?.auth_user_id;

  // Load detailed ERI analytics when a student is selected for inspection
  useEffect(() => {
    let isMounted = true;

    const frameId = requestAnimationFrame(async () => {
      if (!selectedStudentId) {
        if (isMounted) {
          setStudentEriAnalytics(null);
          setLoadingEriHistory(false);
        }
        return;
      }

      setLoadingEriHistory(true);
      try {
        const analytics = await fetchStudentEriAnalytics(selectedStudentId, selectedStudentAuthId);
        if (isMounted) {
          setStudentEriAnalytics(analytics || null);
        }
      } catch (err) {
        console.error("Failed to load student ERI assessment history:", err);
        if (isMounted) setStudentEriAnalytics(null);
      } finally {
        if (isMounted) setLoadingEriHistory(false);
      }
    });

    return () => {
      isMounted = false;
      cancelAnimationFrame(frameId);
    };
  }, [selectedStudentId, selectedStudentAuthId]);

  function copyToClipboard(text) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      [student.full_name, student.email, student.id, student.auth_user_id].some((value) =>
        value?.toLowerCase().includes(query)
      )
    );
  }, [search, students]);

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <StaffSidebar />

      <main className="relative ml-20 flex max-w-7xl flex-col gap-6 px-4 py-6 md:ml-64 md:px-8 lg:py-8">
        {/* Header Hero */}
        <section className="glass-card-elevated relative overflow-hidden rounded-[2rem] border border-white/80 p-5 shadow-[0_20px_50px_-25px_rgba(99,102,241,0.3)] ring-1 ring-indigo-100/90 sm:p-6">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-indigo-400/15 via-sky-400/12 to-violet-400/10" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-100 to-sky-100 px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-800 shadow-sm">
                <FaGraduationCap className="text-indigo-600 text-[10px]" />
                Staff Workspace
              </span>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                Assigned Student Records
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                Supervise your assigned students, track their Employment Readiness Index (ERI), and monitor mock interview assessments.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadStudents(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200/80 bg-white/80 px-4 py-2 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50 hover:shadow disabled:opacity-50"
            >
              <FaSyncAlt className={`text-xs ${refreshing || loading ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Refreshing..." : "Sync Records"}</span>
            </button>
          </div>
        </section>

        {errorMessage && (
          <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
            {errorMessage}
          </p>
        )}

        {/* Student Records Table Section */}
        <section className="w-full">
          <div className="glass-card overflow-hidden rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(99,102,241,0.35)] ring-1 ring-indigo-100/90 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Student Records</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {filtered.length} assigned student{filtered.length !== 1 ? "s" : ""} under your supervision
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full max-w-xs">
                <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 pl-10 pr-9 py-2.5 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/15"
                  placeholder="Search by student name, email, or ID..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <FaTimes className="text-xs" />
                  </button>
                )}
              </div>
            </div>

            {/* Records Table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3.5">Student Name</th>
                    <th className="px-4 py-3.5">User ID</th>
                    <th className="px-4 py-3.5">Employment Readiness (ERI)</th>
                    <th className="px-4 py-3.5">Added</th>
                    <th className="px-4 py-3.5">Last Online</th>
                    <th className="px-4 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="px-5 py-14 text-center text-slate-400">
                        <FaSyncAlt className="mx-auto mb-2 animate-spin text-lg text-indigo-600" />
                        Loading assigned student records...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-5 py-14 text-center text-slate-500">
                        {search ? (
                          <>No students match your search &ldquo;{search}&rdquo;.</>
                        ) : (
                          <>No students are assigned to your supervisor account yet.</>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((student) => {
                      const hasEri =
                        student.latest_eri !== null && student.latest_eri !== undefined;
                      const classification = getEriClassification(student.latest_eri);

                      return (
                        <tr
                          key={student.id}
                          onClick={() => setSelectedStudent(student)}
                          className="cursor-pointer transition-colors hover:bg-indigo-50/40"
                        >
                          {/* Student Name & Avatar */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <StudentAvatar
                                avatarUrl={student.avatar_url}
                                name={student.full_name}
                                size="md"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-bold text-slate-900">
                                  {student.full_name || "Unnamed student"}
                                </p>
                                <p className="truncate text-[11px] text-slate-500">
                                  {student.email || "No email on record"}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* User ID */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
                              <span className="truncate max-w-[140px]">
                                {student.auth_user_id || student.id}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(student.auth_user_id || student.id);
                                }}
                                className="text-slate-400 hover:text-indigo-600"
                                title="Copy ID"
                              >
                                <FaCopy className="text-[10px]" />
                              </button>
                            </div>
                          </td>

                          {/* Employment Readiness Index (ERI) */}
                          <td className="px-4 py-3.5">
                            {hasEri ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-extrabold text-slate-900 tabular-nums">
                                    {formatEriScore(student.latest_eri)}
                                  </span>
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${classification.badgeClass}`}
                                  >
                                    {classification.label}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 tabular-nums">
                                  {student.completed_assessments_count} completed
                                  {student.incomplete_assessments_count > 0
                                    ? ` · ${student.incomplete_assessments_count} incomplete`
                                    : ""}
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200/80">
                                  N/A
                                </span>
                                {student.incomplete_assessments_count > 0 && (
                                  <span className="text-[10px] text-amber-700 tabular-nums">
                                    {student.incomplete_assessments_count} incomplete
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Added Date */}
                          <td className="px-4 py-3.5 text-slate-500">
                            {student.created_at
                              ? new Date(student.created_at).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>

                          {/* Last Online */}
                          <td className="px-4 py-3.5 text-slate-500">
                            {student.last_online
                              ? new Date(student.last_online).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>

                          {/* Action */}
                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStudent(student);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-indigo-100 hover:text-indigo-800"
                              title="Inspect Student ERI & Details"
                            >
                              <FaEye className="text-[11px]" /> Inspect
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

      {/* Student ERI Details Modal for Staff */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-4 py-6 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-6 sm:p-8 shadow-2xl ring-1 ring-slate-200/80 my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-5">
              <div className="flex items-center gap-4">
                <StudentAvatar
                  avatarUrl={selectedStudent.avatar_url}
                  name={selectedStudent.full_name}
                  size="lg"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-extrabold text-slate-950">
                      {selectedStudent.full_name}
                    </h3>
                    <span className="inline-block rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-800">
                      Assigned Student
                    </span>
                    {selectedStudent.latest_eri !== null && selectedStudent.latest_eri !== undefined ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                          getEriClassification(selectedStudent.latest_eri).badgeClass
                        }`}
                      >
                        {getEriClassification(selectedStudent.latest_eri).label}
                      </span>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        N/A
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-600">
                    {selectedStudent.email || "No email on record"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="rounded-xl border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                title="Close modal"
              >
                <FaTimes className="text-sm" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-6 flex-1 overflow-y-auto pr-1 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Candidate Profile & Guidance */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Candidate Profile
                  </h4>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-3.5 text-xs">
                    <div className="flex items-center justify-between rounded-xl bg-white p-3 ring-1 ring-slate-100">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Profile Identifier
                        </p>
                        <p className="font-mono text-xs font-semibold text-slate-800 break-all">
                          {selectedStudent.id}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedStudent.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 shrink-0 ml-2"
                        title="Copy User ID"
                      >
                        {copiedId ? <FaCheck className="text-emerald-600" /> : <FaCopy />}
                        <span>{copiedId ? "Copied" : "Copy"}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-100">
                      <FaCalendarAlt className="text-slate-400 text-sm" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Account Created
                        </p>
                        <p className="font-semibold text-slate-800">
                          {selectedStudent.created_at
                            ? new Date(selectedStudent.created_at).toLocaleString()
                            : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-100">
                      <FaClock className="text-slate-400 text-sm" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Last Online Activity
                        </p>
                        <p className="font-semibold text-slate-800">
                          {selectedStudent.last_online
                            ? new Date(selectedStudent.last_online).toLocaleString()
                            : "No recent activity recorded"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-sky-50/50 p-4 text-xs">
                    <p className="font-bold text-indigo-950">Supervisor Guidance</p>
                    <p className="mt-1 text-slate-600 leading-relaxed">
                      Track your student&apos;s interview readiness progression over time. Detailed verbal, behavioral, and AI feedback rubrics can be evaluated in Interview Results.
                    </p>
                    <Link
                      to="/staff/interview-results"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900"
                    >
                      <span>Review Interview Sessions</span>
                      <FaExternalLinkAlt className="text-[10px]" />
                    </Link>
                  </div>
                </div>

                {/* Right Column: Employment Readiness Index (ERI) */}
                <StudentEriPanel
                  student={selectedStudent}
                  analytics={studentEriAnalytics}
                  loading={loadingEriHistory}
                  spinnerClassName="text-indigo-600"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-[11px] text-slate-400 font-medium">
                PrepMate AI Staff Workspace • Candidate Readiness Analysis
              </span>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffStudentRecords;
