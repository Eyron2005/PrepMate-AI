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
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

const categories = ["Technical", "Behavioral", "Situational", "HR"];
const difficulties = ["Easy", "Medium", "Hard"];

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
    setIsFormOpen(true);
  }

  async function handleSaveQuestion() {
    if (!formState.question.trim() || !formState.category || !formState.difficulty) {
      alert("Please fill in the question text, category, and difficulty.");
      return;
    }

    setActionLoading(true);
    const payload = {
      question: formState.question.trim(),
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

      <AdminSidebar adminName="Administrator" />

      <main className="relative ml-20 flex max-w-7xl flex-col gap-8 px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Banner Hero */}
        <section className="glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-white/80 p-7 shadow-[0_25px_60px_-25px_rgba(14,116,144,0.35)] ring-1 ring-sky-100/90 fade-in-up sm:p-9">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-cyan-400/15 via-sky-400/12 to-indigo-400/10" />

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
                Create, customize, and refine candidate mock interview prompts across technical specializations and HR behavioral tracks.
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

      {/* Add / Edit Question Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-slate-200/80 fade-in-up sm:p-9">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">Question Bank</p>
                <h3 className="mt-1 text-2xl font-extrabold text-slate-950">
                  {editingQuestion ? "Edit Question" : "Add New Question"}
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

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Question Prompt Text
                </label>
                <textarea
                  value={formState.question}
                  onChange={(e) => setFormState({ ...formState, question: e.target.value })}
                  rows={4}
                  placeholder="e.g., Can you describe a challenging technical project you worked on and how you resolved unexpected roadblocks?"
                  className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Category Track
                  </label>
                  <select
                    value={formState.category}
                    onChange={(e) => setFormState({ ...formState, category: e.target.value })}
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
                    Difficulty Tier
                  </label>
                  <select
                    value={formState.difficulty}
                    onChange={(e) => setFormState({ ...formState, difficulty: e.target.value })}
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                  >
                    <option value="">Select Difficulty Tier</option>
                    {difficulties.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-end border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsFormOpen(false);
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuestion}
                  disabled={actionLoading}
                  className="rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-500/30 transition hover:shadow-sky-500/50 disabled:opacity-60"
                >
                  {actionLoading ? "Saving Question..." : editingQuestion ? "Update Question" : "Create Question"}
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
