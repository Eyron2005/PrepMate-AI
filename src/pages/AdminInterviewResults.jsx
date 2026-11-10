import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaArrowRight,
  FaAward,
  FaBrain,
  FaCalendarAlt,
  FaCheckCircle,
  FaChevronDown,
  FaClock,
  FaEye,
  FaLayerGroup,
  FaMicrophone,
  FaQuestionCircle,
  FaSearch,
  FaShieldAlt,
  FaSyncAlt,
  FaTimes,
  FaUserGraduate,
  FaVideo,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import StaffSidebar from "../components/StaffSidebar";
import { supabase } from "../services/supabase";
import {
  classifyInterviewSession,
  computeCategoryAveragesAndEri,
  ERI_CATEGORIES,
  formatEriScore,
  getEriClassification,
} from "../services/eri";
import {
  fetchAssignedStudentIds,
  isAssignedStudentProfile,
} from "../services/staffAssignments";

const SESSION_PAGE_SIZE = 20;
const STUDENT_RESULT_LIMIT = 40;
const SESSION_COLUMNS = "*";

function getInitials(name) {
  if (!name) return "ST";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function displayScore(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "string" && value.trim().endsWith("%")) return value;
  const score = Number(value);
  if (!Number.isFinite(score)) return displayContent(value);
  return `${Math.round(score <= 1 && score >= 0 ? score * 100 : score)}%`;
}

function displayContent(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function hasSavedValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function parseFeedbackPayload(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") return parseFeedbackPayload(parsed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getEvaluationValue(records, keys) {
  for (const record of records) {
    const value = firstValue(record, keys);
    if (value !== null) return value;
  }
  return null;
}

function FeedbackContent({ value, unavailable = "Not available." }) {
  if (value === null || value === undefined || value === "") {
    return <p className="text-slate-400">{unavailable}</p>;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? (
      <ul className="list-disc space-y-1 pl-5">
        {value.map((item, index) => (
          <li key={`${index}-${displayContent(item)}`}>{displayContent(item)}</li>
        ))}
      </ul>
    ) : <p className="text-slate-400">{unavailable}</p>;
  }
  return <p>{displayContent(value)}</p>;
}

function FeedbackParagraphs({ value }) {
  const paragraphs = String(value).split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  return paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph}`}>{paragraph}</p>);
}

function FeedbackList({ value }) {
  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== null && item !== undefined && item !== "");
    return items.length > 0 ? (
      <ul className="list-disc space-y-1.5 pl-5">
        {items.map((item, index) => <li key={`${index}-${displayContent(item)}`}>{displayContent(item)}</li>)}
      </ul>
    ) : null;
  }
  if (typeof value === "string" && value.trim()) return <FeedbackParagraphs value={value} />;
  return null;
}

const FEEDBACK_SCORE_FIELDS = [
  ["score", "Score"],
  ["relevance_completeness", "Relevance & Completeness"],
  ["technical_accuracy_depth", "Technical Accuracy & Depth"],
  ["clarity_structure", "Clarity & Structure"],
  ["communication_quality", "Communication Quality"],
  ["confidence", "Confidence"],
];

function AiFeedbackContent({
  value,
  unavailable = "AI feedback unavailable.",
  strengths: savedStrengths,
  improvements: savedImprovements,
  fillerFeedback: savedFillerFeedback,
  fillerWordCount: savedFillerCount,
}) {
  const payload = parseFeedbackPayload(value);
  const trimmedValue = typeof value === "string" ? value.trimStart() : "";
  const isJsonText = trimmedValue.startsWith("{") || trimmedValue.startsWith("[");
  const scoreEntries = payload
    ? FEEDBACK_SCORE_FIELDS
      .map(([key, label]) => ({ key, label, value: payload[key] }))
      .filter((item) => item.value !== null && item.value !== undefined && item.value !== "")
    : [];
  const parsedFeedback = firstValue(payload, ["feedback", "detailed_feedback", "explanation"]);
  const feedback = parsedFeedback
    ?? (payload || isJsonText ? null : value);
  const fillerFeedback = firstValue(payload, ["filler_feedback", "filler_words_analysis", "filler_word_analysis"])
    ?? savedFillerFeedback;
  const fillerCount = firstValue(payload, ["filler_word_count", "filler_words_count"])
    ?? savedFillerCount;
  const strengths = firstValue(payload, ["strengths", "key_strengths"]) ?? savedStrengths;
  const improvements = firstValue(payload, ["improvements", "areas_for_improvement", "recommendations"])
    ?? savedImprovements;
  const hasEvaluation = scoreEntries.length > 0
    || hasSavedValue(feedback)
    || hasSavedValue(fillerFeedback)
    || hasSavedValue(fillerCount)
    || hasSavedValue(strengths)
    || hasSavedValue(improvements);

  if (!hasEvaluation) return <FeedbackContent value={null} unavailable={unavailable} />;

  return (
    <div className="space-y-4">
      {scoreEntries.length > 0 && (
        <section className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <h5 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Evaluation Breakdown</h5>
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {scoreEntries.map(({ key, label, value: score }) => (
              <div key={key} className="flex justify-between gap-3 py-1 border-b border-slate-200/50 last:border-b-0 text-sm">
                <dt className="text-slate-600">{label}</dt>
                <dd className="shrink-0 font-bold text-slate-900">{displayContent(score)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {hasSavedValue(feedback) && (
        <section>
          <h5 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Detailed Feedback</h5>
          <div className="space-y-2 text-sm leading-relaxed text-slate-700">
            <FeedbackParagraphs value={feedback} />
          </div>
        </section>
      )}
      {(hasSavedValue(fillerFeedback) || hasSavedValue(fillerCount)) && (
        <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
          <h5 className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-800">Filler Words Analysis</h5>
          {hasSavedValue(fillerCount) && (
            <p className="text-xs font-bold text-amber-900">Total Filler Words Count: {displayContent(fillerCount)}</p>
          )}
          {hasSavedValue(fillerFeedback) && (
            <div className="mt-1 space-y-2 text-sm text-amber-900/90">
              <FeedbackParagraphs value={fillerFeedback} />
            </div>
          )}
        </section>
      )}
      {hasSavedValue(strengths) && (
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <h5 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">Key Strengths</h5>
          <div className="text-sm text-emerald-900">
            <FeedbackList value={strengths} />
          </div>
        </section>
      )}
      {hasSavedValue(improvements) && (
        <section className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
          <h5 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-sky-800">Areas for Improvement</h5>
          <div className="text-sm text-sky-900">
            <FeedbackList value={improvements} />
          </div>
        </section>
      )}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getQuestionText(answer, question) {
  return displayContent(
    firstValue(answer, ["question_text", "prompt", "question"])
      || firstValue(question, ["question", "title", "prompt", "text"]),
  ) || "Question text unavailable";
}

function getAnswerText(answer) {
  return firstValue(answer, [
    "initial_answer",
    "initial_response",
    "user_transcript",
    "answer",
    "response",
    "transcript",
    "user_answer",
  ]);
}

function getFollowUpText(answer) {
  return firstValue(answer, [
    "follow_up_response",
    "followup_response",
    "follow_up_answer",
    "followup_answer",
    "follow_up_answer_text",
    "follow_up_transcript",
  ]);
}

function getIdealAnswer(answer, question) {
  return firstValue(answer, ["ideal_answer", "expected_answer", "model_answer"])
    || firstValue(question, ["ideal_answer", "expected_answer", "answer", "solution"]);
}

function getCameraNotes(answer) {
  return getEvaluationValue(getAnswerEvaluation(answer), [
    "camera_notes",
    "camera_feedback",
    "camera_evaluation",
    "non_verbal_feedback",
    "visual_feedback",
  ]);
}

function getAnswerEvaluation(answer) {
  return [
    answer,
    answer?.ai_evaluation,
    answer?.evaluation_result,
    answer?.evaluation,
    answer?.evaluation_data,
    answer?.feedback_data,
  ];
}

function getSessionEvaluation(session) {
  return [
    session,
    session?.ai_evaluation,
    session?.evaluation_result,
    session?.evaluation,
    session?.evaluation_data,
    session?.feedback_data,
  ];
}

async function loadSessionStudents(profileIds) {
  const filterValues = profileIds.map((id) => `"${id}"`).join(",");
  let result = await supabase
    .from("profiles")
    .select("id, auth_user_id, full_name, email")
    .or(`id.in.(${filterValues}),auth_user_id.in.(${filterValues})`);

  if (result.error && /column .* does not exist|could not find .* column/i.test(result.error.message || "")) {
    result = await supabase
      .from("profiles")
      .select("id, auth_user_id, full_name")
      .or(`id.in.(${filterValues}),auth_user_id.in.(${filterValues})`);
  }
  if (result.error && /column .* does not exist|could not find .* column/i.test(result.error.message || "")) {
    result = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
  }
  return result;
}

function SessionStatusBadge({ sessionInfo }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${sessionInfo.badgeClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${sessionInfo.dotClass}`} />
      {sessionInfo.status}
    </span>
  );
}

function OverallScoreBadge({ score, prominent = false, isCompleted = true, statusLabel = "COMPLETED" }) {
  const effectiveScore =
    isCompleted && score !== null && score !== undefined && Number.isFinite(Number(score))
      ? Number(score)
      : null;
  const formattedScore = isCompleted ? formatEriScore(effectiveScore) : "N/A";
  const isAvailable = isCompleted && formattedScore !== "N/A";
  const classification = getEriClassification(isAvailable ? effectiveScore : null);

  if (prominent) {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-lg ${
          isAvailable
            ? "bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-700 shadow-sky-500/25"
            : "bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 shadow-slate-500/20"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-100">
            <FaAward className={isAvailable ? "text-amber-300" : "text-slate-300"} />
            Overall (ERI)
          </span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {isAvailable ? classification.shortLabel : "N/A"}
          </span>
        </div>
        <p className="mt-2 text-3xl font-extrabold tracking-tight tabular-nums">{formattedScore}</p>
        <p className="mt-1 text-xs text-sky-100/90">
          {isAvailable
            ? classification.label
            : `Readiness: N/A (${statusLabel})`}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/90 p-3 transition group-hover:border-slate-200/90 group-hover:bg-white">
      <div className="flex items-center justify-between gap-1">
        <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          <FaAward className="text-sky-600 text-[11px]" />
          ERI
        </p>
      </div>
      <p className={`mt-1 truncate text-lg font-extrabold tabular-nums ${isAvailable ? "text-slate-900" : "text-slate-400"}`}>
        {formattedScore}
      </p>
      <div className="mt-1">
        {isAvailable ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${classification.badgeClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${classification.dotClass}`} />
            {classification.shortLabel}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-amber-700">
            {statusLabel === "IN PROGRESS" ? "In progress · N/A" : "Incomplete · N/A"}
          </span>
        )}
      </div>
    </div>
  );
}

function MetricScoreBadge({ label, score, icon: Icon, iconColor = "text-sky-600", subtitle, isCompleted = true }) {
  const formattedScore = isCompleted ? formatEriScore(score) : "N/A";
  const hasVal = isCompleted && formattedScore !== "N/A";
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/90 p-3 transition group-hover:border-slate-200/90 group-hover:bg-white">
      <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {Icon && <Icon className={`${iconColor} text-[11px]`} />}
        {label}
      </p>
      <p className={`mt-1 truncate text-lg font-extrabold tabular-nums ${hasVal ? "text-slate-900" : "text-slate-400"}`}>
        {formattedScore}
      </p>
      <p className="mt-1 truncate text-[11px] font-medium text-slate-400">
        {!isCompleted ? "Excluded · N/A" : subtitle || (hasVal ? "Performance" : "Pending")}
      </p>
    </div>
  );
}

function QuestionsBadge({ sessionInfo, fallbackCount = 0 }) {
  const total = sessionInfo?.questionCount || fallbackCount;
  const answered = sessionInfo?.answeredCount ?? total;
  const unanswered = sessionInfo?.unansweredCount ?? 0;

  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/90 p-3 transition group-hover:border-slate-200/90 group-hover:bg-white">
      <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <FaQuestionCircle className="text-cyan-600 text-[11px]" />
        Questions
      </p>
      <p className="mt-1 truncate text-lg font-extrabold text-slate-900 tabular-nums">
        {answered}/{total}
      </p>
      <p className="mt-1 truncate text-[11px] font-medium text-slate-400 tabular-nums">
        {sessionInfo?.isCompleted
          ? `${total} completed`
          : `${unanswered} unanswered`}
      </p>
    </div>
  );
}

function StudentPicker({ search, setSearch, students, selectedStudent, onSelect, onSearchStart, loading }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative w-full"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="relative">
        <div className="flex min-w-0 items-center rounded-2xl border border-slate-200/90 bg-white shadow-sm transition focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100">
          <FaSearch className="ml-4 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            id="student-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              onSearchStart();
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            placeholder={
              selectedStudent
                ? `Filter active: ${selectedStudent.full_name}`
                : "Search candidate by student name or email to filter sessions..."
            }
            aria-expanded={open}
            aria-controls="student-options"
            role="combobox"
            aria-autocomplete="list"
            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                onSearchStart();
              }}
              aria-label="Clear search query"
              className="mr-1 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <FaTimes className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle student list"
            className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-sky-700"
          >
            <FaChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </button>
        </div>

        {open && (
          <div
            id="student-options"
            role="listbox"
            className="absolute left-0 top-full z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-2 shadow-2xl shadow-sky-950/15"
          >
            <button
              type="button"
              role="option"
              aria-selected={!selectedStudent}
              onClick={() => {
                onSelect(null);
                setSearch("");
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                !selectedStudent ? "bg-sky-50 text-sky-800" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <FaLayerGroup className="text-xs" />
              </div>
              <span>All Students (Show All Recorded Sessions)</span>
            </button>
            <div className="my-1 border-t border-slate-100" />
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-slate-500" role="status">
                <FaSyncAlt className="animate-spin text-sky-600" />
                <span>Searching candidate profiles...</span>
              </div>
            ) : students.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-500">No matching students found.</p>
            ) : (
              students.map((student) => {
                const isSelected = selectedStudent?.id === student.id;
                return (
                  <button
                    key={student.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(student);
                      setSearch("");
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      isSelected ? "bg-sky-50/90 ring-1 ring-sky-200" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-xs font-bold text-white shadow-sm">
                      {getInitials(student.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{student.full_name}</span>
                      <span className="block truncate text-xs text-slate-500">{student.email || "Email unavailable"}</span>
                    </div>
                    {isSelected && <FaCheckCircle className="shrink-0 text-sky-600" />}
                  </button>
                );
              })
            )}
            {students.length === STUDENT_RESULT_LIMIT && (
              <p className="px-3 py-2 text-center text-xs text-slate-400">Type more letters to refine search.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionReview({ answer, question, index, isCompletedSession = true }) {
  const [expanded, setExpanded] = useState(index === 0);
  const questionId = firstValue(answer, ["question_id", "questionId", "question_ref"]);
  const ownAnswer = getAnswerText(answer);
  const followUp = getFollowUpText(answer);
  const idealAnswer = getIdealAnswer(answer, question);
  const evaluationRecords = getAnswerEvaluation(answer);
  const feedback = getEvaluationValue(evaluationRecords, [
    "ai_feedback",
    "ai_evaluation",
    "evaluation_result",
    "evaluation_data",
    "detailed_ai_feedback",
    "detailed_feedback",
    "feedback",
    "evaluation_feedback",
    "performance_feedback",
  ]);
  const feedbackPayload = parseFeedbackPayload(feedback);
  const strengths = getEvaluationValue(evaluationRecords, ["strengths", "key_strengths"])
    || firstValue(feedbackPayload, ["strengths", "key_strengths"]);
  const improvements = getEvaluationValue(evaluationRecords, [
    "improvements",
    "areas_for_improvement",
    "recommendations",
  ]) || firstValue(feedbackPayload, ["improvements", "areas_for_improvement", "recommendations"]);
  const fillerAnalysis = getEvaluationValue(evaluationRecords, [
    "filler_words_analysis",
    "filler_word_analysis",
    "filler_words_feedback",
    "filler_feedback",
  ]) || firstValue(feedbackPayload, ["filler_feedback", "filler_words_analysis", "filler_word_analysis"]);
  const fillerWordCount = getEvaluationValue(evaluationRecords, ["filler_word_count", "filler_words_count"]);
  const cameraNotes = getCameraNotes(answer);
  const questionNumber = firstValue(answer, ["question_number", "question_order", "order"])
    || firstValue(question, ["question_number", "question_order", "order"])
    || index + 1;
  const questionScore = firstValue(answer, ["ai_score", "score", "question_score", "answer_score"]);

  return (
    <article className="glass-card overflow-hidden rounded-3xl border border-white/80 shadow-md ring-1 ring-sky-100/80 transition-shadow hover:shadow-lg">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full flex-col gap-4 p-5 text-left transition hover:bg-sky-50/30 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100/80 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-800">
              Question {questionNumber}
            </span>
          </div>
          <h3 className="mt-2 text-base font-bold leading-snug text-slate-950 sm:text-lg">
            {getQuestionText(answer, question)}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`rounded-2xl border px-3.5 py-1.5 text-sm font-extrabold shadow-sm tabular-nums ${
              isCompletedSession
                ? "border-sky-100 bg-sky-50/90 text-sky-900"
                : "border-slate-200 bg-slate-100 text-slate-500"
            }`}
          >
            Score: {isCompletedSession ? displayScore(questionScore) : "N/A"}
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-sky-100 hover:text-sky-800">
            <FaChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2 sm:p-6 bg-slate-50/30">
          <ReviewSection title="Candidate's Answer">
            <FeedbackContent value={ownAnswer} unavailable="No answer recorded." />
          </ReviewSection>
          <ReviewSection title="Follow-Up Response">
            <FeedbackContent value={followUp} unavailable="No follow-up response." />
          </ReviewSection>
          <ReviewSection title="Answer Guide">
            <FeedbackContent value={idealAnswer} unavailable="Answer guide unavailable." />
          </ReviewSection>
          <ReviewSection title="AI Evaluation & Grading">
            {isCompletedSession ? (
              <AiFeedbackContent
                value={feedback}
                unavailable="Question-specific AI feedback unavailable."
                strengths={strengths}
                improvements={improvements}
                fillerFeedback={fillerAnalysis}
                fillerWordCount={fillerWordCount}
              />
            ) : (
              <p className="text-slate-500">
                Score: N/A — Incomplete sessions do not assign official question evaluation scores.
              </p>
            )}
          </ReviewSection>
          <ReviewSection title="Camera & Visual Notes" className="sm:col-span-2">
            <FeedbackContent value={cameraNotes} unavailable="Camera evaluation not available." />
          </ReviewSection>
          {questionId && !question && (
            <p className="text-xs text-slate-400 sm:col-span-2">The linked question database record is unavailable.</p>
          )}
        </div>
      )}
    </article>
  );
}

function ReviewSection({ title, children, className = "" }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h4>
      <div className="mt-2.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-800">{children}</div>
    </section>
  );
}

function SessionDetails({
  session,
  answers,
  questionsById,
  loading,
  error,
  studentName = "Candidate",
  studentEmail = "",
  onBack,
}) {
  const evaluationRecords = getSessionEvaluation(session);
  const overallAssessment = getEvaluationValue(evaluationRecords, [
    "overall_assessment",
    "overall_evaluation",
    "assessment",
    "final_assessment",
  ]);
  const examinerVerdict = getEvaluationValue(evaluationRecords, [
    "examiner_verdict",
    "verdict",
    "overall_verdict",
  ]);
  const aiFeedbackValue = getEvaluationValue(evaluationRecords, [
    "ai_feedback",
    "ai_evaluation",
    "evaluation_result",
    "evaluation_data",
    "detailed_ai_feedback",
    "detailed_feedback",
    "evaluation_feedback",
    "feedback_data",
  ]);
  const feedbackPayload = parseFeedbackPayload(aiFeedbackValue);
  const detailedFeedback = getEvaluationValue(evaluationRecords, [
    "detailed_ai_feedback",
    "detailed_feedback",
    "detailed_evaluation",
    "overall_feedback",
    "feedback",
    "performance_feedback",
    "explanation",
  ]) || firstValue(feedbackPayload, ["feedback", "detailed_feedback", "explanation"]) || aiFeedbackValue;
  const strengths = getEvaluationValue(evaluationRecords, ["strengths", "key_strengths"])
    || firstValue(feedbackPayload, ["strengths", "key_strengths"]);
  const improvements = getEvaluationValue(evaluationRecords, [
    "improvements",
    "areas_for_improvement",
    "recommendations",
  ]) || firstValue(feedbackPayload, ["improvements", "areas_for_improvement", "recommendations"]);
  const fillerAnalysis = getEvaluationValue(evaluationRecords, [
    "filler_words_analysis",
    "filler_word_analysis",
    "filler_words_feedback",
    "filler_analysis",
    "filler_feedback",
  ]) || firstValue(feedbackPayload, ["filler_feedback", "filler_words_analysis", "filler_word_analysis"]);
  const fillerWordCount = getEvaluationValue(evaluationRecords, ["filler_word_count", "filler_words_count"]);
  const cameraEvaluationItems = [
    {
      label: "Non-verbal Behavior",
      value: getEvaluationValue(evaluationRecords, ["non_verbal_behavior_feedback", "non_verbal_feedback"]),
    },
    {
      label: "Face Detection",
      value: getEvaluationValue(evaluationRecords, ["face_detection_observations", "face_detection_feedback"]),
    },
    {
      label: "Camera Positioning",
      value: getEvaluationValue(evaluationRecords, ["camera_positioning_observations", "camera_positioning_feedback"]),
    },
    {
      label: "Visual Data Quality",
      value: getEvaluationValue(evaluationRecords, ["visual_data_quality", "visual_quality_feedback"]),
    },
    {
      label: "Recommendations",
      value: getEvaluationValue(evaluationRecords, ["camera_recommendations", "camera_improvements"]),
    },
    {
      label: "Camera Evaluation",
      value: getEvaluationValue(evaluationRecords, ["camera_evaluation", "camera_feedback", "visual_feedback"]),
    },
  ].filter((item) => item.value !== null);
  const allocatedTime = getEvaluationValue(evaluationRecords, ["allocated_time", "time_allocated"]);
  const actualDuration = getEvaluationValue(evaluationRecords, [
    "actual_interview_duration",
    "interview_duration",
    "duration",
  ]);
  const timeRemaining = getEvaluationValue(evaluationRecords, ["time_remaining", "remaining_time"]);
  const timeManagementFeedback = getEvaluationValue(evaluationRecords, [
    "time_management_feedback",
    "time_management_analysis",
    "time_feedback",
  ]);
  const savedAiFeedback = aiFeedbackValue || detailedFeedback;
  const hasSessionFeedback = [
    examinerVerdict,
    savedAiFeedback,
    fillerAnalysis,
    strengths,
    improvements,
  ].some(hasSavedValue);
  const timeStats = [
    ["Allocated Time", allocatedTime],
    ["Actual Interview Duration", actualDuration],
    ["Time Remaining", timeRemaining],
  ].filter(([, value]) => hasSavedValue(value));
  const hasTimeManagement = timeStats.length > 0 || hasSavedValue(timeManagementFeedback);

  const sessionInfo = classifyInterviewSession(session, undefined, answers.length);
  const categoryById = Object.fromEntries(
    Object.entries(questionsById || {}).map(([id, q]) => [id, q?.category])
  );
  const sessionComputed = sessionInfo.isCompleted
    ? computeCategoryAveragesAndEri(answers, categoryById)
    : null;
  const sessionEri = sessionInfo.isCompleted
    ? sessionComputed?.eri ?? (session?.overall_score !== null && session?.overall_score !== undefined ? Number(session.overall_score) : null)
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/50 hover:text-sky-800"
        >
          <FaArrowLeft className="text-sky-600" /> Back to interview sessions
        </button>
        <span className="rounded-full bg-sky-50 px-3.5 py-1 text-xs font-bold text-sky-800 ring-1 ring-sky-200/80 shadow-sm">
          Session Inspection
        </span>
      </div>

      {/* Candidate Profile & Score Summary Banner */}
      <section className="glass-card-elevated relative overflow-hidden rounded-[2rem] border border-white/80 p-6 shadow-xl ring-1 ring-sky-100/90 sm:p-7">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-sky-400/15 via-blue-400/12 to-indigo-400/10 pointer-events-none rounded-t-[2rem]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-base font-bold text-white shadow-lg shadow-sky-500/25">
              {getInitials(studentName)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-extrabold text-slate-950 sm:text-2xl">{studentName}</h2>
                <SessionStatusBadge sessionInfo={sessionInfo} />
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  <FaBrain className="text-sky-600 text-[10px]" />
                  Mock Evaluation
                </span>
              </div>
              {studentEmail && <p className="text-xs text-slate-500">{studentEmail}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <FaCalendarAlt className="text-sky-500 text-[11px]" />
                  {formatDate(session.created_at)}
                </span>
                <span className="tabular-nums text-slate-500">
                  Answered: <strong className="text-slate-700">{sessionInfo.answeredCount}</strong> · Unanswered:{" "}
                  <strong className="text-slate-700">{sessionInfo.unansweredCount}</strong> · Planned:{" "}
                  <strong className="text-slate-700">{sessionInfo.questionCount}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[36rem]">
            <OverallScoreBadge
              score={sessionEri}
              prominent
              isCompleted={sessionInfo.isCompleted}
              statusLabel={sessionInfo.status}
            />
            <MetricScoreBadge
              label="Speech"
              score={session.speech_score}
              icon={FaMicrophone}
              iconColor="text-blue-500"
              subtitle="Verbal score"
              isCompleted={sessionInfo.isCompleted}
            />
            <MetricScoreBadge
              label="Camera"
              score={session.camera_score}
              icon={FaVideo}
              iconColor="text-indigo-500"
              subtitle="Visual score"
              isCompleted={sessionInfo.isCompleted}
            />
            <QuestionsBadge sessionInfo={sessionInfo} fallbackCount={answers.length} />
          </div>
        </div>

        {/* Category Averages & Readiness Integrity Strip */}
        <div className="relative mt-5 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-4 sm:grid-cols-5">
          {ERI_CATEGORIES.map((cat) => {
            const catScore = sessionInfo.isCompleted
              ? sessionComputed?.categoryAverages?.[cat] ?? null
              : null;
            return (
              <div
                key={cat}
                className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-center"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{cat}</p>
                <p
                  className={`mt-0.5 text-sm font-extrabold tabular-nums ${
                    catScore !== null ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  {sessionInfo.isCompleted ? formatEriScore(catScore) : "N/A"}
                </p>
              </div>
            );
          })}
          <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-center sm:col-span-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Readiness</p>
            <p
              className={`mt-0.5 text-xs font-extrabold ${
                sessionInfo.isCompleted && sessionEri !== null ? "text-sky-700" : "text-slate-400"
              }`}
            >
              {sessionInfo.isCompleted && sessionEri !== null
                ? getEriClassification(sessionEri).label
                : "N/A"}
            </p>
          </div>
        </div>

        {!sessionInfo.isCompleted && (
          <div className="relative mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
            <strong>{sessionInfo.status} Session:</strong> Partial, abandoned, and in-progress interviews are preserved in history for auditing but are excluded from category averages, readiness classification, and ERI scores.
          </div>
        )}
      </section>

      {/* Overall Assessment Banner */}
      {hasSavedValue(overallAssessment) && (
        <section className="glass-card rounded-3xl border border-white/80 p-6 shadow-md ring-1 ring-sky-100/80">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100/80 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-800">
              <FaAward className="text-sky-600 text-[11px]" /> Overall Assessment
            </span>
          </div>
          <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800">
            <FeedbackContent value={overallAssessment} />
          </div>
        </section>
      )}

      {/* Session Feedback & Camera Analysis */}
      {(hasSessionFeedback || cameraEvaluationItems.length > 0 || hasTimeManagement) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {hasSessionFeedback && (
            <section className="glass-card rounded-3xl border border-white/80 p-6 shadow-md ring-1 ring-sky-100/80">
              <div className="flex items-center gap-2 mb-4">
                <FaBrain className="text-sky-600 text-sm" />
                <h3 className="text-base font-bold text-slate-900">Overall Feedback & Critique</h3>
              </div>
              <div className="space-y-5 text-sm text-slate-800">
                {hasSavedValue(examinerVerdict) && (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-sky-800 mb-1">Examiner Verdict</h4>
                    <FeedbackContent value={examinerVerdict} />
                  </div>
                )}
                {(hasSavedValue(savedAiFeedback)
                  || hasSavedValue(fillerAnalysis)
                  || hasSavedValue(fillerWordCount)
                  || hasSavedValue(strengths)
                  || hasSavedValue(improvements)) && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Detailed AI Evaluation</h4>
                    <AiFeedbackContent
                      value={savedAiFeedback}
                      strengths={strengths}
                      improvements={improvements}
                      fillerFeedback={fillerAnalysis}
                      fillerWordCount={fillerWordCount}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {cameraEvaluationItems.length > 0 && (
            <section className="glass-card rounded-3xl border border-white/80 p-6 shadow-md ring-1 ring-sky-100/80">
              <div className="flex items-center gap-2 mb-4">
                <FaVideo className="text-indigo-600 text-sm" />
                <h3 className="text-base font-bold text-slate-900">Camera & Non-Verbal Observations</h3>
              </div>
              <div className="space-y-3.5 text-sm">
                {cameraEvaluationItems.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{item.label}</p>
                    <div className="text-slate-800">
                      <FeedbackContent value={item.value} />
                    </div>
                  </div>
                ))}
              </div>

              {hasTimeManagement && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FaClock className="text-amber-600 text-sm" />
                    <h4 className="text-sm font-bold text-slate-900">Time Management Analysis</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {timeStats.map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-slate-200/80 bg-white p-3 text-center">
                        <span className="block text-[11px] font-semibold text-slate-500">{label}</span>
                        <span className="mt-0.5 block text-sm font-bold text-slate-900">{displayContent(value)}</span>
                      </div>
                    ))}
                  </div>
                  {hasSavedValue(timeManagementFeedback) && (
                    <div className="mt-3 text-xs leading-relaxed text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <FeedbackContent value={timeManagementFeedback} />
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Question-by-Question Review */}
      <section className="mt-2">
        <div className="mb-4">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Detailed Breakdown</span>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Question-by-Question Review</h2>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Inspect individual question prompts, candidate responses, answer guides, and multi-modal evaluations.
          </p>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </p>
        )}

        {loading ? (
          <div className="grid gap-4" aria-busy="true">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-3xl bg-white/80 ring-1 ring-slate-100" />
            ))}
          </div>
        ) : answers.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            No question-level response records were captured for this evaluation session.
          </div>
        ) : (
          <div className="grid gap-4">
            {answers.map((answer, index) => {
              const questionId = firstValue(answer, ["question_id", "questionId", "question_ref"]);
              return (
                <QuestionReview
                  key={answer.id || `${session.id}-${index}`}
                  answer={answer}
                  question={questionId ? questionsById[questionId] : null}
                  index={index}
                  isCompletedSession={sessionInfo.isCompleted}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function AdminInterviewResults({ isStaff = false }) {
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState("");
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [sessionStudents, setSessionStudents] = useState({});
  const [answerCounts, setAnswerCounts] = useState({});
  const [sessionComputedEris, setSessionComputedEris] = useState({});
  const [sessionsPage, setSessionsPage] = useState(0);
  const [sessionsCount, setSessionsCount] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionAnswers, setSessionAnswers] = useState([]);
  const [questionsById, setQuestionsById] = useState({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const studentsRequest = useRef(0);
  const sessionsRequest = useRef(0);
  const detailsRequest = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedStudentSearch(studentSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [studentSearch]);

  useEffect(() => {
    let active = true;
    const request = ++studentsRequest.current;
    const search = debouncedStudentSearch.replace(/[\\%_,()"]/g, "\\$&");
    async function loadStudents() {
      let assignedIds = null;
      if (isStaff) {
        assignedIds = await fetchAssignedStudentIds();
        if (!active || request !== studentsRequest.current) return;
        if (assignedIds.length === 0) {
          setStudents([]);
          setStudentsLoading(false);
          return;
        }
      }

      let query = supabase
        .from("profiles")
        .select("id, auth_user_id, full_name, email")
        .order("full_name")
        .limit(STUDENT_RESULT_LIMIT);

      if (assignedIds) {
        const quotedIds = assignedIds.map((id) => `"${id}"`).join(",");
        query = query.or(`id.in.(${quotedIds}),auth_user_id.in.(${quotedIds})`);
      }

      if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      let result = await query;
      if (result.error && /column .* does not exist|could not find .* column/i.test(result.error.message || "")) {
        let fallback = supabase.from("profiles").select("id, auth_user_id, full_name").order("full_name").limit(STUDENT_RESULT_LIMIT);
        if (assignedIds) {
          const quotedIds = assignedIds.map((id) => `"${id}"`).join(",");
          fallback = fallback.or(`id.in.(${quotedIds}),auth_user_id.in.(${quotedIds})`);
        }
        if (search) fallback = fallback.ilike("full_name", `%${search}%`);
        result = await fallback;
      }
      if (result.error && /column .* does not exist|could not find .* column/i.test(result.error.message || "")) {
        let fallback = supabase.from("profiles").select("id, full_name").order("full_name").limit(STUDENT_RESULT_LIMIT);
        if (assignedIds) {
          fallback = fallback.in("id", assignedIds);
        }
        if (search) fallback = fallback.ilike("full_name", `%${search}%`);
        result = await fallback;
      }

      if (!active || request !== studentsRequest.current) return;
      if (result.error) {
        console.error("Unable to load interview result students:", result.error);
        setStudentsError("Unable to load students. Please try again.");
      } else {
        const scopedRows = assignedIds
          ? (result.data || []).filter((profile) => isAssignedStudentProfile(profile, assignedIds))
          : (result.data || []);

        setStudents(scopedRows.map((profile) => ({
          ...profile,
          full_name: profile.full_name || profile.email || "Unnamed student",
          email: profile.email || "",
          sessionProfileId: profile.auth_user_id || profile.id,
        })));
      }
      setStudentsLoading(false);
    }

    loadStudents().catch((error) => {
      if (!active || request !== studentsRequest.current) return;
      console.error("Unable to load interview result students:", error);
      setStudentsError("Unable to load students. Please try again.");
      setStudentsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [debouncedStudentSearch, isStaff]);

  useEffect(() => {
    let active = true;
    const request = ++sessionsRequest.current;
    async function loadSessions() {
      let assignedIds = null;
      if (isStaff) {
        assignedIds = await fetchAssignedStudentIds();
        if (!active || request !== sessionsRequest.current) return;
        if (assignedIds.length === 0) {
          setSessions([]);
          setSessionsCount(0);
          setAnswerCounts({});
          setSessionStudents({});
          setSessionsLoading(false);
          return;
        }
      }

      let query = supabase
        .from("interview_sessions")
        .select(SESSION_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(sessionsPage * SESSION_PAGE_SIZE, (sessionsPage + 1) * SESSION_PAGE_SIZE - 1);
      if (selectedStudent) {
        const studentProfileIds = [...new Set([
          selectedStudent.id,
          selectedStudent.auth_user_id,
        ].filter(Boolean))];
        const allowedIds = assignedIds
          ? studentProfileIds.filter((id) => assignedIds.includes(id))
          : studentProfileIds;
        if (allowedIds.length === 0) {
          setSessions([]);
          setSessionsCount(0);
          setAnswerCounts({});
          setSessionStudents({});
          setSessionsLoading(false);
          return;
        }
        query = query.in("profile_id", allowedIds);
      } else if (assignedIds) {
        query = query.in("profile_id", assignedIds);
      }

      const { data, error, count } = await query;
      if (!active || request !== sessionsRequest.current) return;
      if (error) {
        console.error("Unable to load interview sessions:", error);
        setSessionsError("Unable to load interview sessions. Please try again.");
        setSessions([]);
        setSessionsLoading(false);
        return;
      }

      const sessionRows = data || [];
      setSessions(sessionRows);
      setSessionsCount(count || 0);

      if (sessionRows.length > 0) {
        const profileIds = [...new Set(sessionRows.map((session) => session.profile_id).filter(Boolean))];
        const [resultResponse, profileResponse] = await Promise.all([
          supabase
            .from("interview_results")
            .select("id, session_id, question_id, ai_score, created_at")
            .in("session_id", sessionRows.map((session) => session.id)),
          profileIds.length > 0
            ? loadSessionStudents(profileIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (!active || request !== sessionsRequest.current) return;
        if (resultResponse.error) {
          console.error("Unable to load session response counts:", resultResponse.error);
          setSessionComputedEris({});
        } else {
          const rows = resultResponse.data || [];
          const counts = {};
          const bySession = {};
          for (const row of rows) {
            counts[row.session_id] = (counts[row.session_id] || 0) + 1;
            if (!bySession[row.session_id]) bySession[row.session_id] = [];
            bySession[row.session_id].push(row);
          }
          setAnswerCounts(counts);

          const qIds = [...new Set(rows.map((r) => r.question_id).filter(Boolean))];
          let qCategoryMap = {};
          if (qIds.length > 0) {
            const { data: qRows } = await supabase
              .from("questions")
              .select("id, category")
              .in("id", qIds);
            if (!active || request !== sessionsRequest.current) return;
            qCategoryMap = Object.fromEntries((qRows || []).map((q) => [q.id, q.category]));
          }

          const eris = {};
          for (const ses of sessionRows) {
            const info = classifyInterviewSession(ses, undefined, counts[ses.id] || 0);
            if (info.isCompleted) {
              const computed = computeCategoryAveragesAndEri(bySession[ses.id] || [], qCategoryMap);
              if (computed.eri !== null) {
                eris[ses.id] = computed.eri;
              }
            }
          }
          setSessionComputedEris(eris);
        }
        if (profileResponse.error) {
          console.error("Unable to load session student names:", profileResponse.error);
        } else {
          const names = {};
          for (const profile of profileResponse.data || []) {
            const student = {
              ...profile,
              full_name: profile.full_name || profile.email || "Unnamed student",
              email: profile.email || "",
            };
            if (profile.id) names[profile.id] = student;
            if (profile.auth_user_id) names[profile.auth_user_id] = student;
          }
          setSessionStudents(names);
        }
      } else {
        setAnswerCounts({});
        setSessionStudents({});
      }
      setSessionsLoading(false);
    }

    loadSessions().catch((error) => {
      if (!active || request !== sessionsRequest.current) return;
      console.error("Unable to load interview sessions:", error);
      setSessionsError("Unable to load interview sessions. Please try again.");
      setSessionsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isStaff, selectedStudent, sessionsPage]);

  const loadSessionDetails = useCallback(async (session) => {
    const request = ++detailsRequest.current;
    setSelectedSession(session);
    setDetailsLoading(true);
    setDetailsError("");
    setSessionAnswers([]);
    setQuestionsById({});

    try {
      const { data, error } = await supabase
        .from("interview_results")
        .select("*")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (request !== detailsRequest.current) return;

      const answers = data || [];
      setSessionAnswers(answers);
      const questionIds = [...new Set(answers
        .map((answer) => firstValue(answer, ["question_id", "questionId", "question_ref"]))
        .filter(Boolean))];

      if (questionIds.length > 0) {
        const { data: questionRows, error: questionError } = await supabase
          .from("questions")
          .select("*")
          .in("id", questionIds);
        if (questionError) {
          console.error("Unable to load linked interview questions:", questionError);
        } else if (request === detailsRequest.current) {
          setQuestionsById(Object.fromEntries((questionRows || []).map((question) => [question.id, question])));
        }
      }
    } catch (error) {
      if (request !== detailsRequest.current) return;
      console.error("Unable to load interview session details:", error);
      setDetailsError("Unable to load this interview review. Please try again.");
    } finally {
      if (request === detailsRequest.current) setDetailsLoading(false);
    }
  }, []);

  const visibleSessions = sessions;
  const pageCount = Math.max(1, Math.ceil(sessionsCount / SESSION_PAGE_SIZE));

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />
      {isStaff ? <StaffSidebar /> : <AdminSidebar />}
      <main className="relative ml-20 flex max-w-7xl flex-col gap-6 px-4 py-8 md:ml-64 md:px-8">
        {!selectedSession && (
          <>
            {/* Header Hero Card */}
            <section className="glass-card-elevated relative z-30 overflow-visible rounded-[2rem] border border-white/80 p-6 shadow-xl ring-1 ring-sky-100/90 sm:p-8">
              <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-sky-400/15 via-blue-400/12 to-indigo-400/10 pointer-events-none rounded-t-[2rem]" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-100 to-cyan-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-800 shadow-sm">
                    <FaShieldAlt className="text-sky-600 text-[10px]" />
                    {isStaff ? "Staff Performance Workspace" : "Admin Performance Console"}
                  </span>
                  <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                    Interview Results
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {isStaff
                      ? "Review interview evaluations, speech metrics, camera analysis, and question responses for students assigned to you."
                      : "Audit candidate mock interview evaluations, multi-modal speech & camera scoring, and question responses across all students."}
                  </p>
                </div>

                {/* Stat Pill Card */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl border border-sky-100/90 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Sessions Loaded</p>
                    <p className="mt-0.5 text-2xl font-extrabold text-slate-900">{sessionsCount}</p>
                  </div>
                  {selectedStudent && (
                    <div className="rounded-2xl border border-sky-200 bg-sky-50/90 px-4 py-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">Filter Applied</p>
                      <p className="mt-0.5 max-w-[140px] truncate text-sm font-bold text-sky-950">
                        {selectedStudent.full_name}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Integrated Search & Student Filter Bar */}
              <div className="relative mt-7 border-t border-slate-100/90 pt-6">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="student-search" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Filter by candidate
                    </label>
                    {selectedStudent && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudent(null);
                          setSessionsPage(0);
                          setSessionsLoading(true);
                          setAnswerCounts({});
                          setSelectedSession(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                      >
                        <FaTimes className="text-[10px]" /> Clear candidate filter
                      </button>
                    )}
                  </div>

                  <StudentPicker
                    search={studentSearch}
                    setSearch={setStudentSearch}
                    students={students}
                    selectedStudent={selectedStudent}
                    onSelect={(student) => {
                      setSelectedStudent(student);
                      setSessionsPage(0);
                      setSessionsLoading(true);
                      setAnswerCounts({});
                      setSelectedSession(null);
                    }}
                    onSearchStart={() => {
                      setStudentsLoading(true);
                      setStudentsError("");
                    }}
                    loading={studentsLoading}
                  />

                  <div className="flex min-h-5 items-center justify-between gap-2 text-xs text-slate-500">
                    {studentsError ? (
                      <p role="alert" className="font-semibold text-rose-600">{studentsError}</p>
                    ) : (
                      <p>
                        {selectedStudent
                          ? `Displaying interview sessions recorded for ${selectedStudent.full_name}`
                          : isStaff
                            ? "Choose an assigned candidate to review their historical sessions, or browse all assigned evaluations below."
                            : "Choose a candidate to inspect their specific interview track, or browse all evaluations across the cohort."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {sessionsError && (
              <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {sessionsError}
              </p>
            )}

            {/* Session History Section */}
            <section className="glass-card relative z-0 rounded-[2rem] border border-white/80 p-5 shadow-xl ring-1 ring-sky-100/80 sm:p-7">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-sky-700">
                    <FaClock className="text-sky-500" />
                    Evaluation History
                  </span>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                    {selectedStudent ? `${selectedStudent.full_name}'s Interviews` : "Recorded Interview Sessions"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                    Newest evaluation sessions appear first. Click any session to inspect question responses &amp; AI critique.
                  </p>
                </div>
                <span className="rounded-full bg-sky-50 px-3.5 py-1.5 text-xs font-bold text-sky-800 ring-1 ring-sky-200/80 shadow-sm">
                  {sessionsCount} {sessionsCount === 1 ? "session recorded" : "sessions recorded"}
                </span>
              </div>

              {sessionsLoading ? (
                <div className="grid gap-4" aria-busy="true" role="status" aria-label="Loading interview sessions">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="animate-pulse rounded-3xl border border-slate-100 bg-white/80 p-5 sm:p-6">
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-center gap-3.5 flex-1">
                          <div className="h-12 w-12 rounded-2xl bg-slate-200" />
                          <div className="space-y-2 flex-1">
                            <div className="h-4 w-40 rounded-full bg-slate-200" />
                            <div className="h-3 w-56 rounded-full bg-slate-100" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[36rem]">
                          {[1, 2, 3, 4].map((badge) => (
                            <div key={badge} className="h-20 rounded-2xl bg-slate-100" />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : visibleSessions.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                    <FaUserGraduate className="h-5 w-5" />
                  </div>
                  <p className="text-lg font-bold text-slate-800">No interview sessions found</p>
                  <p className="mt-1.5 text-sm text-slate-500">
                    {selectedStudent
                      ? "This student has no recorded mock interview evaluations yet."
                      : "There are no interview sessions to review yet."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {visibleSessions.map((session) => {
                    const recordedAnswersCount = answerCounts[session.id] || 0;
                    const sessionInfo = classifyInterviewSession(session, undefined, recordedAnswersCount);
                    const displaySessionEri = sessionInfo.isCompleted
                      ? sessionComputedEris[session.id] ?? session.overall_score
                      : null;
                    const student = sessionStudents[session.profile_id]
                      || students.find((s) => s.sessionProfileId === session.profile_id)
                      || (selectedStudent?.id === session.profile_id || selectedStudent?.auth_user_id === session.profile_id ? selectedStudent : null);
                    const studentName = student?.full_name || "Candidate";
                    const studentEmail = student?.email || "";

                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => loadSessionDetails(session)}
                        className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-sky-300 hover:shadow-xl hover:shadow-sky-500/10 focus:outline-none focus:ring-2 focus:ring-sky-400 sm:p-6"
                      >
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                          {/* Candidate & Session Meta */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-3.5">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-bold text-white shadow-md shadow-sky-500/20">
                                {getInitials(studentName)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="truncate text-base font-bold text-slate-950 transition group-hover:text-sky-800 sm:text-lg">
                                    {studentName}
                                  </h3>
                                  <SessionStatusBadge sessionInfo={sessionInfo} />
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                    <FaBrain className="text-[9px] text-sky-600" />
                                    Mock Interview
                                  </span>
                                </div>
                                {studentEmail && (
                                  <p className="truncate text-xs text-slate-500">{studentEmail}</p>
                                )}
                                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                  <span className="inline-flex items-center gap-1">
                                    <FaCalendarAlt className="text-sky-500/80 text-[11px]" />
                                    {formatDate(session.created_at)}
                                  </span>
                                  <span className="tabular-nums text-[11px] font-medium text-slate-500">
                                    Answered: {sessionInfo.answeredCount} · Unanswered: {sessionInfo.unansweredCount}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Scores Metric Badges */}
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[36rem]">
                            <OverallScoreBadge
                              score={displaySessionEri}
                              isCompleted={sessionInfo.isCompleted}
                              statusLabel={sessionInfo.status}
                            />
                            <MetricScoreBadge
                              label="Speech"
                              score={session.speech_score}
                              icon={FaMicrophone}
                              iconColor="text-blue-500"
                              subtitle="Verbal delivery"
                              isCompleted={sessionInfo.isCompleted}
                            />
                            <MetricScoreBadge
                              label="Camera"
                              score={session.camera_score}
                              icon={FaVideo}
                              iconColor="text-indigo-500"
                              subtitle="Visual presence"
                              isCompleted={sessionInfo.isCompleted}
                            />
                            <QuestionsBadge
                              sessionInfo={sessionInfo}
                              fallbackCount={recordedAnswersCount}
                            />
                          </div>
                        </div>

                        {/* Card Footer Action Bar */}
                        <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-3.5 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <FaEye className="text-sky-500 text-xs" />
                            Click to inspect question breakdowns, AI critique &amp; camera analysis
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 px-3.5 py-1.5 text-xs font-bold text-sky-700 ring-1 ring-sky-200/80 transition-all duration-200 group-hover:bg-gradient-to-r group-hover:from-sky-500 group-hover:to-blue-600 group-hover:text-white group-hover:ring-transparent group-hover:shadow-md group-hover:shadow-sky-500/25">
                            Review Session
                            <FaArrowRight className="text-[11px] transition-transform duration-200 group-hover:translate-x-1" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!sessionsLoading && sessionsCount > SESSION_PAGE_SIZE && (
                <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
                  <span className="text-xs font-semibold text-slate-500">
                    Page {sessionsPage + 1} of {pageCount}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSessionsLoading(true);
                        setSessionsPage((page) => Math.max(0, page - 1));
                      }}
                      disabled={sessionsPage === 0}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold transition hover:bg-slate-50 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSessionsLoading(true);
                        setSessionsPage((page) => Math.min(pageCount - 1, page + 1));
                      }}
                      disabled={sessionsPage >= pageCount - 1}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold transition hover:bg-slate-50 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {selectedSession && (
          <SessionDetails
            session={selectedSession}
            answers={sessionAnswers}
            questionsById={questionsById}
            loading={detailsLoading}
            error={detailsError}
            studentName={
              sessionStudents[selectedSession.profile_id]?.full_name
              || students.find((s) => s.sessionProfileId === selectedSession.profile_id)?.full_name
              || selectedStudent?.full_name
              || "Candidate"
            }
            studentEmail={
              sessionStudents[selectedSession.profile_id]?.email
              || students.find((s) => s.sessionProfileId === selectedSession.profile_id)?.email
              || selectedStudent?.email
              || ""
            }
            onBack={() => {
              detailsRequest.current += 1;
              setSelectedSession(null);
              setDetailsError("");
            }}
          />
        )}
      </main>
    </div>
  );
}

export default AdminInterviewResults;
