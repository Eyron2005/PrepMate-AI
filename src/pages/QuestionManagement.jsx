import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  FaRedo,
  FaBriefcase,
  FaBookOpen,
  FaRobot,
  FaIndustry,
  FaSlidersH,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { fetchInterviewModeCatalog } from "../services/interviewMode";
import { supabase } from "../services/supabase";
import {
  CATEGORY_OPTIONS,
  VALID_DIFFICULTIES,
  buildQuestionSavePayload,
  getCategoryDisplayLabel,
  normalizeQuestionCategory,
  regenerateIdealAnswerWithAi,
  toDisplayDifficultyTier,
  toDifficultyCode,
  validateQuestionWithAiOrRules,
} from "../services/questionValidator";

function getDifficultyBadge(difficulty) {
  const tier = toDisplayDifficultyTier(difficulty) || difficulty;
  switch (tier) {
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
  switch (normalizeQuestionCategory(category)) {
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

function formatQuestionDate(iso) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function QuestionManagement() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isGeneratingIdealAnswer, setIsGeneratingIdealAnswer] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [idealAnswerError, setIdealAnswerError] = useState("");
  const [formError, setFormError] = useState("");
  const [statusBanner, setStatusBanner] = useState(null);
  const [originalQuestion, setOriginalQuestion] = useState(null);
  const [correctionNotice, setCorrectionNotice] = useState("");
  const [difficultyInfo, setDifficultyInfo] = useState(null);
  const [idealAnswerMode, setIdealAnswerMode] = useState("");
  const [modeConfig, setModeConfig] = useState({
    industries: [],
    jobRoles: [],
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [formState, setFormState] = useState({
    question: "",
    industry_id: "",
    job_role_id: "",
    category: "",
    difficulty: "",
    ideal_answer: "",
    is_active: true,
  });

  useEffect(() => {
    loadQuestions();
  }, []);

  async function loadQuestions() {
    setLoading(true);
    const [questionsRes, configRes] = await Promise.all([
      supabase.from("questions").select("*").order("created_at", { ascending: false }),
      fetchInterviewModeCatalog(),
    ]);

    if (questionsRes.error) {
      console.error("Error loading questions:", questionsRes.error);
      setStatusBanner({
        type: "error",
        text: `Unable to load questions: ${questionsRes.error.message || "Database query failed."}`,
      });
      setLoading(false);
      return;
    }

    const nextConfig = configRes.ok && configRes.data
      ? {
          industries: configRes.data.industries || [],
          jobRoles: configRes.data.jobRoles || [],
        }
      : {
          industries: [],
          jobRoles: [],
        };

    if (!configRes.ok) {
      console.warn("Unable to load Industries & Job Roles:", configRes.error);
    }

    setModeConfig(nextConfig);

    const industryNameById = Object.fromEntries(nextConfig.industries.map((i) => [i.id, i.name]));
    const roleNameById = Object.fromEntries(nextConfig.jobRoles.map((r) => [r.id, r.name]));

    const normalized = (questionsRes.data || []).map((item) => ({
      ...item,
      id: item.id || item.question_id || item.uid,
      question: item.question || item.title || "Untitled question",
      category: normalizeQuestionCategory(item.category || item.topic) || "HR",
      industry_id: item.industry_id || "",
      industryName: (item.industry_id && industryNameById[item.industry_id]) || "",
      job_role_id: item.job_role_id || "",
      job_role:
        (item.job_role_id && roleNameById[item.job_role_id]) ||
        (typeof item.job_role === "string" ? item.job_role.trim() : ""),
      difficulty: toDisplayDifficultyTier(item.difficulty_code || item.difficulty || item.level) || "Medium",
      ideal_answer: item.ideal_answer || item.answer || item.solution || "",
      is_active: item.is_active ?? item["is _active"] ?? true,
      created_at: item.created_at || item.createdAt || new Date().toISOString(),
    }));

    setQuestions(normalized);
    setLoading(false);
  }

  const industryById = useMemo(
    () => Object.fromEntries(modeConfig.industries.map((i) => [i.id, i])),
    [modeConfig.industries]
  );

  const jobRoleById = useMemo(
    () => Object.fromEntries(modeConfig.jobRoles.map((r) => [r.id, r])),
    [modeConfig.jobRoles]
  );

  const modalIndustries = useMemo(() => {
    return modeConfig.industries.filter(
      (ind) => ind.is_active || ind.id === editingQuestion?.industry_id || ind.id === formState.industry_id
    );
  }, [modeConfig.industries, editingQuestion, formState.industry_id]);

  const modalJobRoles = useMemo(() => {
    return modeConfig.jobRoles.filter((jr) => {
      const visible =
        jr.is_active || jr.id === editingQuestion?.job_role_id || jr.id === formState.job_role_id;
      if (!visible) return false;
      if (formState.industry_id) {
        return jr.industry_id === formState.industry_id || jr.id === formState.job_role_id;
      }
      return true;
    });
  }, [
    modeConfig.jobRoles,
    formState.industry_id,
    formState.job_role_id,
    editingQuestion,
  ]);

  const filteredQuestions = useMemo(() => {
    return questions.filter((question) => {
      const search = searchTerm.toLowerCase();
      const categoryLabel = getCategoryDisplayLabel(question.category).toLowerCase();
      const matchesSearch =
        !search ||
        question.question.toLowerCase().includes(search) ||
        question.ideal_answer.toLowerCase().includes(search) ||
        question.category.toLowerCase().includes(search) ||
        categoryLabel.includes(search) ||
        (question.industryName || "").toLowerCase().includes(search) ||
        (question.job_role || "").toLowerCase().includes(search) ||
        String(question.id || "").toLowerCase().includes(search);
      const matchesIndustry = !industryFilter || question.industry_id === industryFilter;
      const matchesCategory = !categoryFilter || question.category === categoryFilter;
      const matchesDifficulty = !difficultyFilter || question.difficulty === difficultyFilter;
      return matchesSearch && matchesIndustry && matchesCategory && matchesDifficulty;
    });
  }, [
    searchTerm,
    industryFilter,
    categoryFilter,
    difficultyFilter,
    questions,
  ]);

  function getSelectedJobRoleName() {
    if (formState.job_role_id && jobRoleById[formState.job_role_id]) {
      return jobRoleById[formState.job_role_id].name;
    }
    if (editingQuestion?.job_role && !formState.job_role_id) {
      return editingQuestion.job_role;
    }
    if (formState.industry_id && industryById[formState.industry_id]) {
      return `${industryById[formState.industry_id].name} Candidate`;
    }
    return "Interview Candidate";
  }

  function resetForm() {
    const defaultIndustry = modeConfig.industries.find((ind) => ind.is_active) || null;
    setFormState({
      question: "",
      industry_id: defaultIndustry?.id || "",
      job_role_id: "",
      category: "",
      difficulty: "",
      ideal_answer: "",
      is_active: true,
    });
    setEditingQuestion(null);
    setValidationResult(null);
    setValidationAttempted(false);
    setValidationError("");
    setIdealAnswerError("");
    setFormError("");
    setOriginalQuestion(null);
    setCorrectionNotice("");
    setDifficultyInfo(null);
    setIdealAnswerMode("");
  }

  function openAddForm() {
    resetForm();
    setStatusBanner(null);
    setIsFormOpen(true);
  }

  function startEdit(question) {
    setEditingQuestion(question);
    setStatusBanner(null);
    const normalizedDiff = toDisplayDifficultyTier(question.difficulty) || question.difficulty || "";
    const normalizedCategory = normalizeQuestionCategory(question.category) || "HR";
    const savedAiCode = toDifficultyCode(question.ai_suggested_difficulty);
    const savedAiTier = toDisplayDifficultyTier(savedAiCode);
    const savedStatus = question.classification_status || (savedAiCode ? "COMPLETED" : null);
    const savedMethod =
      question.classification_method ||
      (savedAiTier && normalizedDiff && savedAiTier !== normalizedDiff
        ? "ADMIN_OVERRIDE"
        : savedAiTier
          ? "AI"
          : null);

    const matchedIndustryId = question.industry_id || "";

    let matchedRoleId = question.job_role_id || "";
    if (!matchedRoleId && question.job_role) {
      const foundRole = modeConfig.jobRoles.find(
        (jr) =>
          jr.name.toLowerCase() === String(question.job_role).trim().toLowerCase() &&
          (!matchedIndustryId || jr.industry_id === matchedIndustryId)
      );
      if (foundRole) matchedRoleId = foundRole.id;
    }

    setFormState({
      question: question.question,
      industry_id: matchedIndustryId,
      job_role_id: matchedRoleId,
      category: normalizedCategory,
      difficulty: normalizedDiff,
      ideal_answer: question.ideal_answer || "",
      is_active: question.is_active !== false,
    });
    setValidationResult(null);
    setValidationAttempted(false);
    setValidationError("");
    setIdealAnswerError("");
    setFormError("");
    setOriginalQuestion(null);
    setCorrectionNotice("");
    setIdealAnswerMode(question.ideal_answer?.trim() ? "saved" : "");
    setDifficultyInfo(
      savedAiCode || savedMethod || question.difficulty_reason || question.difficulty_assessment
        ? {
            status: savedStatus || "COMPLETED",
            aiSuggestedDifficulty: savedAiCode,
            difficultyTier: savedAiTier,
            assessment: question.difficulty_assessment || null,
            reason: question.difficulty_reason || "",
            method: savedMethod,
          }
        : null
    );
    setIsFormOpen(true);
  }

  async function handleValidate(allowAutoCorrect = true) {
    if (isValidating || isGeneratingIdealAnswer || actionLoading) return null;

    if (!formState.question.trim()) {
      setValidationError("Please provide the question prompt text before validating.");
      return null;
    }

    if (!normalizeQuestionCategory(formState.category)) {
      setValidationError("Please select a Category before validating so AI can classify difficulty and generate an Answer Guide.");
      return null;
    }

    const effectiveJobRole = getSelectedJobRoleName();

    setIsValidating(true);
    setValidationError("");
    setIdealAnswerError("");
    setFormError("");

    try {
      const result = await validateQuestionWithAiOrRules({
        question: formState.question,
        category: formState.category,
        jobRole: effectiveJobRole,
        difficulty: formState.difficulty,
        currentQuestionId: editingQuestion?.id,
      });

      const cls = result?.difficultyClassification;
      if (!result || result.success === false || !cls) {
        const errorMsg =
          result?.error ||
          "AI validation and Answer Guide generation could not be completed. Please retry.";
        setValidationError(errorMsg);
        setValidationResult(null);
        setValidationAttempted(false);
        setDifficultyInfo((prev) => ({
          ...(prev || {}),
          status: "FAILED",
        }));
        return null;
      }

      if (
        allowAutoCorrect &&
        result.wasCorrected &&
        result.correctedText &&
        result.correctedText !== formState.question.trim()
      ) {
        setOriginalQuestion(formState.question);
        setCorrectionNotice("Grammar and spelling automatically corrected.");
      }

      const preselectedDifficulty = toDisplayDifficultyTier(formState.difficulty);
      const nextDifficulty = preselectedDifficulty || cls.difficultyTier;
      const nextMethod = nextDifficulty !== cls.difficultyTier ? "ADMIN_OVERRIDE" : "AI";

      const generatedIdealAnswer = typeof result.idealAnswer === "string" ? result.idealAnswer.trim() : "";
      if (result.status !== "invalid" && !generatedIdealAnswer) {
        setIdealAnswerError("AI failed to generate a non-empty Answer Guide. Please retry before saving.");
        setIdealAnswerMode("failed");
        setValidationResult(result);
        setValidationAttempted(false);
        return null;
      }

      const shouldFillIdealAnswer =
        result.status !== "invalid" &&
        generatedIdealAnswer &&
        (!editingQuestion || !formState.ideal_answer.trim() || idealAnswerMode !== "edited");

      setFormState((prev) => ({
        ...prev,
        ...(allowAutoCorrect &&
        result.wasCorrected &&
        result.correctedText &&
        result.correctedText !== prev.question.trim()
          ? { question: result.correctedText }
          : {}),
        difficulty: nextDifficulty,
        ...(shouldFillIdealAnswer ? { ideal_answer: generatedIdealAnswer } : {}),
      }));

      if (shouldFillIdealAnswer) {
        setIdealAnswerMode("ai");
      }

      setDifficultyInfo({
        status: "COMPLETED",
        aiSuggestedDifficulty: cls.difficulty,
        difficultyTier: cls.difficultyTier,
        assessment: cls.assessment,
        reason: cls.reason,
        method: nextMethod,
      });

      setValidationResult(result);
      setValidationAttempted(true);
      return result;
    } catch (err) {
      console.error("Validation error:", err);
      setValidationError(err?.message || "Failed to contact AI validation and answer generation service.");
      setValidationResult(null);
      setValidationAttempted(false);
      setDifficultyInfo((prev) => ({
        ...(prev || {}),
        status: "FAILED",
      }));
      return null;
    } finally {
      setIsValidating(false);
    }
  }

  async function handleRegenerateIdealAnswer() {
    if (isValidating || isGeneratingIdealAnswer || actionLoading) return;

    const effectiveJobRole = getSelectedJobRoleName();
    if (!formState.question.trim() || !normalizeQuestionCategory(formState.category)) {
      setIdealAnswerError("Select a Category and enter the Question before regenerating the Answer Guide.");
      return;
    }

    setIsGeneratingIdealAnswer(true);
    setIdealAnswerError("");
    setFormError("");

    try {
      const res = await regenerateIdealAnswerWithAi({
        question: formState.question,
        category: formState.category,
        jobRole: effectiveJobRole,
        difficulty: formState.difficulty || difficultyInfo?.difficultyTier || "Medium",
      });

      if (!res.success || !res.idealAnswer) {
        setIdealAnswerError(res.error || "AI could not regenerate the Answer Guide. Please retry.");
        setIdealAnswerMode("failed");
        return;
      }

      setFormState((prev) => ({ ...prev, ideal_answer: res.idealAnswer }));
      setIdealAnswerMode("ai");
    } catch (err) {
      setIdealAnswerError(err?.message || "Failed to regenerate Answer Guide.");
      setIdealAnswerMode("failed");
    } finally {
      setIsGeneratingIdealAnswer(false);
    }
  }

  function handleUndoCorrection() {
    if (originalQuestion) {
      const reverted = originalQuestion;
      const keepOverride = difficultyInfo?.method === "ADMIN_OVERRIDE";
      setFormState((prev) => ({
        ...prev,
        question: reverted,
        difficulty: keepOverride ? prev.difficulty : (editingQuestion?.difficulty || ""),
      }));
      setOriginalQuestion(null);
      setCorrectionNotice("");
      setValidationResult(null);
      setValidationAttempted(false);
      if (!keepOverride) {
        setDifficultyInfo(null);
      }
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
    if (actionLoading || isValidating || isGeneratingIdealAnswer) return;

    setFormError("");
    const trimmedQuestion = formState.question.trim();
    if (!trimmedQuestion) {
      setFormError("Please provide the interview question text.");
      return;
    }

    const canonicalCategory = normalizeQuestionCategory(formState.category);
    if (!canonicalCategory) {
      setFormError("Please select a Category (HR Questions, Technical Questions, Behavioral Questions, or Situational Questions).");
      return;
    }

    const selectedRole = formState.job_role_id ? jobRoleById[formState.job_role_id] : null;
    const resolvedIndustryId = formState.industry_id || selectedRole?.industry_id || null;
    const effectiveJobRole = selectedRole?.name || (editingQuestion?.job_role && !formState.job_role_id ? editingQuestion.job_role : "");

    const isEditingExistingPreservingPrompt =
      Boolean(editingQuestion) &&
      trimmedQuestion === (editingQuestion.question || "").trim() &&
      canonicalCategory === (normalizeQuestionCategory(editingQuestion.category) || "") &&
      Boolean(formState.ideal_answer.trim()) &&
      difficultyInfo?.status !== "FAILED";

    const needsAiValidationAndAnswer =
      (!validationAttempted ||
        !validationResult ||
        difficultyInfo?.status !== "COMPLETED" ||
        !formState.ideal_answer.trim()) &&
      !isEditingExistingPreservingPrompt;

    // Automatically validate, classify difficulty, and generate the Answer Guide first,
    // allowing the administrator to review or edit the generated answer before completing the save.
    if (needsAiValidationAndAnswer) {
      await handleValidate(true);
      return;
    }

    if (validationResult) {
      if (validationResult.status === "invalid") {
        setFormError(
          validationResult.overallFeedback ||
            "The question failed mandatory validation checks. Please revise it before saving."
        );
        return;
      }

      const failedChecks = Object.entries(validationResult.checks || {})
        .filter(([, c]) => c.status === "fail")
        .map(([, c]) => `${c.title}: ${c.message}`);

      if (failedChecks.length > 0) {
        setFormError(`Cannot save question. Failed checks: ${failedChecks.join(" | ")}`);
        return;
      }

      if (validationResult.status === "needs_revision") {
        const proceed = window.confirm(
          `This question has quality warnings:\n\n${validationResult.overallFeedback}\n\nDo you want to proceed and save anyway?`
        );
        if (!proceed) {
          return;
        }
      }
    }

    const questionTextToSave = (validationResult?.correctedText || trimmedQuestion).trim();
    const saveCheck = buildQuestionSavePayload({
      question: questionTextToSave,
      category: canonicalCategory,
      industryId: resolvedIndustryId,
      jobRoleId: formState.job_role_id || null,
      jobRoleIndustryId: selectedRole?.industry_id || null,
      jobRole: effectiveJobRole,
      difficulty: formState.difficulty,
      idealAnswer: formState.ideal_answer,
      isActive: formState.is_active,
      difficultyMeta: difficultyInfo,
      legacyDifficultyMethod:
        editingQuestion && formState.difficulty !== editingQuestion.difficulty
          ? "ADMIN_OVERRIDE"
          : editingQuestion?.classification_method || null,
    });

    if (!saveCheck.ok) {
      setFormError(saveCheck.error);
      return;
    }

    setActionLoading(true);
    const query = editingQuestion
      ? supabase.from("questions").update(saveCheck.payload).eq("id", editingQuestion.id).select("*")
      : supabase.from("questions").insert([saveCheck.payload]).select("*");

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      console.error("Error saving question:", error);
      setFormError(
        error?.message
          ? `Unable to save question: ${error.message}`
          : "Database did not confirm the saved question record. Please try again."
      );
      setActionLoading(false);
      return;
    }

    await loadQuestions();
    const actionLabel = editingQuestion ? "updated" : "created";
    resetForm();
    setIsFormOpen(false);
    setActionLoading(false);
    setStatusBanner({
      type: "success",
      text: `Question ${actionLabel} successfully with Category "${getCategoryDisplayLabel(
        canonicalCategory
      )}" and Answer Guide saved to the questions table.`,
    });
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
      setStatusBanner({
        type: "error",
        text: `Unable to delete question: ${error.message || "Foreign key or database constraint prevented deletion."}`,
      });
      setDeleteQuestionTarget(null);
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
    setStatusBanner({
      type: "success",
      text: "Question removed from the question bank.",
    });
  }

  const canSubmit =
    Boolean(formState.question.trim()) &&
    Boolean(normalizeQuestionCategory(formState.category)) &&
    difficultyInfo?.status !== "FAILED" &&
    !(validationAttempted && validationResult?.status === "invalid");

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar />

      <main className="relative ml-20 flex max-w-7xl flex-col gap-8 px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Banner Hero */}
        <section className="glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-slate-200 p-7 shadow-sm fade-in-up sm:p-9">
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-cyan-800 shadow-sm">
                <FaQuestionCircle className="text-cyan-600 text-[11px]" />
                Interview Questions
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Question Management
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Create, check, and organize interview questions by industry, job role, category, and difficulty level with short Answer Guides.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to="/interview-mode"
                className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-white px-4 py-3 text-xs font-bold text-sky-800 shadow-xs transition hover:bg-sky-50"
              >
                <FaSlidersH className="text-xs text-sky-600" />
                <span>Industries &amp; Job Roles</span>
              </Link>
              <button
                onClick={openAddForm}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-sky-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sky-500/40 active:translate-y-0"
              >
                <FaPlus className="text-xs" />
                <span>Create New Question</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="relative mt-8 grid gap-4 sm:grid-cols-3">
            <div className="stat-card rounded-[1.75rem] border border-sky-200 bg-sky-50 p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-800">Total Questions</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <FaQuestionCircle className="text-sm" />
                </span>
              </div>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">{questions.length}</p>
              <p className="mt-1 text-xs text-slate-500">
                {questions.filter((q) => Boolean(q.ideal_answer?.trim())).length} with Answer Guides
              </p>
            </div>

            <div className="stat-card rounded-[1.75rem] border border-cyan-200 bg-cyan-50 p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Categories</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                  <FaLayerGroup className="text-sm" />
                </span>
              </div>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">
                {new Set(questions.map((item) => item.category)).size}
              </p>
              <p className="mt-1 text-xs text-slate-500">HR, Technical, Behavioral, Situational</p>
            </div>

            <div className="stat-card rounded-[1.75rem] border border-violet-200 bg-violet-50 p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-800">Difficulty Levels</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <FaSignal className="text-sm" />
                </span>
              </div>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">
                {new Set(questions.map((item) => item.difficulty)).size}
              </p>
              <p className="mt-1 text-xs text-slate-500">Easy, Medium, and Hard</p>
            </div>
          </div>
        </section>

        {/* Save / Action Status Banner */}
        {statusBanner && (
          <div
            role="status"
            className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-xs font-bold shadow-sm ${
              statusBanner.type === "error"
                ? "border-rose-200 bg-rose-50/90 text-rose-800"
                : "border-emerald-200 bg-emerald-50/90 text-emerald-800"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {statusBanner.type === "error" ? (
                <FaExclamationTriangle className="text-sm shrink-0" />
              ) : (
                <FaCheckCircle className="text-sm shrink-0" />
              )}
              <span>{statusBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="rounded-lg p-1 hover:bg-black/5"
              aria-label="Dismiss notification"
            >
              <FaTimes className="text-xs" />
            </button>
          </div>
        )}

        {/* Filters & Table Card */}
        <section className="glass-card rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.4)] ring-1 ring-sky-100/90 fade-in-up sm:p-7">
          {/* Filter Bar */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FaFilter className="text-xs text-sky-700" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Filter &amp; Search Question Bank</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
              <div className="relative">
                <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search questions, answer guides, or job roles..."
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
                />
              </div>

              <select
                value={industryFilter}
                onChange={(e) => setIndustryFilter(e.target.value)}
                aria-label="Filter by industry"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
              >
                <option value="">All Industries</option>
                {modeConfig.industries.map((ind) => (
                  <option key={ind.id} value={ind.id}>{ind.name}</option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
              >
                <option value="">All Categories</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                aria-label="Filter by difficulty"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
              >
                <option value="">All Difficulties</option>
                {VALID_DIFFICULTIES.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>

              {(searchTerm || industryFilter || categoryFilter || difficultyFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setIndustryFilter("");
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
                    <th className="px-5 py-3.5">Question &amp; Answer Guide</th>
                    <th className="px-4 py-3.5">Industry &amp; Job Role</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5">Difficulty</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-14 text-center text-slate-400">
                        <FaSyncAlt className="mx-auto mb-2 animate-spin text-base text-sky-600" />
                        Loading question bank...
                      </td>
                    </tr>
                  ) : filteredQuestions.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-14 text-center text-slate-400">
                        No questions match your search or filter.
                      </td>
                    </tr>
                  ) : (
                    filteredQuestions.map((question) => (
                      <tr key={question.id} className="transition-colors hover:bg-sky-50/50 align-top">
                        <td className="px-5 py-4 max-w-xl">
                          <p className="text-xs font-bold text-slate-900 leading-snug">
                            {question.question}
                          </p>
                          {question.ideal_answer?.trim() ? (
                            <p className="mt-1.5 line-clamp-2 rounded-lg border border-sky-100/80 bg-sky-50/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-600">
                              <span className="font-bold text-sky-800">Answer Guide: </span>
                              {question.ideal_answer}
                            </p>
                          ) : (
                            <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200/80">
                              <FaExclamationTriangle className="text-[9px]" /> Answer Guide missing — click Edit to generate
                            </p>
                          )}
                          <p className="mt-1.5 font-mono text-[10px] text-slate-400">
                            ID: {String(question.id).slice(0, 8)} · Added {formatQuestionDate(question.created_at)}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col items-start gap-1">
                            {question.industryName && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 ring-1 ring-sky-200/70">
                                <FaIndustry className="text-[9px] text-sky-600" /> {question.industryName}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                              <FaBriefcase className="text-[9px] text-slate-400" />
                              {question.job_role || "Any Job Role"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-bold ${getCategoryBadge(question.category)}`}>
                            {normalizeQuestionCategory(question.category) || question.category || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-bold ${getDifficultyBadge(question.difficulty)}`}>
                            {question.difficulty}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                              question.is_active !== false
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                            }`}
                          >
                            {question.is_active !== false ? "Active" : "Inactive"}
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

      {/* Add / Edit Question Modal with Automatic Ideal Answer Generation */}
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
              {/* Save / Form Error */}
              {formError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50/95 p-3.5 text-xs text-rose-900 shadow-sm">
                  <FaExclamationTriangle className="mt-0.5 shrink-0 text-rose-600" />
                  <p className="font-semibold leading-relaxed">{formError}</p>
                </div>
              )}

              {/* Industry, Job Role, Category, Difficulty, Active Status Selectors */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Industry
                  </label>
                  <select
                    value={formState.industry_id}
                    onChange={(e) => {
                      const nextIndustryId = e.target.value;
                      setFormState((prev) => {
                        const keepRole =
                          prev.job_role_id &&
                          jobRoleById[prev.job_role_id]?.industry_id === nextIndustryId;
                        return {
                          ...prev,
                          industry_id: nextIndustryId,
                          job_role_id: keepRole ? prev.job_role_id : "",
                        };
                      });
                      if (formError) setFormError("");
                    }}
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                  >
                    <option value="">Any Industry</option>
                    {modalIndustries.map((ind) => (
                      <option key={ind.id} value={ind.id}>
                        {ind.name}{ind.is_active ? "" : " (Inactive)"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Job Role
                  </label>
                  <select
                    value={formState.job_role_id}
                    onChange={(e) => {
                      const nextRoleId = e.target.value;
                      const chosenRole = nextRoleId ? jobRoleById[nextRoleId] : null;
                      setFormState((prev) => ({
                        ...prev,
                        industry_id: chosenRole?.industry_id || prev.industry_id,
                        job_role_id: nextRoleId,
                      }));
                      if (formError) setFormError("");
                      if (validationError) setValidationError("");
                    }}
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                  >
                    <option value="">Any Job Role</option>
                    {modalJobRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}{role.is_active ? "" : " (Inactive)"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formState.category}
                    onChange={(e) => {
                      const nextCategory = e.target.value;
                      const keepOverride = difficultyInfo?.method === "ADMIN_OVERRIDE";
                      setFormState((prev) => ({
                        ...prev,
                        category: nextCategory,
                        difficulty: keepOverride ? prev.difficulty : editingQuestion ? prev.difficulty : "",
                      }));
                      if (validationAttempted) setValidationAttempted(false);
                      if (validationResult) setValidationResult(null);
                      if (validationError) setValidationError("");
                      if (formError) setFormError("");
                      if (!keepOverride && !editingQuestion) {
                        setDifficultyInfo(null);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                  >
                    <option value="">Choose a category...</option>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Difficulty Level
                    </label>
                    {difficultyInfo?.status === "COMPLETED" && difficultyInfo?.difficultyTier ? (
                      difficultyInfo.method === "ADMIN_OVERRIDE" ? (
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            Changed by Admin (AI suggested: {difficultyInfo.difficultyTier})
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setFormState((prev) => ({ ...prev, difficulty: difficultyInfo.difficultyTier }));
                              setDifficultyInfo((prev) => ({ ...prev, method: "AI" }));
                            }}
                            className="text-[10px] font-bold text-sky-700 hover:underline"
                          >
                            Use AI
                          </button>
                        </div>
                      ) : (
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${getDifficultyBadge(difficultyInfo.difficultyTier)}`}>
                          Set by AI
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">
                        Choose or let AI decide
                      </span>
                    )}
                  </div>
                  <select
                    value={formState.difficulty}
                    onChange={(e) => {
                      const nextDiff = e.target.value;
                      setFormState((prev) => ({ ...prev, difficulty: nextDiff }));
                      if (formError) setFormError("");
                      if (difficultyInfo?.aiSuggestedDifficulty) {
                        const aiTier = toDisplayDifficultyTier(difficultyInfo.aiSuggestedDifficulty);
                        setDifficultyInfo((prev) => ({
                          ...prev,
                          method: nextDiff && aiTier ? (nextDiff === aiTier ? "AI" : "ADMIN_OVERRIDE") : prev?.method || "ADMIN_OVERRIDE",
                        }));
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                  >
                    <option value="">Picked automatically after check</option>
                    {VALID_DIFFICULTIES.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Active Status
                  </label>
                  <select
                    value={formState.is_active ? "active" : "inactive"}
                    onChange={(e) => setFormState((prev) => ({ ...prev, is_active: e.target.value === "active" }))}
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                  >
                    <option value="active">Active (Shown to Students)</option>
                    <option value="inactive">Inactive (Hidden)</option>
                  </select>
                </div>
              </div>

              {/* Question Text Area & Validation Action */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Interview Question <span className="text-rose-500">*</span>
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
                      disabled={isValidating || isGeneratingIdealAnswer || actionLoading || !formState.question.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-800 shadow-sm transition hover:bg-sky-100 disabled:opacity-50"
                    >
                      {isValidating ? (
                        <>
                          <FaSyncAlt className="animate-spin text-[10px]" /> Processing AI...
                        </>
                      ) : (
                        <>
                          <FaShieldAlt className="text-[10px] text-sky-600" /> Validate &amp; Generate Answer Guide
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <textarea
                  value={formState.question}
                  onChange={(e) => {
                    const nextQuestion = e.target.value;
                    const keepOverride = difficultyInfo?.method === "ADMIN_OVERRIDE";
                    setFormState((prev) => ({
                      ...prev,
                      question: nextQuestion,
                      difficulty: keepOverride
                        ? prev.difficulty
                        : editingQuestion && nextQuestion.trim() === (editingQuestion.question || "").trim()
                          ? editingQuestion.difficulty
                          : prev.difficulty,
                    }));
                    if (validationResult) setValidationResult(null);
                    if (validationAttempted) setValidationAttempted(false);
                    if (validationError) setValidationError("");
                    if (formError) setFormError("");
                    if (correctionNotice && !originalQuestion) setCorrectionNotice("");
                  }}
                  rows={3}
                  placeholder="e.g., Can you describe a challenging technical project you worked on and how you resolved unexpected roadblocks?"
                  className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                />

                {/* AI Error Notification with Retry */}
                {validationError && (
                  <div className="mt-2.5 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50/95 p-3.5 text-xs text-rose-950 shadow-sm animate-fadeIn">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-rose-200 text-rose-700 mt-0.5">
                        <FaTimesCircle className="text-xs" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold">AI Validation &amp; Answer Guide Error</p>
                        <p className="mt-0.5 text-rose-800 text-[11px] leading-relaxed">
                          {validationError}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleValidate(true)}
                      disabled={isValidating || !formState.question.trim()}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
                    >
                      <FaRedo className="text-[10px]" /> Retry
                    </button>
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

              {/* AI-Generated Answer Guide Section (Review & Edit before Save) */}
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <FaBookOpen className="text-[11px]" />
                    </span>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Answer Guide (1–2 Sentences) <span className="text-rose-500">*</span>
                    </label>
                    {idealAnswerMode === "ai" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        <FaRobot className="text-[9px]" /> AI Generated
                      </span>
                    )}
                    {idealAnswerMode === "edited" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        Edited by Admin
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleRegenerateIdealAnswer}
                    disabled={
                      isValidating ||
                      isGeneratingIdealAnswer ||
                      actionLoading ||
                      !formState.question.trim() ||
                      !formState.category
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-xs transition hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {isGeneratingIdealAnswer ? (
                      <>
                        <FaSyncAlt className="animate-spin text-[10px]" /> Regenerating...
                      </>
                    ) : (
                      <>
                        <FaRedo className="text-[9px]" /> Regenerate Answer Guide
                      </>
                    )}
                  </button>
                </div>

                <textarea
                  value={formState.ideal_answer}
                  onChange={(e) => {
                    setFormState((prev) => ({ ...prev, ideal_answer: e.target.value }));
                    setIdealAnswerMode("edited");
                    if (idealAnswerError) setIdealAnswerError("");
                    if (formError) setFormError("");
                  }}
                  rows={2}
                  placeholder="Automatically generated by AI (1–2 sentences) using Category, Job Role, Difficulty, and Question. Review or edit before saving."
                  className="w-full rounded-xl border border-slate-200/90 bg-white p-3.5 text-xs text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
                />

                <p className="text-[11px] text-slate-500">
                  Short 1–2 sentence Answer Guide saved to help students study.
                </p>

                {idealAnswerError && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                    <span className="font-semibold">{idealAnswerError}</span>
                    <button
                      type="button"
                      onClick={handleRegenerateIdealAnswer}
                      disabled={isGeneratingIdealAnswer || isValidating}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700"
                    >
                      <FaRedo className="text-[9px]" /> Retry
                    </button>
                  </div>
                )}
              </div>

              {/* AI Processing Loading Indicator */}
              {(isValidating || isGeneratingIdealAnswer) && (
                <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-3.5 text-xs text-sky-900 shadow-sm animate-pulse">
                  <FaSyncAlt className="animate-spin text-sm text-sky-600 shrink-0" />
                  <p className="font-semibold">
                    {isGeneratingIdealAnswer
                      ? "Generating 1–2 sentence Answer Guide with AI..."
                      : "Checking question, picking difficulty level, and writing Answer Guide..."}
                  </p>
                </div>
              )}

              {/* Compact Difficulty Tier Assessment Summary */}
              {difficultyInfo?.status === "COMPLETED" && difficultyInfo?.reason && !isValidating && (
                <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
                        Difficulty Check
                      </span>
                      {difficultyInfo.difficultyTier && (
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${getDifficultyBadge(difficultyInfo.difficultyTier)}`}>
                          AI: {difficultyInfo.difficultyTier}
                        </span>
                      )}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      difficultyInfo.method === "ADMIN_OVERRIDE"
                        ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                        : "bg-sky-100 text-sky-800 ring-1 ring-sky-200"
                    }`}>
                      {difficultyInfo.method === "ADMIN_OVERRIDE" ? "Admin Override" : "AI Classified"}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-700 leading-snug">
                    {difficultyInfo.reason}
                  </p>

                  {difficultyInfo.assessment && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200/70 bg-white px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800">Knowledge Required</p>
                        <p className="mt-0.5 text-[11px] text-slate-600 leading-snug">{difficultyInfo.assessment.knowledge_required}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200/70 bg-white px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">Thinking Level</p>
                        <p className="mt-0.5 text-[11px] text-slate-600 leading-snug">{difficultyInfo.assessment.cognitive_complexity}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200/70 bg-white px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Problem-Solving</p>
                        <p className="mt-0.5 text-[11px] text-slate-600 leading-snug">{difficultyInfo.assessment.problem_solving}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200/70 bg-white px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Experience Required</p>
                        <p className="mt-0.5 text-[11px] text-slate-600 leading-snug">{difficultyInfo.assessment.experience_required}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Validation Results Panel */}
              {validationResult && (
                <div className={`rounded-2xl border p-4 sm:p-5 transition-all ${
                  validationResult.status === "valid"
                    ? "border-emerald-200 bg-emerald-50/70"
                    : validationResult.status === "needs_revision"
                      ? "border-amber-200 bg-amber-50/70"
                      : "border-rose-200 bg-rose-50/70"
                }`}>
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
                            ? "Question Validated & Answer Guide Ready"
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
                {isValidating || isGeneratingIdealAnswer ? (
                  <span className="text-sky-700 font-semibold flex items-center gap-1.5 animate-pulse">
                    <FaSyncAlt className="text-sky-500 text-xs animate-spin" /> Checking question and writing Answer Guide...
                  </span>
                ) : difficultyInfo?.status === "FAILED" || idealAnswerMode === "failed" ? (
                  <span className="text-rose-600 font-semibold flex items-center gap-1.5">
                    <FaTimesCircle className="text-rose-500 text-xs" /> AI generation failed. Retry before saving.
                  </span>
                ) : validationAttempted && validationResult?.status === "invalid" ? (
                  <span className="text-rose-600 font-semibold flex items-center gap-1.5">
                    <FaTimesCircle className="text-rose-500 text-xs" /> Question failed validation and cannot be saved.
                  </span>
                ) : formState.ideal_answer.trim() && (validationAttempted || editingQuestion) ? (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                    <FaCheckCircle className="text-emerald-500 text-xs" /> Difficulty:{" "}
                    <strong>{formState.difficulty || "Pending"}</strong> · Answer Guide ready. Review &amp; save.
                  </span>
                ) : (
                  <span className="text-amber-700 font-medium flex items-center gap-1.5">
                    <FaShieldAlt className="text-amber-500 text-xs" /> Click &ldquo;Create Question&rdquo; to check the question and write its Answer Guide.
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
                  disabled={actionLoading || isValidating || isGeneratingIdealAnswer || !canSubmit}
                  className={`rounded-xl px-6 py-2.5 text-xs font-bold text-white shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    !canSubmit
                      ? "bg-slate-400"
                      : "bg-blue-600 hover:bg-blue-700 shadow-sky-500/30 hover:shadow-sky-500/50"
                  }`}
                >
                  {actionLoading
                    ? "Saving Question..."
                    : isValidating || isGeneratingIdealAnswer
                      ? "Generating..."
                      : formState.ideal_answer.trim() && (validationAttempted || editingQuestion)
                        ? editingQuestion
                          ? "Confirm & Update Question"
                          : "Confirm & Create Question"
                        : editingQuestion
                          ? "Validate & Update Question"
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
              This question will be permanently deleted and won&apos;t appear in future interviews.
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
