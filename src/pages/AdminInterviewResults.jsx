import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaChevronDown,
  FaSearch,
  FaUserGraduate,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import StaffSidebar from "../components/StaffSidebar";
import { supabase } from "../services/supabase";

const SESSION_PAGE_SIZE = 20;
const STUDENT_RESULT_LIMIT = 40;
const SESSION_COLUMNS = "*";

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
    return <p>{unavailable}</p>;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? (
      <ul className="list-disc space-y-1 pl-5">
        {value.map((item, index) => (
          <li key={`${index}-${displayContent(item)}`}>{displayContent(item)}</li>
        ))}
      </ul>
    ) : <p>{unavailable}</p>;
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
      <ul className="list-disc space-y-1 pl-5">
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
        <section>
          <h5 className="mb-2 font-semibold text-slate-700">Evaluation Breakdown</h5>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {scoreEntries.map(({ key, label, value: score }) => (
              <div key={key} className="flex justify-between gap-3 py-1">
                <dt>{label}</dt>
                <dd className="shrink-0 font-semibold">{displayContent(score)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {hasSavedValue(feedback) && (
        <section>
          <h5 className="mb-1 font-semibold text-slate-700">Detailed Feedback</h5>
          <div className="space-y-2"><FeedbackParagraphs value={feedback} /></div>
        </section>
      )}
      {(hasSavedValue(fillerFeedback) || hasSavedValue(fillerCount)) && (
        <section>
          <h5 className="mb-1 font-semibold text-slate-700">Filler Words Analysis</h5>
          {hasSavedValue(fillerCount) && <p>Filler words: {displayContent(fillerCount)}</p>}
          {hasSavedValue(fillerFeedback) && (
            <div className="mt-1 space-y-2"><FeedbackParagraphs value={fillerFeedback} /></div>
          )}
        </section>
      )}
      {hasSavedValue(strengths) && (
        <section>
          <h5 className="mb-1 font-semibold text-slate-700">Strengths</h5>
          <FeedbackList value={strengths} />
        </section>
      )}
      {hasSavedValue(improvements) && (
        <section>
          <h5 className="mb-1 font-semibold text-slate-700">Improvements</h5>
          <FeedbackList value={improvements} />
        </section>
      )}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
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

function ScoreBadge({ label, score, prominent = false }) {
  return (
    <div className={`min-w-0 rounded-2xl ${prominent ? "bg-gradient-to-br from-sky-600 to-blue-700 px-5 py-4 text-white shadow-lg shadow-sky-200" : "bg-slate-50 px-4 py-3 ring-1 ring-slate-100"}`}>
      <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${prominent ? "text-sky-100" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-1 truncate font-bold ${prominent ? "text-3xl" : "text-xl text-slate-900"}`}>{displayScore(score)}</p>
    </div>
  );
}

function StudentPicker({ search, setSearch, students, selectedStudent, onSelect, onSearchStart, loading }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative w-full max-w-2xl"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor="student-search" className="mb-2 block text-sm font-semibold text-slate-700">
        Find a student
      </label>
      <div className="relative">
        <div className="flex min-w-0 items-center rounded-2xl border border-slate-200 bg-white transition focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100">
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
            placeholder={selectedStudent ? selectedStudent.full_name : "Search by student name or email..."}
            aria-expanded={open}
            aria-controls="student-options"
            role="combobox"
            aria-autocomplete="list"
            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle student list"
            className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-sky-700"
          >
            <FaChevronDown />
          </button>
        </div>

        {open && (
          <div
            id="student-options"
            role="listbox"
            className="absolute left-0 top-full z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/15"
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
              className="w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-sky-700 hover:bg-sky-50"
            >
              All Students
            </button>
            {loading ? (
              <p className="px-3 py-4 text-sm text-slate-500" role="status">Searching students...</p>
            ) : students.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">No matching students found.</p>
            ) : students.map((student) => (
              <button
                key={student.id}
                type="button"
                role="option"
                aria-selected={selectedStudent?.id === student.id}
                onClick={() => {
                  onSelect(student);
                  setSearch("");
                  setOpen(false);
                }}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-sky-50"
              >
                <FaUserGraduate className="mt-1 shrink-0 text-sky-600" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{student.full_name}</span>
                  <span className="block truncate text-xs text-slate-500">{student.email || "Email unavailable"}</span>
                </span>
              </button>
            ))}
            {students.length === STUDENT_RESULT_LIMIT && (
              <p className="px-3 py-2 text-xs text-slate-400">Refine your search to see other students.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionReview({ answer, question, index }) {
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

  return (
    <article className="glass-card overflow-hidden rounded-3xl border border-white/80 shadow-lg ring-1 ring-sky-100/80">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full flex-col gap-4 p-5 text-left sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Question {questionNumber}</p>
          <h3 className="mt-2 text-base font-semibold leading-6 text-slate-950">
            {getQuestionText(answer, question)}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800">
            {displayScore(firstValue(answer, ["ai_score", "score", "question_score", "answer_score"]))}
          </span>
          <FaChevronDown className={`text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2 sm:p-6">
          <ReviewSection title="Your Answer">
            <FeedbackContent value={ownAnswer} unavailable="No answer recorded." />
          </ReviewSection>
          <ReviewSection title="Follow-Up Response">
            <FeedbackContent value={followUp} unavailable="No follow-up response." />
          </ReviewSection>
          <ReviewSection title="Ideal Answer">
            <FeedbackContent value={idealAnswer} unavailable="Ideal answer unavailable." />
          </ReviewSection>
          <ReviewSection title="AI Feedback">
            <AiFeedbackContent
              value={feedback}
              unavailable="Question-specific AI feedback unavailable."
              strengths={strengths}
              improvements={improvements}
              fillerFeedback={fillerAnalysis}
              fillerWordCount={fillerWordCount}
            />
          </ReviewSection>
          <ReviewSection title="Camera Notes" className="sm:col-span-2">
            <FeedbackContent value={cameraNotes} unavailable="Camera evaluation not available." />
          </ReviewSection>
          {questionId && !question && (
            <p className="text-xs text-slate-400 sm:col-span-2">The linked question record is unavailable.</p>
          )}
        </div>
      )}
    </article>
  );
}

function ReviewSection({ title, children, className = "" }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`}>
      <h4 className="text-sm font-bold text-slate-500">{title}</h4>
      <div className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-800">{children}</div>
    </section>
  );
}

function SessionDetails({ session, answers, questionsById, loading, error, onBack }) {
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

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <FaArrowLeft /> Back to sessions
      </button>

      <div className="flex flex-col gap-4">
        {hasSavedValue(overallAssessment) && (
          <div className="mx-auto mt-5 max-w-3xl rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center shadow-sm sm:px-7">
            <p className="mb-1 text-sm font-bold text-slate-500">Overall Assessment</p>
            <div className="whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-800">
              <FeedbackContent value={overallAssessment} />
            </div>
          </div>
        )}

        {(hasSessionFeedback || cameraEvaluationItems.length > 0 || hasTimeManagement) && (
          <div className="mx-auto mt-4 flex w-full max-w-4xl flex-col gap-4">
          {hasSessionFeedback && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-bold text-slate-500">Feedback</h2>
            <div className="mt-3 space-y-6 text-[15px] leading-6 text-slate-800">
              {hasSavedValue(examinerVerdict) && <div>
                <h3 className="mb-1 font-semibold text-slate-800">Examiner verdict</h3>
                <FeedbackContent value={examinerVerdict} />
              </div>}
              {(hasSavedValue(savedAiFeedback)
                || hasSavedValue(fillerAnalysis)
                || hasSavedValue(fillerWordCount)
                || hasSavedValue(strengths)
                || hasSavedValue(improvements)) && <div>
                <h3 className="mb-1 font-semibold text-slate-800">AI Feedback</h3>
                <AiFeedbackContent
                  value={savedAiFeedback}
                  strengths={strengths}
                  improvements={improvements}
                  fillerFeedback={fillerAnalysis}
                  fillerWordCount={fillerWordCount}
                />
              </div>}
            </div>
          </section>
          )}

          {cameraEvaluationItems.length > 0 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-bold text-slate-500">Camera Evaluation</h2>
            <div className="mt-3 space-y-4 text-[15px] leading-6 text-slate-800">
              {cameraEvaluationItems.map((item) => (
                <div key={item.label}>
                  <p className="mb-1 font-semibold text-slate-500">{item.label}</p>
                  <FeedbackContent value={item.value} />
                </div>
              ))}
            </div>
            {hasTimeManagement && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-base font-bold text-slate-500">Time Management</h3>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {timeStats.map(([label, value]) => (
                  <div key={label} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 last:border-b-0">
                    <span className="text-sm text-slate-500">{label}</span>
                    <span className="text-right text-sm font-semibold text-slate-800">{displayContent(value)}</span>
                  </div>
                ))}
              </div>
              {hasSavedValue(timeManagementFeedback) && (
                <div className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-800">
                  <FeedbackContent value={timeManagementFeedback} />
                </div>
              )}
            </div>
            )}
          </section>
          )}

          {cameraEvaluationItems.length === 0 && hasTimeManagement && (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-bold text-slate-500">Time Management</h2>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {timeStats.map(([label, value]) => (
                  <div key={label} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 last:border-b-0">
                    <span className="text-sm text-slate-500">{label}</span>
                    <span className="text-right text-sm font-semibold text-slate-800">{displayContent(value)}</span>
                  </div>
                ))}
              </div>
              {hasSavedValue(timeManagementFeedback) && (
                <div className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-800">
                  <FeedbackContent value={timeManagementFeedback} />
                </div>
              )}
            </section>
          )}
          </div>
        )}
      </div>

      <section>
        <div className="mb-4">
          <h2 className="text-2xl font-semibold text-slate-950">Question-by-question review</h2>
          <p className="mt-1 text-sm text-slate-500">Each card shows the answer and evaluation saved for that question.</p>
        </div>
        {error && <p role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        {loading ? (
          <div className="grid gap-4" aria-busy="true">
            {[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-3xl bg-white/80 ring-1 ring-slate-100" />)}
          </div>
        ) : answers.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            No question-level responses are available for this session.
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
      let query = supabase
        .from("profiles")
        .select("id, auth_user_id, full_name, email")
        .order("full_name")
        .limit(STUDENT_RESULT_LIMIT);

      if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      let result = await query;
      if (result.error && /column .* does not exist|could not find .* column/i.test(result.error.message || "")) {
        let fallback = supabase.from("profiles").select("id, auth_user_id, full_name").order("full_name").limit(STUDENT_RESULT_LIMIT);
        if (search) fallback = fallback.ilike("full_name", `%${search}%`);
        result = await fallback;
      }
      if (result.error && /column .* does not exist|could not find .* column/i.test(result.error.message || "")) {
        let fallback = supabase.from("profiles").select("id, full_name").order("full_name").limit(STUDENT_RESULT_LIMIT);
        if (search) fallback = fallback.ilike("full_name", `%${search}%`);
        result = await fallback;
      }

      if (!active || request !== studentsRequest.current) return;
      if (result.error) {
        console.error("Unable to load interview result students:", result.error);
        setStudentsError("Unable to load students. Please try again.");
      } else {
        setStudents((result.data || []).map((profile) => ({
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
  }, [debouncedStudentSearch]);

  useEffect(() => {
    let active = true;
    const request = ++sessionsRequest.current;
    async function loadSessions() {
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
        query = query.in("profile_id", studentProfileIds);
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
            .select("session_id")
            .in("session_id", sessionRows.map((session) => session.id)),
          profileIds.length > 0
            ? loadSessionStudents(profileIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (!active || request !== sessionsRequest.current) return;
        if (resultResponse.error) {
          console.error("Unable to load session response counts:", resultResponse.error);
        } else {
          const counts = {};
          for (const row of resultResponse.data || []) {
            counts[row.session_id] = (counts[row.session_id] || 0) + 1;
          }
          setAnswerCounts(counts);
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
  }, [selectedStudent, sessionsPage]);

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
      {isStaff ? <StaffSidebar /> : <AdminSidebar adminName="Administrator" />}
      <main className="relative ml-20 flex max-w-7xl flex-col gap-6 px-4 py-8 md:ml-64 md:px-8">
        {!selectedSession && (
          <>
            <section className="glass-card relative z-30 overflow-visible rounded-[2rem] border border-white/80 p-6 shadow-xl ring-1 ring-sky-100/80 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-xl">
                  <p className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-sky-700 ring-1 ring-sky-100">
                    <FaUserGraduate aria-hidden="true" /> {isStaff ? "Staff Workspace" : "Admin Dashboard"}
                  </p>
                  <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Interview Results</h1>
                  <p className="mt-3 leading-6 text-slate-600">
                    {isStaff
                      ? "Review interview results and responses for students assigned to you."
                      : "Review interview results and responses across all students."}
                  </p>
                </div>
                <div className="hidden rounded-2xl bg-gradient-to-br from-sky-50 to-cyan-50 p-4 text-right ring-1 ring-sky-100 lg:block">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Sessions loaded</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{sessionsCount}</p>
                </div>
              </div>
              <div className="mt-7 rounded-3xl bg-slate-50/90 p-4 ring-1 ring-slate-200/80 sm:p-5">
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
                <div className="mt-3 flex min-h-6 flex-wrap items-center justify-between gap-2">
                  {studentsError
                    ? <p role="alert" className="text-sm text-rose-600">{studentsError}</p>
                    : (
                      <p className="text-xs text-slate-500">
                        {selectedStudent
                          ? `Showing sessions for ${selectedStudent.full_name}`
                          : isStaff
                            ? "Choose an assigned student to filter their interview history, or browse all assigned sessions below."
                            : "Choose a student to filter their interview history, or browse all sessions below."}
                      </p>
                    )}
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
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-50"
                    >
                      Clear student filter
                    </button>
                  )}
                </div>
              </div>
            </section>

            {sessionsError && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{sessionsError}</p>}

            <section className="glass-card relative z-0 rounded-[2rem] border border-white/80 p-5 shadow-xl ring-1 ring-sky-100/80 sm:p-7">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">History</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                    {selectedStudent ? `${selectedStudent.full_name}'s Interviews` : "Interview Sessions"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">Newest sessions appear first.</p>
                </div>
                <span className="rounded-full bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 ring-1 ring-sky-100">
                  {sessionsCount} {sessionsCount === 1 ? "session" : "sessions"}
                </span>
              </div>

              {sessionsLoading ? (
                <div className="grid gap-4" aria-busy="true" role="status" aria-label="Loading interview sessions">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="animate-pulse rounded-3xl border border-slate-100 bg-white/80 p-5 sm:p-6">
                      <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="h-3 w-28 rounded-full bg-sky-100" />
                          <div className="h-5 w-64 max-w-full rounded-full bg-slate-200" />
                          <div className="h-4 w-full max-w-xl rounded-full bg-slate-100" />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[34rem]">
                          {[1, 2, 3, 4].map((badge) => <div key={badge} className="h-16 rounded-2xl bg-slate-100" />)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : visibleSessions.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center">
                  <p className="text-lg font-semibold text-slate-800">No interview sessions found</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {selectedStudent
                      ? "This student has no interview sessions yet."
                      : "There are no interview sessions to review yet."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {visibleSessions.map((session) => {
                    const answerCount = answerCounts[session.id] || 0;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => loadSessionDetails(session)}
                        className="group w-full rounded-3xl border border-slate-200/80 bg-white/90 p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-sky-300 sm:p-6"
                      >
                        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            {!selectedStudent && (
                              <p className="mb-1 text-sm font-semibold text-sky-700">
                                {sessionStudents[session.profile_id]?.full_name
                                  || students.find((student) => student.sessionProfileId === session.profile_id)?.full_name
                                  || "Student"}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-lg font-semibold text-slate-950 transition group-hover:text-sky-800">
                                Interview Session
                              </h3>
                            </div>
                            <p className="mt-2 text-sm font-medium text-slate-500">{formatDate(session.created_at)}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[34rem]">
                            <ScoreBadge label="Overall" score={session.overall_score} />
                            <ScoreBadge label="Speech" score={session.speech_score} />
                            <ScoreBadge label="Camera" score={session.camera_score} />
                            <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Questions</p>
                              <p className="mt-1 text-xl font-bold text-slate-900">
                                {firstValue(session, ["question_count", "total_questions", "questions_total"]) ?? answerCount}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                          <span>View scores, responses, and evaluation details</span>
                          <span className="text-sky-700 transition group-hover:translate-x-1">Review session <span aria-hidden="true">→</span></span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!sessionsLoading && sessionsCount > SESSION_PAGE_SIZE && (
                <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
                  <span>Page {sessionsPage + 1} of {pageCount}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSessionsLoading(true);
                        setSessionsPage((page) => Math.max(0, page - 1));
                      }}
                      disabled={sessionsPage === 0}
                      className="rounded-xl border border-slate-200 px-4 py-2 font-semibold disabled:opacity-50"
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
                      className="rounded-xl border border-slate-200 px-4 py-2 font-semibold disabled:opacity-50"
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
