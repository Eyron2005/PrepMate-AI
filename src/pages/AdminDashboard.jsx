import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import AdminSidebar from "../components/AdminSidebar";
import {
  FaUsers,
  FaQuestionCircle,
  FaUserTie,
  FaDatabase,
  FaCog,
} from "react-icons/fa";

function AdminDashboard() {
  const navigate = useNavigate();
  const [adminName, setAdminName] = useState("Administrator");
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;
      if (!session) {
        navigate("/");
        return;
      }

      const { data, error } = await supabase
        .from("admins")
        .select("full_name")
        .eq("id", session.user.id)
        .single();

      if (!active) return;
      const metadataName = session.user.user_metadata?.full_name;
      const email = session.user.email || "";
      const name = error ? metadataName : data?.full_name || metadataName;
      setAdminName(name && name !== email.split("@")[0] ? name : "Administrator");
    }

    async function loadDashboard() {
      const { count: userCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      if (active) setTotalUsers(userCount || 0);

      const { count: questionCount } = await supabase
        .from("questions")
        .select("*", { count: "exact", head: true });
      if (active) setTotalQuestions(questionCount || 0);
    }

    const frameId = requestAnimationFrame(() => {
      checkSession();
      loadDashboard();
    });

    return () => {
      active = false;
      cancelAnimationFrame(frameId);
    };
  }, [navigate]);

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar adminName={adminName} />

      <main className="relative ml-20 max-w-7xl px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        <section className={`glass-card relative overflow-hidden rounded-[2rem] border border-white/70 p-7 shadow-[0_25px_60px_-30px_rgba(14,116,144,0.5)] ring-1 ring-sky-100/80 transition-all duration-700 sm:p-9 ${mounted ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"}`}>
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-sky-500/10 via-cyan-400/10 to-indigo-400/10" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="inline-flex rounded-full bg-gradient-to-r from-sky-100 to-cyan-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.3em] text-sky-700">
                Admin Dashboard
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Welcome back, {adminName || "Administrator"}
              </h1>
              <p className="mt-3 max-w-2xl text-slate-600">
                Your overview of users, questions, and the tools you use to manage PrepMate AI.
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.65)]" />
              All systems operational
            </div>
          </div>
        </section>

        <section className="mt-9">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-700">Workspace</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">Management tools</h2>
            </div>
            <p className="text-sm text-slate-500">Choose a section to get started</p>
          </div>
          <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[
              {
                title: "Total Users",
                description: "Registered profiles currently available in your system.",
                href: "/user-management",
                icon: FaUsers,
                color: "from-sky-500 to-cyan-500",
                surface: "border-sky-100",
                count: totalUsers,
              },
              {
                title: "Total Questions",
                description: "Questions available for candidate review and management.",
                href: "/question-management",
                icon: FaQuestionCircle,
                color: "from-cyan-500 to-sky-500",
                surface: "border-cyan-100",
                count: totalQuestions,
              },
              {
                title: "Staff Management",
                description: "Manage staff profiles and supervisor assignments.",
                href: "/staff-management",
                icon: FaUserTie,
                color: "from-violet-500 to-indigo-500",
                surface: "border-violet-100",
                count: null,
              },
              {
                title: "Backup & Restore",
                description: "Download a backup or restore a saved snapshot.",
                href: "/backup-restore",
                icon: FaDatabase,
                color: "from-emerald-500 to-teal-500",
                surface: "border-emerald-100",
                count: null,
              },
              {
                title: "System Settings",
                description: "Configure organization details and OJT defaults.",
                href: "/system-settings",
                icon: FaCog,
                color: "from-amber-500 to-orange-500",
                surface: "border-amber-100",
                count: null,
              },
            ].map(({ title, description, href, icon: Icon, color, surface, count }) => (
              <Link
                key={href}
                to={href}
                className={`glass-card group flex min-h-64 flex-col rounded-[1.75rem] border ${surface} p-6 shadow-[0_18px_40px_-30px_rgba(37,99,235,0.55)] ring-1 ring-white/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_45px_-28px_rgba(37,99,235,0.45)]`}
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-lg text-white shadow-lg`}>
                    <Icon />
                  </span>
                  <span className="text-xl text-slate-300 transition group-hover:translate-x-1 group-hover:text-sky-600" aria-hidden="true">→</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{title}</h3>
                {count !== null && (
                  <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{count}</p>
                )}
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{description}</p>
                <span className="mt-5 text-sm font-semibold text-sky-700">Open management</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;