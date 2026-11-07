import { supabase } from "./supabase.js";

/**
 * Returns the standardized Employment Readiness Index (ERI) classification
 * and visual styling matching the PrepMate AI Android application.
 *
 * Scale (0–100%):
 * - 85%–100%: Highly Job Ready (Emerald)
 * - 70%–84%:  Job Ready (Teal)
 * - 50%–69%:  Developing (Amber)
 * - 1%–49%:   Needs Practice (Rose)
 * - null/N/A: Not Yet Available (Slate)
 */
export function getEriClassification(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return {
      label: "Not Yet Available",
      shortLabel: "N/A",
      level: "none",
      color: "slate",
      badgeClass: "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80",
      pillClass: "bg-slate-100 text-slate-700",
      dotClass: "bg-slate-400",
      progressColor: "#94a3b8", // slate-400
      textColor: "text-slate-500",
      description: "No completed interview evaluations recorded yet.",
    };
  }

  const num = Math.round(Number(score));

  if (num >= 85) {
    return {
      label: "Highly Job Ready",
      shortLabel: "Highly Ready",
      level: "highly_ready",
      color: "emerald",
      badgeClass: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80",
      pillClass: "bg-emerald-100 text-emerald-800",
      dotClass: "bg-emerald-500",
      progressColor: "#10b981", // emerald-500
      textColor: "text-emerald-700",
      description: "Demonstrates advanced proficiency across verbal and behavioral criteria.",
    };
  }

  if (num >= 70) {
    return {
      label: "Job Ready",
      shortLabel: "Ready",
      level: "ready",
      color: "teal",
      badgeClass: "bg-teal-50 text-teal-800 ring-1 ring-teal-200/80",
      pillClass: "bg-teal-100 text-teal-800",
      dotClass: "bg-teal-500",
      progressColor: "#14b8a6", // teal-500
      textColor: "text-teal-700",
      description: "Meets solid interview readiness standards for OJT placement.",
    };
  }

  if (num >= 50) {
    return {
      label: "Developing",
      shortLabel: "Developing",
      level: "developing",
      color: "amber",
      badgeClass: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80",
      pillClass: "bg-amber-100 text-amber-800",
      dotClass: "bg-amber-500",
      progressColor: "#f59e0b", // amber-500
      textColor: "text-amber-700",
      description: "Approaching readiness; requires targeted refinement in structure and confidence.",
    };
  }

  return {
    label: "Needs Practice",
    shortLabel: "Needs Practice",
    level: "needs_practice",
    color: "rose",
    badgeClass: "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80",
    pillClass: "bg-rose-100 text-rose-800",
    dotClass: "bg-rose-500",
    progressColor: "#f43f5e", // rose-500
    textColor: "text-rose-700",
    description: "Foundational stage; requires additional simulated interview practice.",
  };
}

export function formatEriDisplay(score, withLabel = false) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return "Not Yet Available";
  }
  const rounded = `${Math.round(Number(score))}%`;
  if (!withLabel) return rounded;
  const classification = getEriClassification(score);
  return `${rounded} • ${classification.label}`;
}

/**
 * Loads the complete chronological ERI evaluation history for an individual student.
 * Returns only genuine database records (never fabricated points).
 */
export async function fetchStudentEriHistory(studentId) {
  if (!studentId) return [];

  const { data, error } = await supabase
    .from("interview_sessions")
    .select("id, overall_score, speech_score, camera_score, question_count, completed_count, summary, created_at")
    .eq("profile_id", studentId)
    .gt("completed_count", 0)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading student ERI history:", error);
    return [];
  }

  return (data || []).map((session, index) => {
    const score = Number(session.overall_score ?? 0);
    const classification = getEriClassification(score);
    const date = new Date(session.created_at);
    return {
      ...session,
      assessmentIndex: index + 1,
      score,
      classification,
      formattedDate: Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(),
      formattedTime: Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  });
}

/**
 * Loads system-wide ERI analytics for the Admin Dashboard.
 * Accurately excludes students who have not completed any interview assessments.
 */
export async function fetchAdminEriAnalytics() {
  try {
    // 1. Try secure RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_admin_eri_analytics");

    if (!rpcError && Array.isArray(rpcData) && rpcData[0]) {
      const row = rpcData[0];
      const studentsWithEri = Number(row.students_with_eri) || 0;
      const averageEri =
        studentsWithEri > 0 && row.average_eri !== null && row.average_eri !== undefined
          ? Math.round(Number(row.average_eri) * 10) / 10
          : null;
      const highlyReady = Number(row.count_highly_ready) || 0;
      const ready = Number(row.count_ready) || 0;
      const developing = Number(row.count_developing) || 0;
      const needsPractice = Number(row.count_needs_practice) || 0;
      const recent = (Array.isArray(row.recent_assessments) ? row.recent_assessments : []).map(
        (s) => ({
          session_id: s.session_id || s.id,
          id: s.session_id || s.id,
          profile_id: s.profile_id,
          full_name: s.full_name || s.student_name || "Student Candidate",
          student_name: s.full_name || s.student_name || "Student Candidate",
          eri_score: s.overall_score ?? s.eri_score ?? 0,
          created_at: s.created_at,
          summary: s.summary || "",
        })
      );

      const totalStudents = Number(row.total_students) || 0;
      const studentsWithoutEri = Number(row.students_without_eri) || 0;

      return {
        totalStudents,
        total_students: totalStudents,
        studentsWithEri,
        students_with_eri: studentsWithEri,
        assessed_students: studentsWithEri,
        studentsWithoutEri,
        students_without_eri: studentsWithoutEri,
        unassessed_students: studentsWithoutEri,
        averageEri,
        average_eri: averageEri,
        distribution: {
          highlyReady,
          ready,
          developing,
          needsPractice,
          highly_job_ready: highlyReady,
          job_ready: ready,
          needs_practice: needsPractice,
        },
        recentAssessments: recent,
        recent_assessments: recent,
      };
    }
  } catch (err) {
    console.warn("RPC get_admin_eri_analytics unavailable, using fallback calculation:", err);
  }

  // Fallback calculation using direct queries
  try {
    const [profilesResult, sessionsResult] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email"),
      supabase
        .from("interview_sessions")
        .select("id, profile_id, overall_score, speech_score, camera_score, completed_count, question_count, created_at, summary")
        .gt("completed_count", 0)
        .order("created_at", { ascending: false }),
    ]);

    const profiles = profilesResult.data || [];
    const sessions = sessionsResult.data || [];

    const latestByStudent = new Map();
    for (const s of sessions) {
      if (!latestByStudent.has(s.profile_id)) {
        latestByStudent.set(s.profile_id, s);
      }
    }

    const scoresWithEri = Array.from(latestByStudent.values()).map((s) => Number(s.overall_score || 0));
    const totalStudents = profiles.length;
    const studentsWithEri = scoresWithEri.length;
    const studentsWithoutEri = Math.max(0, totalStudents - studentsWithEri);
    const averageEri =
      studentsWithEri > 0
        ? Math.round((scoresWithEri.reduce((sum, v) => sum + v, 0) / studentsWithEri) * 10) / 10
        : null;

    let highlyReady = 0;
    let ready = 0;
    let developing = 0;
    let needsPractice = 0;

    for (const score of scoresWithEri) {
      if (score >= 85) highlyReady++;
      else if (score >= 70) ready++;
      else if (score >= 50) developing++;
      else needsPractice++;
    }

    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const recentAssessments = sessions.slice(0, 5).map((s) => {
      const p = profileMap.get(s.profile_id);
      const studentName = p?.full_name || "Student Candidate";
      return {
        id: s.id,
        session_id: s.id,
        profile_id: s.profile_id,
        student_name: studentName,
        full_name: studentName,
        student_email: p?.email || "",
        eri_score: s.overall_score,
        speech_score: s.speech_score,
        camera_score: s.camera_score,
        completed_count: s.completed_count,
        question_count: s.question_count,
        created_at: s.created_at,
        summary: s.summary || "",
      };
    });

    return {
      totalStudents,
      total_students: totalStudents,
      studentsWithEri,
      students_with_eri: studentsWithEri,
      assessed_students: studentsWithEri,
      studentsWithoutEri,
      students_without_eri: studentsWithoutEri,
      unassessed_students: studentsWithoutEri,
      averageEri,
      average_eri: averageEri,
      distribution: {
        highlyReady,
        ready,
        developing,
        needsPractice,
        highly_job_ready: highlyReady,
        job_ready: ready,
        needs_practice: needsPractice,
      },
      recentAssessments,
      recent_assessments: recentAssessments,
    };
  } catch (error) {
    console.error("Failed to calculate ERI analytics fallback:", error);
    return {
      totalStudents: 0,
      total_students: 0,
      studentsWithEri: 0,
      students_with_eri: 0,
      assessed_students: 0,
      studentsWithoutEri: 0,
      students_without_eri: 0,
      unassessed_students: 0,
      averageEri: null,
      average_eri: null,
      distribution: {
        highlyReady: 0,
        ready: 0,
        developing: 0,
        needsPractice: 0,
        highly_job_ready: 0,
        job_ready: 0,
        needs_practice: 0,
      },
      recentAssessments: [],
      recent_assessments: [],
    };
  }
}
