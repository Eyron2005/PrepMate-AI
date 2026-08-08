import { useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaFilter, FaPlus, FaSearch, FaTrash, FaEdit } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";

const categories = ["Technical", "Behavioral", "Coding", "System Design", "Logic", "HR"];
const difficulties = ["Easy", "Medium", "Hard"];

function QuestionManagement() {
  const navigate = useNavigate();

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
    answer: "",
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
      question: item.question || item.question || item.title || "Untitled question",
      category: item.category || item.topic || "General",
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
    setFormState({ question: "", category: "", difficulty: "", answer: "" });
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
      answer: question.answer,
    });
    setIsFormOpen(true);
  }

  async function handleSaveQuestion() {
    if (!formState.question.trim() || !formState.category || !formState.difficulty) {
      alert("Please fill in the question, category, and difficulty.");
      return;
    }

    setActionLoading(true);
    const payload = {
      question: formState.question,
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_18%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.16),_transparent_14%),linear-gradient(to_bottom,_#f8fafc,_#e2e8f0)] px-4 py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <div className="rounded-[2rem] glass-card border border-white/70 p-8 shadow-2xl ring-1 ring-slate-200/70 fade-in-up">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-600">Admin Dashboard</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-950">Question Management</h1>
              <p className="mt-3 max-w-2xl text-slate-600">
                Add, edit, delete, search, and filter questions for your candidate review flow.
              </p>
            </div>
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 rounded-3xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl"
            >
              <FaArrowLeft /> Back to Dashboard
            </button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.75rem] bg-gradient-to-br from-sky-50 to-white p-6 shadow-xl ring-1 ring-slate-200/70 transition duration-500 hover:-translate-y-1">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Total Questions</p>
              <p className="mt-4 text-4xl font-semibold text-slate-950">{questions.length}</p>
            </div>
            <div className="rounded-[1.75rem] bg-gradient-to-br from-cyan-50 to-white p-6 shadow-xl ring-1 ring-slate-200/70 transition duration-500 hover:-translate-y-1">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Categories</p>
              <p className="mt-4 text-4xl font-semibold text-slate-950">{new Set(questions.map((item) => item.category)).size}</p>
            </div>
            <div className="rounded-[1.75rem] bg-gradient-to-br from-slate-50 to-white p-6 shadow-xl ring-1 ring-slate-200/70 transition duration-500 hover:-translate-y-1">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Difficulties</p>
              <p className="mt-4 text-4xl font-semibold text-slate-950">{new Set(questions.map((item) => item.difficulty)).size}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="rounded-[2rem] glass-card border border-white/70 p-6 shadow-xl ring-1 ring-slate-200/70 fade-in-up">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">Questions</h2>
                <p className="mt-2 text-sm text-slate-500">Search and filter the question bank, or manage items directly.</p>
              </div>
              <button
                onClick={openAddForm}
                className="inline-flex items-center gap-2 rounded-3xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl"
              >
                <FaPlus /> Add Question
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="relative">
                <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search questions..."
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-12 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
              >
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
              >
                <option value="">All Difficulties</option>
                {difficulties.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>{difficulty}</option>
                ))}
              </select>
            </div>

            <div className="mt-6 overflow-hidden rounded-[1.75rem] bg-white/70 shadow-xl ring-1 ring-slate-200/70 backdrop-blur-xl">
              <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                <thead className="bg-slate-50/90 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Question</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Difficulty</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white/80">
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-14 text-center text-slate-500">
                        Loading questions...
                      </td>
                    </tr>
                  ) : filteredQuestions.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-14 text-center text-slate-500">
                        No questions match your search and filters.
                      </td>
                    </tr>
                  ) : (
                    filteredQuestions.map((question) => (
                      <tr key={question.id} className="transition hover:bg-slate-50/90 motion-safe:animate-[fadeIn_0.25s_ease-out]">
                        <td className="px-6 py-4">
                          <div className="max-w-xl overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-slate-900">
                            {question.question}
                          </div>
                        </td>
                        <td className="px-6 py-4">{question.category}</td>
                        <td className="px-6 py-4">{question.difficulty}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => startEdit(question)}
                              className="rounded-3xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
                            >
                              <FaEdit /> Edit
                            </button>
                            <button
                              onClick={() => confirmDeleteQuestion(question)}
                              disabled={actionLoading}
                              className="rounded-3xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <FaTrash /> Delete
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

          <aside className="rounded-[2rem] glass-card border border-white/70 p-6 shadow-xl ring-1 ring-slate-200/70 fade-in-up">
            <div className="flex items-center gap-3 text-slate-950">
              <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-cyan-500 p-3 text-white shadow-lg shadow-cyan-500/20">
                <FaFilter />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Filters</p>
                <h2 className="text-2xl font-semibold">Refine questions</h2>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Category</p>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500">Difficulty</p>
                <select
                  value={difficultyFilter}
                  onChange={(e) => setDifficultyFilter(e.target.value)}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All difficulties</option>
                  {difficulties.map((difficulty) => (
                    <option key={difficulty} value={difficulty}>{difficulty}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => {
                  setCategoryFilter("");
                  setDifficultyFilter("");
                }}
                className="w-full rounded-3xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Clear Filters
              </button>
            </div>
          </aside>
        </div>

        {isFormOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 px-4 py-10 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-3xl rounded-[2rem] glass-card border border-white/70 bg-white/85 p-8 shadow-2xl ring-1 ring-slate-200/70 fade-in-up">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-sky-600">Question Form</p>
                  <h2 className="mt-3 text-3xl font-semibold text-slate-950">
                    {editingQuestion ? "Edit Question" : "Add Question"}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    resetForm();
                    setIsFormOpen(false);
                  }}
                  className="rounded-3xl border border-slate-300 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Close
                </button>
              </div>

              <div className="mt-8 grid gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Question Text</label>
                  <textarea
                    value={formState.question}
                    onChange={(e) => setFormState({ ...formState, question: e.target.value })}
                    rows={4}
                    className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Category</label>
                    <select
                      value={formState.category}
                      onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                      className="mt-3 w-full rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Select category</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Difficulty</label>
                    <select
                      value={formState.difficulty}
                      onChange={(e) => setFormState({ ...formState, difficulty: e.target.value })}
                      className="mt-3 w-full rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Select difficulty</option>
                      {difficulties.map((difficulty) => (
                        <option key={difficulty} value={difficulty}>{difficulty}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Answer / Explanation</label>
                  <textarea
                    value={formState.answer}
                    onChange={(e) => setFormState({ ...formState, answer: e.target.value })}
                    rows={3}
                    className="mt-3 w-full rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    onClick={() => {
                      resetForm();
                      setIsFormOpen(false);
                    }}
                    className="rounded-3xl border border-slate-300 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveQuestion}
                    disabled={actionLoading}
                    className="rounded-3xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {editingQuestion ? "Save Changes" : "Create Question"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {deleteQuestionTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[2rem] glass-card border border-white/70 bg-white/90 p-6 shadow-2xl ring-1 ring-slate-200/70 fade-in-up">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Confirm delete</p>
              <h3 className="mt-3 text-2xl font-semibold text-slate-950">Delete this question?</h3>
              <p className="mt-4 text-slate-600">This action cannot be undone. The question will be removed from the bank.</p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteQuestionTarget(null)}
                  className="rounded-3xl border border-slate-300 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={deleteQuestion}
                  disabled={actionLoading}
                  className="rounded-3xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading ? "Deleting..." : "Delete"
                  }
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default QuestionManagement;
