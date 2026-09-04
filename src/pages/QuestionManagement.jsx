import { useEffect, useMemo, useState } from "react";
import { FaFilter, FaPlus, FaSearch, FaTrash, FaEdit } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import AdminTopNav from "../components/AdminTopNav";
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
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminTopNav adminName="Administrator" />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10">
        <section className="glass-card relative overflow-hidden rounded-[2rem] border border-white/70 p-8 shadow-[0_25px_60px_-30px_rgba(14,116,144,0.5)] ring-1 ring-sky-100/80 fade-in-up">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-sky-500/12 via-cyan-400/10 to-indigo-400/10" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.32em] text-sky-700">Admin Dashboard</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-950">Question Management</h1>
              <p className="mt-3 max-w-2xl text-slate-600">
                Add, edit, delete, search, and filter questions for your candidate review flow.
              </p>
            </div>
          </div>

          <div className="relative mt-8 grid gap-4 md:grid-cols-3">
            <div className="stat-card rounded-[1.75rem] bg-gradient-to-br from-sky-100 via-white to-cyan-50 p-6 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.8)] ring-1 ring-sky-100 transition duration-500 hover:-translate-y-1">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Questions</p>
              <p className="mt-4 text-4xl font-semibold text-slate-950">{questions.length}</p>
            </div>
            <div className="stat-card rounded-[1.75rem] bg-gradient-to-br from-cyan-100 via-white to-sky-50 p-6 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.8)] ring-1 ring-sky-100 transition duration-500 hover:-translate-y-1">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Categories</p>
              <p className="mt-4 text-4xl font-semibold text-slate-950">{new Set(questions.map((item) => item.category)).size}</p>
            </div>
            <div className="stat-card rounded-[1.75rem] bg-gradient-to-br from-violet-100 via-white to-indigo-50 p-6 shadow-[0_18px_40px_-24px_rgba(99,102,241,0.7)] ring-1 ring-violet-100 transition duration-500 hover:-translate-y-1">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Difficulties</p>
              <p className="mt-4 text-4xl font-semibold text-slate-950">{new Set(questions.map((item) => item.difficulty)).size}</p>
            </div>
          </div>
        </section>

        <section className="glass-card rounded-[2rem] border border-white/70 p-6 shadow-[0_20px_45px_-30px_rgba(37,99,235,0.7)] ring-1 ring-sky-100/80 fade-in-up">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-950">Questions</h2>
              <p className="mt-2 text-sm text-slate-500">Search and filter the question bank, or manage items directly.</p>
            </div>
            <button
              onClick={openAddForm}
              className="inline-flex items-center gap-2 rounded-3xl bg-gradient-to-r from-sky-600 via-blue-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_28px_-18px_rgba(37,99,235,0.9)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-18px_rgba(14,165,233,0.9)]"
            >
              <FaPlus /> Add Question
            </button>
          </div>

          <div className="mt-6 rounded-[1.75rem] border border-slate-200/80 bg-white/80 p-4 shadow-inner shadow-slate-100/80">
            <div className="flex items-center gap-3 text-slate-950">
              <div className="rounded-3xl bg-gradient-to-br from-sky-600 to-cyan-500 p-3 text-white shadow-[0_18px_24px_-18px_rgba(14,165,233,0.9)]">
                <FaFilter />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Filters</p>
                <h2 className="text-2xl font-semibold">Refine questions</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(220px,1.5fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]">
              <div className="relative">
                <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search questions..."
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-12 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>

              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">All Difficulties</option>
                {difficulties.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>{difficulty}</option>
                ))}
              </select>

              <button
                onClick={() => {
                  setSearchTerm("");
                  setCategoryFilter("");
                  setDifficultyFilter("");
                }}
                className="rounded-3xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Clear Filters
              </button>
            </div>
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
                    <td colSpan="4" className="px-6 py-14 text-center text-slate-500">Loading questions...</td>
                  </tr>
                ) : filteredQuestions.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-14 text-center text-slate-500">No questions match your search and filters.</td>
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
        </section>

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
                    className="rounded-3xl bg-gradient-to-r from-sky-600 via-blue-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_28px_-18px_rgba(37,99,235,0.9)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-18px_rgba(14,165,233,0.9)] disabled:cursor-not-allowed disabled:opacity-60"
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
                  {actionLoading ? "Deleting..." : "Delete"}
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
