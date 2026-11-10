import { useEffect, useMemo, useState } from "react";
import {
  FaFilter,
  FaPlus,
  FaSearch,
  FaTrash,
  FaEdit,
  FaQuestionCircle,
  FaTimes,
  FaLayerGroup,
  FaSignal,
  FaSyncAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimesCircle,
  FaShieldAlt,
  FaLightbulb,
  FaMagic,
  FaUndo,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";
import {
  VALID_CATEGORIES as categories,
  VALID_DIFFICULTIES as difficulties,
  validateQuestionWithAiOrRules,
} from "../services/questionValidator";

function getDifficultyBadge(difficulty) {
  switch (difficulty) {
    case "Easy":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80";
    case "Medium":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80";
    case "Hard":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

function getCategoryBadge(category) {
  switch (category) {
    case "Technical":
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-200/80";
    case "Behavioral":
      return "bg-violet-50 text-violet-700 ring-1 ring-violet-200/80";
    case "Situational":
      return "bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200/80";
    case "HR":
      return "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

function QuestionManagement() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [originalQuestion, setOriginalQuestion] = useState(null);
  const [correctionNotice, setCorrectionNotice] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [formState, setFormState] = useState({
    question: "",
    category: "",
    difficulty: "",
  });

  useEffect(() => {
    loadQuestions();
  }, []);

  async function loadQuestions() {
    setLoading(true);
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading questions:", error);
      alert("Unable to load questions. Check the console for details.");
      setLoading(false);
      return;
    }

    const normalized = (data || []).map((item) => ({
      ...item,
      id: item.id || item.question_id || item.uid,
      question: item.question || item.title || "Untitled question",
      category: item.category || item.topic || "HR",
      difficulty: item.difficulty || item.level || "Medium",
      answer: item.answer || item.solution || "",
      created_at: item.created_at || item.createdAt || new Date().toISOString(),
    }));

    setQuestions(normalized);
    setLoading(false);
  }

  const filteredQuestions = useMemo(() => {
    return questions.filter((question) => {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        !search ||
        question.question.toLowerCase().includes(search) ||
        question.answer.toLowerCase().includes(search) ||
        question.category.toLowerCase().includes(search);
      const matchesCategory = !categoryFilter || question.category === categoryFilter;
      const matchesDifficulty = !difficultyFilter || question.difficulty === difficultyFilter;
      return matchesSearch && matchesCategory && matchesDifficulty;
    });
  }, [searchTerm, categoryFilter, difficultyFilter, questions]);

  function resetForm() {
    setFormState({ question: "", category: "", difficulty: "" });
    setEditingQuestion(null);
    setValidationResult(null);
    setValidationAttempted(false);
    setValidationError("");
    setOriginalQuestion(null);
    setCorrectionNotice("");
  }

  function openAddForm() {
    resetForm();
    setIsFormOpen(true);
  }

  function startEdit(question) {
    setEditingQuestion(question);
    setFormState({
      question: question.question,
      category: question.category,
      difficulty: question.difficulty,
    });
    setValidationResult(null);
    setValidationAttempted(false);
    setValidationError("");
    setOriginalQuestion(null);
    setCorrectionNotice("");
    setIsFormOpen(true);
  }

  async function handleValidate(allowAutoCorrect = true) {
    if (!formState.question.trim()) {
      alert("Please provide the question prompt text before validating.");
      return null;
    }

    setIsValidating(true);
    setValidationError("");
    try {
      const result = await validateQuestionWithAiOrRules({
        question: formState.question,
        category: formState.category || "Technical",
        difficulty: formState.difficulty || "Medium",
        currentQuestionId: editingQuestion?.id,
      });

      if (!result || result.success === false) {
        const errorMsg = result?.error || "AI validation could not be completed. Please check service status.";
        setValidationError(errorMsg);
        setValidationResult(null);
        setValidationAttempted(false);
        return null;
      }

      // Automatic grammar and spelling correction application
      if (
        allowAutoCorrect &&
        result.wasCorrected &&
        result.correctedText &&
        result.correctedText !== formState.question.trim()
      ) {
        const prevText = formState.question;
        setOriginalQuestion(prevText);
        setFormState((prev) => ({ ...prev, question: result.correctedText }));
        setCorrectionNotice("Grammar and spelling automatically corrected.");
      }

      setValidationResult(result);
      setValidationAttempted(true);
      return result;
    } catch (err) {
      console.error("Validation error:", err);
      const message = err?.message || "Failed to contact Gemini AI validation service.";
      setValidationError(message);
      setValidationResult(null);
      setValidationAttempted(false);
      return null;
    } finally {
      setIsValidating(false);
    }
  }

  function handleUndoCorrection() {
    if (originalQuestion) {
      const reverted = originalQuestion;
      setFormState((prev) => ({ ...prev, question: reverted }));
      setOriginalQuestion(null);
      setCorrectionNotice("");
      setValidationResult(null);
      setValidationAttempted(false);
    }
  }

  function handleApplySuggestion() {
    if (validationResult?.suggestedQuestion) {
      const improved = validationResult.suggestedQuestion;
      setFormState((prev) => ({ ...prev, question: improved }));
      setValidationResult(null);

      setTimeout(() => {
        handleValidate(false);
      }, 50);
    }
  }

  async function handleSaveQuestion() {
    if (actionLoading || isValidating) return;

    const trimmedQuestion = formState.question.trim();
    if (!trimmedQuestion) {
      alert("Please provide the question prompt text.");
      return;
    }

    if (!formState.category) {
      alert("Please select a Category Track before creating the question.");
      return;
    }

    if (!formState.difficulty) {
      alert("Please select a Difficulty Tier before creating the question.");
      return;
    }

    // Automatically validate question on the spot if not yet validated
    let currentResult = validationResult;
    if (!validationAttempted || !currentResult) {
      currentResult = await handleValidate(true);
      if (!currentResult) {
        return;
      }
    }

    if (currentResult.status === "invalid") {
      alert(
        `Cannot save question:\n\n${
          currentResult?.overallFeedback || "The question fails mandatory validation checks. Please correct the flagged issues."
        }`
      );
      return;
    }

    const failedChecks = Object.entries(currentResult.checks || {})
      .filter(([, c]) => c.status === "fail")
      .map(([, c]) => `• ${c.title}: ${c.message}`);

    if (failedChecks.length > 0) {
      alert(`Cannot save question. The following required criteria failed:\n\n${failedChecks.join("\n")}\n\nPlease revise the question before saving.`);
      return;
    }

    if (currentResult.status === "needs_revision") {
      const proceed = window.confirm(
        `This question has quality warnings:\n\n${currentResult.overallFeedback}\n\nDo you want to proceed and save anyway?`
      );
      if (!proceed) {
        return;
      }
    }

    setActionLoading(true);
    const questionTextToSave = (currentResult.correctedText || formState.question).trim();
    const payload = {
      question: questionTextToSave,
      category: formState.category,
      difficulty: formState.difficulty,
    };

    const query = editingQuestion
      ? supabase.from("questions").update(payload).eq("id", editingQuestion.id).select("*")
      : supabase.from("questions").insert([payload]).select("*");

    const { data, error } = await query;

    if (error) {
      console.error("Error saving question:", error);
      alert(`Unable to save question: ${error.message || JSON.stringify(error)}`);
      setActionLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      console.warn("Question saved but no row returned from Supabase.");
    }

    await loadQuestions();
    resetForm();
    setIsFormOpen(false);
    setActionLoading(false);
  }

  function confirmDeleteQuestion(question) {
    setDeleteQuestionTarget(question);
  }

  async function deleteQuestion() {
    if (!deleteQuestionTarget) return;

    setActionLoading(true);
    const { error } = await supabase.from("questions").delete().eq("id", deleteQuestionTarget.id);

    if (error) {
      console.error("Error deleting question:", error);
      alert("Unable to delete question.");
      setActionLoading(false);
      return;
    }

    await loadQuestions();
    if (editingQuestion?.id === deleteQuestionTarget.id) {
      resetForm();
      setIsFormOpen(false);
    }
    setDeleteQuestionTarget(null);
    setActionLoading(false);
  }

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar />

      <main className="relative ml-20 flex max-w-7xl flex-col gap-8 px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Banner Hero */}
        <section className="glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-white/80 p-7 shadow-[0_25px_60px_-25px_rgba(14,116,144,0.35)] ring-1 ring-sky-100/90 fade-in-up sm:p-9">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-cyan-400/15 via-sky-400/12 to-indigo-400/10 pointer-events-none" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-100 to-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-cyan-800 shadow-sm">
                <FaQuestionCircle className="text-cyan-600 text-[11px]" />
                Curated Question Bank
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Question Management
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Create, customize, and validate candidate mock interview prompts across technical specializations and HR behavioral tracks.
              </p>
            </div>

            <button
              onClick={openAddForm}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-sky-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sky-500/40 active:translate-y-0"
            >
              <FaPlus className="text-xs" />
              <span>Create New Question</span>
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="relative mt-8 grid gap-4 sm:grid-cols-3">
            <div className="stat-card rounded-[1.75rem] border border-sky-100/80 bg-gradient-to-br from-sky-50/80 via-white to-cyan-50/60 p-6 shadow-[0_18px_35px_-22px_rgba(14,116,144,0.4)] ring-1 ring-sky-200/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-800">Total Questions</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <FaQuestionCircle className="text-sm" />
                </span>
              </div>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">{questions.length}</p>
              <p className="mt-1 text-xs text-slate-500">Live active interview prompts</p>
            </div>

            <div className="stat-card rounded-[1.75rem] border border-cyan-100/80 bg-gradient-to-br from-cyan-50/80 via-white to-sky-50/60 p-6 shadow-[0_18px_35px_-22px_rgba(14,116,144,0.4)] ring-1 ring-cyan-200/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Track Categories</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                  <FaLayerGroup className="text-sm" />
                </span>
              </div>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">
                {new Set(questions.map((item) => item.category)).size}
              </p>
              <p className="mt-1 text-xs text-slate-500">Technical, Behavioral, Situational, HR</p>
            </div>

            <div className="stat-card rounded-[1.75rem] border border-violet-100/80 bg-gradient-to-br from-violet-50/80 via-white to-indigo-50/60 p-6 shadow-[0_18px_35px_-22px_rgba(99,102,241,0.3)] ring-1 ring-violet-200/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-800">Difficulty Tiers</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <FaSignal className="text-sm" />
                </span>
              </div>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">
                {new Set(questions.map((item) => item.difficulty)).size}
              </p>
              <p className="mt-1 text-xs text-slate-500">Easy, Medium, and Hard stages</p>
            </div>
          </div>
        </section>

        {/* Filters & Table Card */}
        <section className="glass-card rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.4)] ring-1 ring-sky-100/90 fade-in-up sm:p-7">
          {/* Filter Bar */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FaFilter className="text-xs text-sky-700" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Filter &amp; Search Question Bank</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto]">
              {/* Search Input */}
              <div className="relative">
                <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search question keywords..."
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
                />
              </div>

              {/* Category Dropdown */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
              >
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>

              {/* Difficulty Dropdown */}
              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
              >
                <option value="">All Difficulties</option>
                {difficulties.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>{difficulty}</option>
                ))}
              </select>

              {/* Clear */}
              {(searchTerm || categoryFilter || difficultyFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setCategoryFilter("");
                    setDifficultyFilter("");
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                >
                  <FaTimes className="text-xs" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs text-slate-700">
                <thead className="bg-slate-50/90 text-left uppercase tracking-wider text-[11px] font-bold text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Question Prompt</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5">Difficulty</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-14 text-center text-slate-400">
                        <FaSyncAlt className="mx-auto mb-2 animate-spin text-base text-sky-600" />
                        Loading question bank...
                      </td>
                    </tr>
                  ) : filteredQuestions.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-14 text-center text-slate-400">
                        No questions found matching your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredQuestions.map((question) => (
                      <tr key={question.id} className="transition-colors hover:bg-sky-50/50">
                        <td className="px-5 py-4">
                          <p className="max-w-xl text-xs font-bold text-slate-900 leading-snug">
                            {question.question}
                          </p>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-bold ${getCategoryBadge(question.category)}`}>
                            {question.category}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-bold ${getDifficultyBadge(question.difficulty)}`}>
                            {question.difficulty}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEdit(question)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-sky-50 hover:text-sky-800"
                              title="Edit Question"
                            >
                              <FaEdit className="text-[10px]" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmDeleteQuestion(question)}
                              disabled={actionLoading}
                              className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100 disabled:opacity-50"
                              title="Delete Question"
                            >
                              <FaTrash className="text-[10px]" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Add / Edit Question Modal with Automatic Grammar Correction */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 shadow-2xl ring-1 ring-slate-200/80 fade-in-up">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-7 py-5 sm:px-9">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">Question Bank</p>
                <h3 className="mt-0.5 text-2xl font-extrabold text-slate-950">
                  {editingQuestion ? "Edit Interview Question" : "Add New Interview Question"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(false);
                }}
                className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <FaTimes className="text-sm" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-7 py-5 sm:px-9 space-y-5">
              {/* Question Text Area & Validation Action */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Question Prompt Text
                  </label>
                  <div className="flex items-center gap-3">
                    <span className={`text-[11px] font-bold ${
                      formState.question.trim().length === 0
                        ? "text-slate-400"
                        : formState.question.trim().length < 15 || formState.question.trim().length > 500
                          ? "text-rose-600"
                          : "text-emerald-600"
                    }`}>
                      {formState.question.trim().length} / 500 chars
                    </span>
                    <button
                      type="button"
                      onClick={() => handleValidate(true)}
                      disabled={isValidating || !formState.question.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-800 shadow-sm transition hover:bg-sky-100 disabled:opacity-50"
                    >
                      {isValidating ? (
                        <>
                          <FaSyncAlt className="animate-spin text-[10px]" /> Checking...
                        </>
                      ) : (
                        <>
                          <FaShieldAlt className="text-[10px] text-sky-600" /> Validate Question
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <textarea
                  value={formState.question}
                  onChange={(e) => {
                    setFormState({ ...formState, question: e.target.value });
                    if (validationResult) setValidationResult(null);
                    if (validationAttempted) setValidationAttempted(false);
                    if (validationError) setValidationError("");
                    if (correctionNotice && !originalQuestion) setCorrectionNotice("");
                  }}
                  rows={3}
                  placeholder="e.g., Can you describe a challenging technical project you worked on and how you resolved unexpected roadblocks?"
                  className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                />

                {/* AI Error Notification */}
                {validationError && (
                  <div className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50/95 p-3 text-xs text-rose-950 shadow-sm animate-fadeIn">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-rose-200 text-rose-700 mt-0.5">
                      <FaTimesCircle className="text-xs" />
                    </span>
                    <div className="flex-1">
                      <p className="font-bold">Validation Error</p>
                      <p className="mt-0.5 text-rose-800 text-[11px] leading-relaxed">{validationError}</p>
                    </div>
                  </div>
                )}

                {/* Automatic Grammar Correction Notification with Side-by-Side Comparison */}
                {originalQuestion && formState.question !== originalQuestion && (
                  <div className="mt-2.5 rounded-xl border border-sky-200 bg-sky-50/90 p-3.5 text-xs font-semibold text-sky-900 shadow-sm space-y-2 animate-fadeIn">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-200 text-sky-700 text-xs">
                          ✨
                        </span>
                        <span className="font-bold">{correctionNotice || "Grammar and spelling automatically corrected."}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleUndoCorrection}
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-300 hover:bg-sky-100 transition shadow-sm"
                        title="Revert to your original uncorrected question"
                      >
                        <FaUndo className="text-[9px]" /> Undo Correction
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 pt-1 border-t border-sky-200/60 text-[11px]">
                      <div className="rounded-lg bg-white/70 p-2 border border-sky-100">
                        <span className="block font-bold text-slate-500 uppercase tracking-wider text-[9px]">Original Input</span>
                        <span className="font-mono text-slate-700 text-xs break-words">{originalQuestion}</span>
                      </div>
                      <div className="rounded-lg bg-white/95 p-2 border border-sky-300 ring-1 ring-sky-400/20">
                        <span className="block font-bold text-emerald-700 uppercase tracking-wider text-[9px]">Corrected by AI</span>
                        <span className="font-semibold text-slate-900 text-xs break-words">{formState.question}</span>
                      </div>
                    </div>

                    {validationResult?.changes && validationResult.changes.length > 0 && (
                      <div className="pt-1 text-[11px] text-sky-800">
                        <span className="font-bold">Changes Made: </span>
                        {validationResult.changes.join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Category and Difficulty Selectors */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Category Track <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formState.category}
                    onChange={(e) => {
                      setFormState((prev) => ({ ...prev, category: e.target.value }));
                      if (validationAttempted) setValidationAttempted(false);
                    }}
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                  >
                    <option value="">Select Category Track</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Difficulty Tier <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formState.difficulty}
                    onChange={(e) => {
                      setFormState((prev) => ({ ...prev, difficulty: e.target.value }));
                    }}
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                  >
                    <option value="">Select Difficulty Tier</option>
                    {difficulties.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Validation Results Panel */}
              {validationResult && (
                <div className={`rounded-2xl border p-4 sm:p-5 transition-all ${
                  validationResult.status === "valid"
                    ? "border-emerald-200 bg-emerald-50/70"
                    : validationResult.status === "needs_revision"
                      ? "border-amber-200 bg-amber-50/70"
                      : "border-rose-200 bg-rose-50/70"
                }`}>
                  {/* Overall Status Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {validationResult.status === "valid" ? (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                          <FaCheckCircle className="text-sm" />
                        </span>
                      ) : validationResult.status === "needs_revision" ? (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                          <FaExclamationTriangle className="text-sm" />
                        </span>
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                          <FaTimesCircle className="text-sm" />
                        </span>
                      )}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          {validationResult.status === "valid"
                            ? "Question Validated Successfully"
                            : validationResult.status === "needs_revision"
                              ? "Question Needs Revision"
                              : "Question Validation Failed"}
                        </h4>
                        <p className="text-[11px] font-medium text-slate-600 mt-0.5">
                          {validationResult.overallFeedback}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                      validationResult.status === "valid"
                        ? "bg-emerald-200/80 text-emerald-900"
                        : validationResult.status === "needs_revision"
                          ? "bg-amber-200/80 text-amber-900"
                          : "bg-rose-200/80 text-rose-900"
                    }`}>
                      Score: {validationResult.score}%
                    </span>
                  </div>

                  {/* Suggested Improvement if generated */}
                  {validationResult.suggestedQuestion && (
                    <div className="mt-4 rounded-xl border border-sky-200/80 bg-white/95 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-900">
                          <FaLightbulb className="text-amber-500 text-xs" />
                          Suggested Improved Version:
                        </span>
                        <button
                          type="button"
                          onClick={handleApplySuggestion}
                          className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm transition hover:bg-sky-700"
                        >
                          <FaMagic className="text-[10px]" /> Apply Suggestion
                        </button>
                      </div>
                      <p className="text-xs text-slate-800 italic">
                        &ldquo;{validationResult.suggestedQuestion}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* 5 Distinct Validation Indicators */}
                  <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                    {Object.entries(validationResult.checks).map(([key, check]) => {
                      const isPass = check.status === "pass";
                      const isWarn = check.status === "warn";
                      return (
                        <div
                          key={key}
                          className={`rounded-xl border p-2.5 text-xs transition-colors ${
                            isPass
                              ? "border-emerald-100 bg-white/80"
                              : isWarn
                                ? "border-amber-200 bg-amber-50/50"
                                : "border-rose-200 bg-rose-50/80"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-bold text-slate-800 text-[11px]">{check.title}</span>
                            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              isPass
                                ? "bg-emerald-100 text-emerald-800"
                                : isWarn
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-rose-100 text-rose-800"
                            }`}>
                              {isPass ? "Pass" : isWarn ? "Warning" : "Failed"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-snug">{check.message}</p>
                          {check.matches && check.matches.length > 0 && (
                            <div className="mt-2 space-y-1 border-t border-slate-200/50 pt-1.5">
                              <p className="text-[10px] font-bold text-slate-700">Matching Question Bank Item:</p>
                              {check.matches.slice(0, 2).map((match, idx) => (
                                <p key={idx} className="text-[10px] text-slate-600 truncate">
                                  • &ldquo;{match.question}&rdquo; ({match.similarity ? `${match.similarity}% similar` : "Exact match"})
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 px-7 py-4 sm:px-9 bg-slate-50/60 rounded-b-[2.25rem]">
              <div className="text-[11px] font-medium text-slate-500">
                {isValidating ? (
                  <span className="text-sky-700 font-semibold flex items-center gap-1.5 animate-pulse">
                    <FaSyncAlt className="text-sky-500 text-xs animate-spin" /> AI analyzing and validating question...
                  </span>
                ) : !validationAttempted ? (
                  <span className="text-slate-600 font-medium flex items-center gap-1.5">
                    <FaShieldAlt className="text-sky-500 text-xs" /> Click &ldquo;Validate Question&rdquo; or click &ldquo;{editingQuestion ? "Update Question" : "Create Question"}&rdquo; to validate & save.
                  </span>
                ) : validationResult?.status === "invalid" ? (
                  <span className="text-rose-600 font-semibold flex items-center gap-1.5">
                    <FaTimesCircle className="text-rose-500 text-xs" /> Question failed validation and cannot be saved.
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                    <FaCheckCircle className="text-emerald-500 text-xs" /> Validation passed. Ready to save.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsFormOpen(false);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuestion}
                  disabled={
                    actionLoading ||
                    isValidating ||
                    !formState.question.trim() ||
                    !formState.category ||
                    !formState.difficulty ||
                    (validationAttempted && validationResult?.status === "invalid")
                  }
                  className={`rounded-xl px-6 py-2.5 text-xs font-bold text-white shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    !formState.question.trim() ||
                    !formState.category ||
                    !formState.difficulty ||
                    (validationAttempted && validationResult?.status === "invalid")
                      ? "bg-slate-400"
                      : "bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 shadow-sky-500/30 hover:shadow-sky-500/50"
                  }`}
                >
                  {actionLoading
                    ? "Saving Question..."
                    : isValidating
                      ? "Validating..."
                      : editingQuestion
                        ? "Update Question"
                        : "Create Question"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Question Confirmation Modal */}
      {deleteQuestionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-slate-200/80 fade-in-up">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <FaTrash className="text-lg" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-950">Delete question from bank?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              This prompt will be removed permanently from future mock interview generation sessions.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteQuestionTarget(null)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteQuestion}
                disabled={actionLoading}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/30 transition hover:bg-rose-700 disabled:opacity-60"
              >
                {actionLoading ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestionManagement;
