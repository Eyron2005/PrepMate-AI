import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyInterviewSession,
  computeCategoryAveragesAndEri,
  computeStudentEriSummary,
  formatEriDisplay,
  formatEriScore,
  getEriClassification,
} from "../src/services/eri.js";

test("getEriClassification maps scores to the correct Android application scale tiers", () => {
  // Highly Job Ready (>= 85%)
  assert.equal(getEriClassification(100).level, "highly_ready");
  assert.equal(getEriClassification(85).level, "highly_ready");
  assert.equal(getEriClassification(85).label, "Highly Job Ready");

  // Job Ready (70% - <85%)
  assert.equal(getEriClassification(84.4).level, "ready");
  assert.equal(getEriClassification(84).level, "ready");
  assert.equal(getEriClassification(70).level, "ready");
  assert.equal(getEriClassification(75).label, "Job Ready");

  // Developing (50% - <70%)
  assert.equal(getEriClassification(69).level, "developing");
  assert.equal(getEriClassification(50).level, "developing");
  assert.equal(getEriClassification(55).label, "Developing");

  // Needs Practice (< 50%)
  assert.equal(getEriClassification(49).level, "needs_practice");
  assert.equal(getEriClassification(37).level, "needs_practice");
  assert.equal(getEriClassification(13).level, "needs_practice");
  assert.equal(getEriClassification(1).level, "needs_practice");
  assert.equal(getEriClassification(37).label, "Needs Practice");
});

test("getEriClassification gracefully handles unassessed candidates without defaulting to 0%", () => {
  assert.equal(getEriClassification(null).level, "none");
  assert.equal(getEriClassification(null).label, "Not Yet Available");
  assert.equal(getEriClassification(null).shortLabel, "N/A");

  assert.equal(getEriClassification(undefined).level, "none");
  assert.equal(getEriClassification(NaN).level, "none");
  assert.equal(getEriClassification("invalid").level, "none");
});

test("formatEriDisplay and formatEriScore format whole percentages and N/A consistently", () => {
  assert.equal(formatEriDisplay(null), "Not Yet Available");
  assert.equal(formatEriDisplay(undefined), "Not Yet Available");
  assert.equal(formatEriDisplay(NaN), "Not Yet Available");

  assert.equal(formatEriDisplay(43), "43%");
  assert.equal(formatEriDisplay(43, true), "43% • Needs Practice");
  assert.equal(formatEriDisplay(72, true), "72% • Job Ready");
  assert.equal(formatEriDisplay(90, true), "90% • Highly Job Ready");

  assert.equal(formatEriScore(85), "85%");
  assert.equal(formatEriScore(25.875), "26%");
  assert.equal(formatEriScore(12.8), "13%");
  assert.equal(formatEriScore(null), "N/A");
  assert.equal(formatEriScore(undefined), "N/A");
  assert.equal(formatEriScore(""), "N/A");
  assert.equal(formatEriScore(NaN), "N/A");
});

test("classifyInterviewSession separates COMPLETED, INCOMPLETE, and active IN PROGRESS sessions", () => {
  const now = new Date("2026-11-10T12:00:00Z").getTime();

  const completed = classifyInterviewSession(
    {
      id: "ses-comp",
      question_count: 5,
      completed_count: 5,
      summary: "Needs more practice on structure and clarity.",
      created_at: "2026-11-07T10:00:00Z",
    },
    now
  );
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.isCompleted, true);
  assert.equal(completed.answeredCount, 5);
  assert.equal(completed.unansweredCount, 0);

  // Ended early / partial session without summary prefix (like 1/5 session)
  const partialNoTag = classifyInterviewSession(
    {
      id: "ses-part",
      question_count: 5,
      completed_count: 1,
      summary: "Needs more practice on structure and clarity. Answer quality: 8%.",
      created_at: "2026-10-30T12:00:00Z",
    },
    now
  );
  assert.equal(partialNoTag.status, "INCOMPLETE");
  assert.equal(partialNoTag.isCompleted, false);
  assert.equal(partialNoTag.answeredCount, 1);
  assert.equal(partialNoTag.unansweredCount, 4);

  // Old stale "Interview in progress." session -> INCOMPLETE with answered vs unanswered counts
  const staleInProgress = classifyInterviewSession(
    {
      id: "ses-stale",
      question_count: 5,
      completed_count: 0,
      summary: "Interview in progress.",
      created_at: "2026-11-06T00:09:04Z",
    },
    now,
    3
  );
  assert.equal(staleInProgress.status, "INCOMPLETE");
  assert.equal(staleInProgress.answeredCount, 3);
  assert.equal(staleInProgress.unansweredCount, 2);

  // Recent "Interview in progress." session -> IN PROGRESS
  const liveInProgress = classifyInterviewSession(
    {
      id: "ses-live",
      question_count: 5,
      completed_count: 2,
      summary: "Interview in progress.",
      created_at: "2026-11-10T11:45:00Z",
    },
    now
  );
  assert.equal(liveInProgress.status, "IN PROGRESS");
  assert.equal(liveInProgress.isCompleted, false);
  assert.equal(liveInProgress.isInProgress, true);
});

test("computeCategoryAveragesAndEri uses available category averages and never assigns zero to missing categories", () => {
  const questionCategoryById = {
    q1: "HR",
    q2: "HR",
    q3: "Behavioral",
    q4: "Situational",
    q5: "Technical",
  };

  // All 4 categories present -> (HR + Behavioral + Situational + Technical) / 4
  const full = computeCategoryAveragesAndEri(
    [
      { id: 1, session_id: "s1", question_id: "q1", ai_score: 80 },
      { id: 2, session_id: "s1", question_id: "q2", ai_score: 80 },
      { id: 3, session_id: "s2", question_id: "q3", ai_score: 90 },
      { id: 4, session_id: "s3", question_id: "q4", ai_score: 84 },
      { id: 5, session_id: "s4", question_id: "q5", ai_score: 86 },
    ],
    questionCategoryById
  );
  assert.equal(full.hasAllFourCategories, true);
  assert.equal(full.availableCategoriesCount, 4);
  assert.equal(full.eri, 85);
  assert.equal(formatEriScore(full.eri), "85%");

  // Only 2 categories + unscored row (null) + duplicate result -> divides by 2, never treats missing or unscored as 0
  const partialCats = computeCategoryAveragesAndEri(
    [
      { id: 1, session_id: "s1", question_id: "q1", ai_score: 80, created_at: "2026-11-01T10:00:00Z" },
      { id: 2, session_id: "s1", question_id: "q1", ai_score: 90, created_at: "2026-11-01T10:01:00Z" }, // duplicate keeps newer 90
      { id: 3, session_id: "s1", question_id: "q3", ai_score: null }, // unscored -> skipped, not 0
      { id: 4, session_id: "s2", question_id: "q5", ai_score: 80 },
    ],
    questionCategoryById
  );
  assert.equal(partialCats.categoryAverages.HR, 90);
  assert.equal(partialCats.categoryAverages.Technical, 80);
  assert.equal(partialCats.categoryAverages.Behavioral, null);
  assert.equal(partialCats.categoryAverages.Situational, null);
  assert.equal(partialCats.eri, 85);
});

test("computeStudentEriSummary excludes incomplete sessions cleanly and preserves real ERI calculations", () => {
  const questionCategoryById = {
    "q-hr": "HR",
    "q-tech": "Technical",
    "q-sit": "Situational",
  };

  // Student A: 2 completed HR sessions + partial [Ended Early] & incomplete 0/5 sessions
  const markSummary = computeStudentEriSummary({
    sessions: [
      { id: "c1", question_count: 5, completed_count: 5, summary: "Done", created_at: "2026-11-07T16:59:36Z" },
      { id: "c2", question_count: 5, completed_count: 5, summary: "Done", created_at: "2026-11-04T12:20:00Z" },
      { id: "inc1", question_count: 5, completed_count: 2, summary: "[Ended Early] Answered 2 of 5", created_at: "2026-11-07T09:45:56Z" },
      { id: "inc2", question_count: 5, completed_count: 0, summary: "Interview in progress.", created_at: "2026-11-06T00:09:04Z" },
    ],
    results: [
      // c1 = [12, 29, 18, 12, 12]
      { id: 1, session_id: "c1", question_id: "q-hr", ai_score: 12, created_at: "2026-11-07T17:00:00Z" }, // distinct questions simulated via distinct ids below
    ].concat([
      { id: 2, session_id: "c1", question_id: "q-hr-2", ai_score: 29 },
      { id: 3, session_id: "c1", question_id: "q-hr-3", ai_score: 18 },
      { id: 4, session_id: "c1", question_id: "q-hr-4", ai_score: 12 },
      { id: 5, session_id: "c1", question_id: "q-hr-5", ai_score: 12 },
      // c2 = [5, 8, 12, 12, 8]
      { id: 6, session_id: "c2", question_id: "q-hr", ai_score: 5 },
      { id: 7, session_id: "c2", question_id: "q-hr-2", ai_score: 8 },
      { id: 8, session_id: "c2", question_id: "q-hr-3", ai_score: 12 },
      { id: 9, session_id: "c2", question_id: "q-hr-4", ai_score: 12 },
      { id: 10, session_id: "c2", question_id: "q-hr-5", ai_score: 8 },
      // Partial sessions (must NEVER contribute)
      { id: 11, session_id: "inc1", question_id: "q-hr", ai_score: 95 },
      { id: 12, session_id: "inc2", question_id: "q-sit", ai_score: 99 },
    ]),
    questionCategoryById: {
      ...questionCategoryById,
      "q-hr-2": "HR",
      "q-hr-3": "HR",
      "q-hr-4": "HR",
      "q-hr-5": "HR",
    },
    nowMs: new Date("2026-11-10T12:00:00Z").getTime(),
  });

  assert.equal(markSummary.latest_eri, 13);
  assert.equal(formatEriScore(markSummary.latest_eri), "13%");
  assert.equal(markSummary.hr_average, 13);
  assert.equal(markSummary.situational_average, null);
  assert.equal(markSummary.completed_assessments_count, 2);
  assert.equal(markSummary.incomplete_assessments_count, 2);

  // Student B: Only incomplete sessions -> ERI must be null (N/A), never 0 or partial score
  const incompleteOnly = computeStudentEriSummary({
    sessions: [
      { id: "only-inc", question_count: 5, completed_count: 1, summary: "[Ended Early]", created_at: "2026-11-05T10:00:00Z" },
    ],
    results: [
      { id: 20, session_id: "only-inc", question_id: "q-tech", ai_score: 80 },
    ],
    questionCategoryById,
  });
  assert.equal(incompleteOnly.latest_eri, null);
  assert.equal(formatEriScore(incompleteOnly.latest_eri), "N/A");
  assert.equal(incompleteOnly.completed_assessments_count, 0);
  assert.equal(incompleteOnly.incomplete_assessments_count, 1);
  assert.equal(incompleteOnly.history.length, 0);
});
