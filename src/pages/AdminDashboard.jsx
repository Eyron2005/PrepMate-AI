import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import {
  FaUsers,
  FaQuestionCircle,
  FaUserCog,
  FaSignOutAlt,
} from "react-icons/fa";

function AdminDashboard() {
  const navigate = useNavigate();
  const [adminName, setAdminName] = useState("Administrator");
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [mounted, setMounted] = useState(false);

  function CountUp({ value, duration = 800, className }) {
    const [display, setDisplay] = useState(0);
    const rafRef = useRef(null);
    useEffect(() => {
      const start = performance.now();
      const from = 0;
      const to = Number(value) || 0;
      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const current = Math.floor(from + (to - from) * t);
        setDisplay(current);
        if (t < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
      return () => cancelAnimationFrame(rafRef.current);
    }, [value, duration]);
    return <span className={className}>{display}</span>;
  }

  useEffect(() => {
    checkSession();
    loadDashboard();
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  async function checkSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      navigate("/");
      return;
    }

    const { data, error } = await supabase
      .from("admins")
      .select("full_name")
      .eq("id", session.user.id)
      .single();

    const metadataName = session.user.user_metadata?.full_name;
    if (error) {
      setAdminName(metadataName || session.user.email || "Administrator");
      return;
    }

    if (data?.full_name) {
      setAdminName(data.full_name);
    } else if (metadataName) {
      setAdminName(metadataName);
    } else {
      setAdminName(session.user.email || "Administrator");
    }
  }

  async function loadDashboard() {
    // Total Users
    const { count: userCount } = await supabase
      .from("profiles")
      .select("*", {
        count: "exact",
        head: true,
      });

    setTotalUsers(userCount || 0);

    // Total Questions
    const { count: questionCount } = await supabase
      .from("questions")
      .select("*", {
        count: "exact",
        head: true,
      });

    setTotalQuestions(questionCount || 0);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div className="min-h-screen flex bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_18%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.16),_transparent_14%),linear-gradient(to_bottom,_#f8fafc,_#e2e8f0)] text-slate-900">
      <aside className="w-80 shrink-0 bg-white/90 backdrop-blur-xl text-slate-900 flex flex-col shadow-[0_35px_80px_-40px_rgba(15,23,42,0.25)] border border-white/80">
        <div className="px-8 py-8 border-b border-slate-200 bg-gradient-to-br from-sky-600 to-cyan-500 text-white rounded-br-[2rem]">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-14 w-14 rounded-3xl bg-white/15 grid place-items-center text-xl font-bold text-white shadow-lg shadow-cyan-500/20">
              H
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Prepmate AI</h1>
              <p className="text-sm text-white/80">Admin Panel</p>
            </div>
          </div>

          <div className="rounded-3xl bg-blue-600 p-4 border border-blue-800">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-200 mb-2">
              Signed in as
            </p>
            <p className="font-medium text-white">{adminName || "Administrator"}</p>
          </div>
        </div>

        <nav className="flex-1 px-6 py-8 space-y-4">
          <button className="w-full flex items-center gap-3 rounded-[1.75rem] bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-4 text-left text-sm font-semibold text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-x-1 hover:shadow-2xl">
            <FaUserCog className="text-lg" />
            Dashboard
          </button>

          <button
            type="button"
            onClick={() => navigate("/user-management")}
            className="w-full flex items-center gap-3 rounded-[1.75rem] bg-white/90 px-5 py-4 text-left text-sm font-semibold text-slate-900 shadow-lg shadow-slate-300/50 transition hover:-translate-x-1 hover:bg-slate-100"
          >
            <FaUsers className="text-lg text-sky-600" />
            User Management
          </button>

          <button
            type="button"
            onClick={() => navigate("/question-management")}
            className="w-full flex items-center gap-3 rounded-[1.75rem] bg-white/90 px-5 py-4 text-left text-sm font-semibold text-slate-900 shadow-lg shadow-slate-300/50 transition hover:-translate-x-1 hover:bg-slate-100"
          >
            <FaQuestionCircle className="text-lg text-emerald-600" />
            Question Management
          </button>
        </nav>

        <div className="px-6 pb-6">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-3 rounded-3xl bg-red-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            <FaSignOutAlt />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10">
        <div className={`rounded-[2rem] glass-card border border-white/70 p-8 shadow-2xl ring-1 ring-slate-200/70 transform transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6'}`}>
          <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-sky-700">
                Admin Dashboard
              </span>
              <h2 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950">
                Welcome back, {adminName || "Administrator"}
              </h2>
              <p className="mt-4 text-slate-600">
                Your central hub for managing users, questions, and system health.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 sm:grid-cols-3">
              <div className={`rounded-[1.75rem] bg-gradient-to-br from-blue-50 to-white p-5 text-center shadow-lg transform transition duration-500 ${mounted ? 'scale-100' : 'scale-95'}`}>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Users</p>
                <p className="mt-3 text-3xl font-semibold text-blue-600"><CountUp value={totalUsers} className="inline-block" /></p>
              </div>
              <div className={`rounded-[1.75rem] bg-gradient-to-br from-cyan-50 to-white p-5 text-center shadow-lg transform transition duration-500 ${mounted ? 'scale-100' : 'scale-95'}`}>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Questions</p>
                <p className="mt-3 text-3xl font-semibold text-cyan-600"><CountUp value={totalQuestions} className="inline-block" /></p>
              </div>
              <div className={`rounded-[1.75rem] bg-gradient-to-br from-slate-50 to-white p-5 text-center shadow-lg transform transition duration-500 ${mounted ? 'scale-100' : 'scale-95'}`}>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Status</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{mounted ? <span className="inline-flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />Live</span> : 'Live'}</p>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(420px,1fr)_360px]">
          <div className="grid gap-6 md:grid-cols-2">
            <article className="rounded-[1.75rem] glass-card border border-white/70 p-8 shadow-xl ring-1 ring-slate-200/60 transition duration-500 hover:-translate-y-1 hover:shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Users</p>
                  <p className="mt-4 text-5xl font-semibold text-slate-900">{totalUsers}</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-100 to-cyan-100 text-sky-700 shadow-sm">
                  <FaUsers className="text-2xl" />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-500">Current active users in your system.</p>
            </article>

            <article className="rounded-[1.75rem] glass-card border border-white/70 p-8 shadow-xl ring-1 ring-slate-200/60 transition duration-500 hover:-translate-y-1 hover:shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Questions</p>
                  <p className="mt-4 text-5xl font-semibold text-slate-950">{totalQuestions}</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-cyan-100 text-cyan-700 shadow-sm">
                  <FaQuestionCircle className="text-2xl" />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-500">Questions available for candidate review and management.</p>
            </article>
          </div>

          <aside className="space-y-6">
            <article className="rounded-[2rem] glass-card border border-white/70 p-6 shadow-xl ring-1 ring-slate-200/60 transition duration-500 hover:-translate-y-1 hover:shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">System health</p>
                  <h4 className="mt-2 text-xl font-semibold text-slate-950">All systems operational</h4>
                </div>
                <span className="inline-flex rounded-full bg-cyan-100 px-3 py-2 text-xs font-semibold text-cyan-700">Good</span>
              </div>
              <p className="mt-4 text-sm text-slate-500">No outages detected. Metrics and workflows are strong across the board.</p>
            </article>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;