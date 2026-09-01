import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import AdminTopNav from "../components/AdminTopNav";
import {
  FaUsers,
  FaQuestionCircle,
  FaUserCog,
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
    const email = session.user.email || "";

    if (error) {
      setAdminName((metadataName && metadataName !== email.split("@")[0]) ? metadataName : "Administrator");
      return;
    }

    if (data?.full_name) {
      setAdminName((data.full_name && data.full_name !== email.split("@")[0]) ? data.full_name : "Administrator");
    } else if (metadataName) {
      setAdminName((metadataName && metadataName !== email.split("@")[0]) ? metadataName : "Administrator");
    } else {
      setAdminName("Administrator");
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
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminTopNav adminName="Administrator" />

      <main className="relative mx-auto max-w-7xl px-6 py-8 lg:px-8 lg:py-10">
        <div className={`glass-card relative overflow-hidden rounded-[2rem] border border-white/70 p-8 shadow-[0_25px_60px_-30px_rgba(14,116,144,0.5)] ring-1 ring-sky-100/80 transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'}`}>
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-sky-500/12 via-cyan-400/10 to-indigo-400/10" />
          <div className="relative flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full bg-gradient-to-r from-sky-100 to-cyan-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.3em] text-sky-700 shadow-inner shadow-sky-100">
                Admin Dashboard
              </span>
              <h2 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950">
                Welcome back, {adminName || "Administrator"}
              </h2>
              <p className="mt-4 max-w-xl text-slate-600">
                Your central hub for managing users, questions, and system health.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 sm:grid-cols-3">
              <div className={`stat-card rounded-[1.75rem] bg-gradient-to-br from-sky-100 via-white to-cyan-50 p-5 text-center shadow-[0_18px_40px_-24px_rgba(14,116,144,0.8)] transition duration-500 ${mounted ? 'scale-100' : 'scale-95'}`}>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Users</p>
                <p className="mt-3 text-3xl font-semibold text-sky-700"><CountUp value={totalUsers} className="inline-block" /></p>
              </div>
              <div className={`stat-card rounded-[1.75rem] bg-gradient-to-br from-cyan-100 via-white to-sky-50 p-5 text-center shadow-[0_18px_40px_-24px_rgba(14,116,144,0.8)] transition duration-500 ${mounted ? 'scale-100' : 'scale-95'}`}>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Questions</p>
                <p className="mt-3 text-3xl font-semibold text-cyan-700"><CountUp value={totalQuestions} className="inline-block" /></p>
              </div>
              <div className={`stat-card rounded-[1.75rem] bg-gradient-to-br from-violet-100 via-white to-indigo-50 p-5 text-center shadow-[0_18px_40px_-24px_rgba(99,102,241,0.7)] transition duration-500 ${mounted ? 'scale-100' : 'scale-95'}`}>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Status</p>
                <p className="mt-3 text-3xl font-semibold text-violet-700">{mounted ? <span className="inline-flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)] animate-pulse" />Live</span> : 'Live'}</p>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(420px,1fr)_360px]">
          <div className="grid gap-6 md:grid-cols-2">
            <article className="glass-card hover-lift rounded-[1.75rem] border border-white/70 p-8 shadow-[0_20px_45px_-30px_rgba(37,99,235,0.65)] ring-1 ring-sky-100/70 transition duration-500">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Users</p>
                  <p className="mt-4 text-5xl font-semibold text-slate-900">{totalUsers}</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-500 to-cyan-400 text-xl text-white shadow-[0_16px_28px_-16px_rgba(14,165,233,0.9)]">
                  <FaUsers />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600">Current active users in your system.</p>
            </article>

            <article className="glass-card hover-lift rounded-[1.75rem] border border-white/70 p-8 shadow-[0_20px_45px_-30px_rgba(6,182,212,0.65)] ring-1 ring-cyan-100/70 transition duration-500">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Questions</p>
                  <p className="mt-4 text-5xl font-semibold text-slate-950">{totalQuestions}</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-500 to-sky-500 text-xl text-white shadow-[0_16px_28px_-16px_rgba(6,182,212,0.9)]">
                  <FaQuestionCircle />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600">Questions available for candidate review and management.</p>
            </article>
          </div>

          <aside className="space-y-6">
            <article className="glass-card hover-lift rounded-[2rem] border border-white/70 p-6 shadow-[0_20px_45px_-30px_rgba(16,185,129,0.5)] ring-1 ring-emerald-100/70 transition duration-500">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">System health</p>
                  <h4 className="mt-2 text-xl font-semibold text-slate-950">All systems operational</h4>
                </div>
                <span className="inline-flex rounded-full bg-gradient-to-r from-emerald-100 to-cyan-100 px-3 py-2 text-xs font-semibold text-emerald-700 shadow-inner shadow-emerald-100">Good</span>
              </div>
              <p className="mt-4 text-sm text-slate-600">No outages detected. Metrics and workflows are strong across the board.</p>
            </article>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;