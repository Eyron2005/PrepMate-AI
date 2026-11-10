import { supabase } from "./supabase.js";

export const ERI_CATEGORIES = ["HR", "Behavioral", "Situational", "Technical"];
const IN_PROGRESS_WINDOW_MS = 2 * 60 * 60 * 1000;

export function roundEriScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(Number(numeric.toFixed(6)));
}

/**
 * Formats an ERI or category average as a rounded whole percentage (e.g. "85%")
 * and returns "N/A" whenever no eligible evaluated score exists.
 */
export function formatEriScore(score, { suffix = "%", fallback = "N/A" } = {}) {
  if (score === null || score === undefined || score === "" || !Number.isFinite(Number(score))) {
    return fallback;
  }
  const rounded = roundEriScore(score);
  return `${rounded}${suffix}`;
}

export function normalizeQuestionCategory(category) {
  if (!category || typeof category !== "string") return null;
  switch (category.trim().toLowerCase()) {
    case "hr":
      return "HR";
    case "behavioral":
      return "Behavioral";
    case "situational":
      return "Situational";
    case "technical":
      return "Technical";
    default:
      return null;
  }
}

/**
 * Classifies an interview session using the Android completion criteria rather than
 * relying solely on whether partial rows exist in `interview_results`.
 */
export function classifyInterviewSession(session, nowMs = Date.now(), recordedAnswersCount = null) {
  const questionCount = Math.max(
    0,
    Number(session?.question_count ?? session?.total_questions ?? session?.questions_total ?? 0) || 0
  );
  const completedCount = Math.max(0, Number(session?.completed_count ?? 0) || 0);
  const summary = String(session?.summary ?? "").trim();
  const explicitStatus = String(session?.status ?? "").trim().toUpperCase();

  const isEndedEarlySummary = /^\[ended early\]/i.test(summary);
  const isInProgressSummary = /^interview in progress/i.test(summary);
  const createdAtMs = session?.created_at ? new Date(session.created_at).getTime() : NaN;
  const isRecentInProgress =
    isInProgressSummary && Number.isFinite(createdAtMs) && nowMs - createdAtMs <= IN_PROGRESS_WINDOW_MS;

  let status = "INCOMPLETE";
  if (
    ["INCOMPLETE", "ENDED_EARLY", "ENDED EARLY", "ABANDONED", "DISCARDED", "CANCELLED", "FAILED"].includes(
      explicitStatus
    )
  ) {
    status = "INCOMPLETE";
  } else if (["IN_PROGRESS", "IN PROGRESS"].includes(explicitStatus)) {
    status =
      questionCount > 0 && completedCount >= questionCount && !isEndedEarlySummary && !isInProgressSummary
        ? "COMPLETED"
        : "IN PROGRESS";
  } else if (
    questionCount > 0 &&
    completedCount >= questionCount &&
    !isEndedEarlySummary &&
    !isInProgressSummary
  ) {
    status = "COMPLETED";
  } else if (isRecentInProgress) {
    status = "IN PROGRESS";
  }

  const isCompleted = status === "COMPLETED";
  const isInProgress = status === "IN PROGRESS";

  const observedCount = Math.max(completedCount, Math.max(0, Number(recordedAnswersCount ?? 0) || 0));
  const answeredCount = isCompleted
    ? questionCount
    : questionCount > 0
      ? Math.min(questionCount, observedCount)
      : observedCount;
  const unansweredCount = questionCount > 0 ? Math.max(0, questionCount - answeredCount) : 0;

  if (isCompleted) {
    return {
      status,
      isCompleted: true,
      isInProgress: false,
      isIncomplete: false,
      questionCount,
      completedCount,
      answeredCount,
      unansweredCount,
      badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      dotClass: "bg-emerald-500",
    };
  }

  if (isInProgress) {
    return {
      status,
      isCompleted: false,
      isInProgress: true,
      isIncomplete: false,
      questionCount,
      completedCount,
      answeredCount,
      unansweredCount,
      badgeClass: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
      dotClass: "bg-sky-500 animate-pulse",
    };
  }

  return {
    status,
    isCompleted: false,
    isInProgress: false,
    isIncomplete: true,
    questionCount,
    completedCount,
    answeredCount,
    unansweredCount,
    badgeClass: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    dotClass: "bg-amber-500",
  };
}

/**
 * Computes category averages and final ERI from already-verified COMPLETED results:
 *   ERI = Sum of Available Category Averages ÷ Number of Available Categories
 * When all 4 categories exist, this equals (HR + Behavioral + Situational + Technical) / 4.
 * Missing categories remain null ("N/A") and are never treated as zero.
 */
export function computeCategoryAveragesAndEri(results = [], questionCategoryById = {}) {
  const dedupedByKey = new Map();

  for (const row of results || []) {
    if (!row) continue;
    const questionId = row.question_id ?? row.questionId ?? row.question_ref ?? null;
    const sessionId = row.session_id ?? "single";
    if (!questionId) continue;

    const rawScore = row.ai_score;
    if (rawScore === null || rawScore === undefined || rawScore === "") continue;
    const score = Number(rawScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) continue;

    const category = normalizeQuestionCategory(row.category ?? questionCategoryById[questionId]);
    if (!category) continue;

    const key = `${sessionId}::${questionId}`;
    const existing = dedupedByKey.get(key);
    if (!existing) {
      dedupedByKey.set(key, { ...row, questionId, sessionId, category, score });
      continue;
    }

    const prevTime = existing.created_at ? new Date(existing.created_at).getTime() : 0;
    const nextTime = row.created_at ? new Date(row.created_at).getTime() : 0;
    const prevId = Number(existing.id ?? 0) || 0;
    const nextId = Number(row.id ?? 0) || 0;
    if (nextTime > prevTime || (nextTime === prevTime && nextId > prevId)) {
      dedupedByKey.set(key, { ...row, questionId, sessionId, category, score });
    }
  }

  const buckets = {
    HR: [],
    Behavioral: [],
    Situational: [],
    Technical: [],
  };

  for (const entry of dedupedByKey.values()) {
    buckets[entry.category].push(entry.score);
  }

  const rawCategoryAverages = {};
  const categoryAverages = {};
  const availableCategories = [];

  for (const category of ERI_CATEGORIES) {
    const scores = buckets[category];
    if (scores.length > 0) {
      const mean = scores.reduce((sum, val) => sum + val, 0) / scores.length;
      rawCategoryAverages[category] = mean;
      categoryAverages[category] = roundEriScore(mean);
      availableCategories.push(category);
    } else {
      rawCategoryAverages[category] = null;
      categoryAverages[category] = null;
    }
  }

  const availableCategoriesCount = availableCategories.length;
  const eri =
    availableCategoriesCount > 0
      ? roundEriScore(
          availableCategories.reduce((sum, cat) => sum + rawCategoryAverages[cat], 0) /
            availableCategoriesCount
        )
      : null;

  return {
    categoryAverages,
    availableCategories,
    availableCategoriesCount,
    hasAllFourCategories: availableCategoriesCount === ERI_CATEGORIES.length,
    eri,
    validEvaluatedResults: Array.from(dedupedByKey.values()),
  };
}

/**
 * Aggregates full student performance and chronological completed-session history
 * while strictly excluding INCOMPLETE, abandoned, ended-early, and IN PROGRESS sessions.
 */
export function computeStudentEriSummary({
  sessions = [],
  results = [],
  questionCategoryById = {},
  nowMs = Date.now(),
} = {}) {
  const dedupedSessions = new Map();
  for (const session of sessions || []) {
    if (!session?.id) continue;
    if (!dedupedSessions.has(session.id)) {
      dedupedSessions.set(session.id, session);
    }
  }

  const completedSessions = [];
  let incompleteCount = 0;
  let inProgressCount = 0;

  for (const session of dedupedSessions.values()) {
    const info = classifyInterviewSession(session, nowMs);
    if (info.isCompleted) {
      completedSessions.push({ session, info });
    } else if (info.isInProgress) {
      inProgressCount += 1;
    } else {
      incompleteCount += 1;
    }
  }

  const completedSessionIds = new Set(completedSessions.map(({ session }) => session.id));
  const eligibleResults = (results || []).filter(
    (row) => row?.session_id && completedSessionIds.has(row.session_id)
  );

  const overallMetrics = computeCategoryAveragesAndEri(eligibleResults, questionCategoryById);

  const resultsBySession = new Map();
  for (const entry of overallMetrics.validEvaluatedResults) {
    if (!resultsBySession.has(entry.sessionId)) {
      resultsBySession.set(entry.sessionId, []);
    }
    resultsBySession.get(entry.sessionId).push(entry);
  }

  const history = completedSessions
    .filter(({ session }) => resultsBySession.has(session.id))
    .sort((a, b) => new Date(a.session.created_at).getTime() - new Date(b.session.created_at).getTime())
    .map(({ session }, index) => {
      const sessionRows = resultsBySession.get(session.id) || [];
      const sessionMetrics = computeCategoryAveragesAndEri(sessionRows, questionCategoryById);
      const score = sessionMetrics.eri;
      const classification = getEriClassification(score);
      const date = new Date(session.created_at);

      return {
        ...session,
        assessmentIndex: index + 1,
        score,
        overall_score: score,
        categoryAverages: sessionMetrics.categoryAverages,
        availableCategories: sessionMetrics.availableCategories,
        classification,
        formattedDate: Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(),
        formattedTime: Number.isNaN(date.getTime())
          ? ""
          : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
    });

  const latestCompletedEvalDate =
    history.length > 0 ? history[history.length - 1].created_at || null : null;

  return {
    latest_eri: overallMetrics.eri,
    latest_eri_date: latestCompletedEvalDate,
    hr_average: overallMetrics.categoryAverages.HR,
    behavioral_average: overallMetrics.categoryAverages.Behavioral,
    situational_average: overallMetrics.categoryAverages.Situational,
    technical_average: overallMetrics.categoryAverages.Technical,
    available_categories_count: overallMetrics.availableCategoriesCount,
    completed_assessments_count: history.length,
    total_completed_sessions: completedSessions.length,
    incomplete_assessments_count: incompleteCount,
    in_progress_assessments_count: inProgressCount,
    history,
  };
}

/**
 * Returns the standardized Employment Readiness Index (ERI) classification
 * and visual styling matching the PrepMate AI Android application.
 *
 * Scale (0-100):
 * - >= 85: Highly Job Ready (Emerald)
 * - 70 - <85: Job Ready (Teal)
 * - 50 - <70: Developing (Amber)
 * - < 50: Needs Practice (Rose)
 * - null / invalid: Not Yet Available / N/A (Slate)
 */
export function getEriClassification(score) {
  if (score === null || score === undefined || score === "" || !Number.isFinite(Number(score))) {
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

  const num = roundEriScore(score);

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

function mapRpcHistoryRows(rawRows = []) {
  return (Array.isArray(rawRows) ? rawRows : []).map((session, index) => {
    const score =
      session.overall_score !== null && session.overall_score !== undefined
        ? roundEriScore(session.overall_score)
        : null;
    const classification = getEriClassification(score);
    const date = new Date(session.created_at);

    const categoryAverages = {
      HR: session.hr_average !== null && session.hr_average !== undefined ? roundEriScore(session.hr_average) : null,
      Behavioral:
        session.behavioral_average !== null && session.behavioral_average !== undefined
          ? roundEriScore(session.behavioral_average)
          : null,
      Situational:
        session.situational_average !== null && session.situational_average !== undefined
          ? roundEriScore(session.situational_average)
          : null,
      Technical:
        session.technical_average !== null && session.technical_average !== undefined
          ? roundEriScore(session.technical_average)
          : null,
    };
    const availableCategories = ERI_CATEGORIES.filter((cat) => categoryAverages[cat] !== null);

    return {
      ...session,
      assessmentIndex: index + 1,
      score,
      overall_score: score,
      categoryAverages,
      availableCategories,
      classification,
      formattedDate: Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(),
      formattedTime: Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  });
}

function nullableNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = roundEriScore(value);
  return parsed;
}

/**
 * Loads authoritative ERI analytics and completed-session history for an individual student.
 * Excludes all incomplete, ended-early, discarded, and in-progress sessions.
 */
export async function fetchStudentEriAnalytics(studentId, authUserId = null) {
  const emptyResult = {
    latest_eri: null,
    latest_eri_date: null,
    hr_average: null,
    behavioral_average: null,
    situational_average: null,
    technical_average: null,
    available_categories_count: 0,
    completed_assessments_count: 0,
    total_completed_sessions: 0,
    incomplete_assessments_count: 0,
    in_progress_assessments_count: 0,
    history: [],
  };

  if (!studentId && !authUserId) return emptyResult;

  const lookupId = studentId || authUserId;

  try {
    const { data, error } = await supabase.rpc("get_student_eri_analytics_for_user", {
      p_student_id: lookupId,
    });

    if (!error && data && typeof data === "object") {
      return {
        latest_eri: nullableNumeric(data.latest_eri),
        latest_eri_date: data.latest_eri_date || null,
        hr_average: nullableNumeric(data.hr_average),
        behavioral_average: nullableNumeric(data.behavioral_average),
        situational_average: nullableNumeric(data.situational_average),
        technical_average: nullableNumeric(data.technical_average),
        available_categories_count: Number(data.available_categories_count || 0),
        completed_assessments_count: Number(data.completed_assessments_count || 0),
        total_completed_sessions: Number(data.total_completed_sessions || 0),
        incomplete_assessments_count: Number(data.incomplete_assessments_count || 0),
        in_progress_assessments_count: Number(data.in_progress_assessments_count || 0),
        history: mapRpcHistoryRows(data.completed_sessions),
      };
    }
  } catch (err) {
    console.warn("RPC get_student_eri_analytics_for_user unavailable, using direct fallback:", err);
  }

  // Fallback calculation strictly following completed-session + 4-category average methodology
  try {
    const profileIds = [...new Set([studentId, authUserId].filter(Boolean))];
    const [sessionsRes, resultsRes] = await Promise.all([
      supabase
        .from("interview_sessions")
        .select("id, profile_id, overall_score, speech_score, camera_score, question_count, completed_count, summary, created_at")
        .in("profile_id", profileIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("interview_results")
        .select("id, session_id, question_id, ai_score, created_at")
        .in("profile_id", profileIds),
    ]);

    if (sessionsRes.error) {
      console.error("Error loading student sessions fallback:", sessionsRes.error);
      return emptyResult;
    }

    const sessions = sessionsRes.data || [];
    const results = resultsRes.error ? [] : resultsRes.data || [];
    const questionIds = [...new Set(results.map((r) => r.question_id).filter(Boolean))];
    let questionCategoryById = {};

    if (questionIds.length > 0) {
      const { data: qRows } = await supabase
        .from("questions")
        .select("id, category")
        .in("id", questionIds);
      questionCategoryById = Object.fromEntries((qRows || []).map((q) => [q.id, q.category]));
    }

    return computeStudentEriSummary({ sessions, results, questionCategoryById });
  } catch (error) {
    console.error("Failed to compute student ERI analytics fallback:", error);
    return emptyResult;
  }
}

/**
 * Loads chronological COMPLETED ERI assessment history for charting.
 * Incomplete and in-progress sessions are strictly excluded.
 */
export async function fetchStudentEriHistory(studentId, authUserId = null) {
  const analytics = await fetchStudentEriAnalytics(studentId, authUserId);
  return analytics.history || [];
}

/**
 * Loads system-wide ERI analytics for the Admin Dashboard.
 * Excludes incomplete, in-progress, discarded, and unassessed student sessions.
 */
export async function fetchAdminEriAnalytics() {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_admin_eri_analytics");

    if (!rpcError && Array.isArray(rpcData) && rpcData[0]) {
      const row = rpcData[0];
      const studentsWithEri = Number(row.students_with_eri) || 0;
      const averageEri =
        studentsWithEri > 0 && row.average_eri !== null && row.average_eri !== undefined
          ? roundEriScore(row.average_eri)
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
          eri_score: nullableNumeric(s.eri_score ?? s.overall_score),
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
        completedSessionsTotal: Number(row.completed_sessions_total) || 0,
        incompleteSessionsTotal: Number(row.incomplete_sessions_total) || 0,
        inProgressSessionsTotal: Number(row.in_progress_sessions_total) || 0,
        validEvaluatedSessionsTotal: Number(row.valid_evaluated_sessions_total) || 0,
        categoryAverages: {
          HR: nullableNumeric(row.hr_average),
          Behavioral: nullableNumeric(row.behavioral_average),
          Situational: nullableNumeric(row.situational_average),
          Technical: nullableNumeric(row.technical_average),
        },
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

  // Fallback calculation using direct queries with identical completed-session + category average rules
  try {
    const [profilesResult, sessionsResult, resultsResult, questionsResult] = await Promise.all([
      supabase.from("profiles").select("id, auth_user_id, full_name, email"),
      supabase
        .from("interview_sessions")
        .select("id, profile_id, overall_score, speech_score, camera_score, completed_count, question_count, created_at, summary")
        .order("created_at", { ascending: false }),
      supabase
        .from("interview_results")
        .select("id, session_id, profile_id, question_id, ai_score, created_at"),
      supabase.from("questions").select("id, category"),
    ]);

    const profiles = profilesResult.data || [];
    const sessions = sessionsResult.data || [];
    const results = resultsResult.data || [];
    const questionCategoryById = Object.fromEntries(
      (questionsResult.data || []).map((q) => [q.id, q.category])
    );

    const studentScores = [];
    const categoryBuckets = { HR: [], Behavioral: [], Situational: [], Technical: [] };
    let completedSessionsTotal = 0;
    let incompleteSessionsTotal = 0;
    let inProgressSessionsTotal = 0;
    let validEvaluatedSessionsTotal = 0;
    const completedHistoryAll = [];

    for (const profile of profiles) {
      const profileSessions = sessions.filter(
        (s) => s.profile_id === profile.id || (profile.auth_user_id && s.profile_id === profile.auth_user_id)
      );
      const summary = computeStudentEriSummary({
        sessions: profileSessions,
        results,
        questionCategoryById,
      });

      completedSessionsTotal += summary.total_completed_sessions;
      incompleteSessionsTotal += summary.incomplete_assessments_count;
      inProgressSessionsTotal += summary.in_progress_assessments_count;
      validEvaluatedSessionsTotal += summary.completed_assessments_count;

      if (summary.latest_eri !== null) {
        studentScores.push(summary.latest_eri);
      }
      for (const [cat, val] of [
        ["HR", summary.hr_average],
        ["Behavioral", summary.behavioral_average],
        ["Situational", summary.situational_average],
        ["Technical", summary.technical_average],
      ]) {
        if (val !== null) categoryBuckets[cat].push(val);
      }

      for (const h of summary.history) {
        completedHistoryAll.push({
          ...h,
          profile_id: profile.id,
          student_name: profile.full_name || "Student Candidate",
          full_name: profile.full_name || "Student Candidate",
          student_email: profile.email || "",
          eri_score: h.score,
        });
      }
    }

    const totalStudents = profiles.length;
    const studentsWithEri = studentScores.length;
    const studentsWithoutEri = Math.max(0, totalStudents - studentsWithEri);
    const averageEri =
      studentsWithEri > 0
        ? roundEriScore(studentScores.reduce((sum, v) => sum + v, 0) / studentsWithEri)
        : null;

    let highlyReady = 0;
    let ready = 0;
    let developing = 0;
    let needsPractice = 0;

    for (const score of studentScores) {
      if (score >= 85) highlyReady++;
      else if (score >= 70) ready++;
      else if (score >= 50) developing++;
      else needsPractice++;
    }

    const avgOrNull = (arr) =>
      arr.length > 0 ? roundEriScore(arr.reduce((sum, v) => sum + v, 0) / arr.length) : null;

    const recentAssessments = completedHistoryAll
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

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
      completedSessionsTotal,
      incompleteSessionsTotal,
      inProgressSessionsTotal,
      validEvaluatedSessionsTotal,
      categoryAverages: {
        HR: avgOrNull(categoryBuckets.HR),
        Behavioral: avgOrNull(categoryBuckets.Behavioral),
        Situational: avgOrNull(categoryBuckets.Situational),
        Technical: avgOrNull(categoryBuckets.Technical),
      },
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
      completedSessionsTotal: 0,
      incompleteSessionsTotal: 0,
      inProgressSessionsTotal: 0,
      validEvaluatedSessionsTotal: 0,
      categoryAverages: { HR: null, Behavioral: null, Situational: null, Technical: null },
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
