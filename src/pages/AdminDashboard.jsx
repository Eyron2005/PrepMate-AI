import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase";
import AdminSidebar from "../components/AdminSidebar";
import { useAuth } from "../contexts/authContext";
import { fetchCurrentAdminProfile, getCachedAdminProfile } from "../services/adminProfile";
import {
  FaUsers,
  FaQuestionCircle,
  FaUserTie,
  FaDatabase,
  FaFileAlt,
  FaUserCheck,
  FaArrowRight,
  FaCalendarAlt,
  FaShieldAlt,
  FaPlus,
  FaServer,
  FaUserClock,
} from "react-icons/fa";

function AdminDashboard() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const email = session?.user?.email || "";
  const [profileState, setProfileState] = useState({
    userId: null,
    displayName: "",
  });
  const [totalUsers, setTotalUsers] = useState(null);
  const [totalQuestions, setTotalQuestions] = useState(null);
  const [pendingRequests, setPendingRequests] = useState(null);
  const [mounted, setMounted] = useState(false);

  const cachedAdmin = userId ? getCachedAdminProfile(userId, email) : null;
  const adminName =
    cachedAdmin?.displayName ||
    (profileState.userId === userId ? profileState.displayName : "");

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAdminName() {
      if (!userId || getCachedAdminProfile(userId, email)) return;

      const profile = await fetchCurrentAdminProfile(session);
      if (!active) return;
      setProfileState({ userId, displayName: profile.displayName });
    }

    async function loadDashboard() {
      const [userResult, questionResult, requestsResult] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("questions").select("id", { count: "exact", head: true }),
        supabase.from("account_reactivation_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      if (!active) return;

      if (userResult.error) {
        console.error("Unable to load the registered user count:", userResult.error);
      } else {
        setTotalUsers(userResult.count || 0);
      }
      if (questionResult.error) {
        console.error("Unable to load the question count:", questionResult.error);
      } else {
        setTotalQuestions(questionResult.count || 0);
      }
      if (requestsResult.error) {
        console.warn("Unable to load pending requests count:", requestsResult.error);
      } else {
        setPendingRequests(requestsResult.count || 0);
      }
    }

    loadAdminName();
    loadDashboard();

    return () => {
      active = false;
    };
  }, [email, session, userId]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const managementTools = [
    {
      title: "User Management",
      badge: "User Directory",
      description: "Manage registered student accounts, monitor active sessions, and oversee account activation.",
      href: "/user-management",
      icon: FaUsers,
      color: "from-sky-500 to-blue-600",
      surface: "border-sky-100/90",
      count: totalUsers ?? "—",
      countLabel: "Registered Profiles",
    },
    {
      title: "Reactivation Requests",
      badge: "Review Queue",
      description: "Review reactivation appeals from deactivated students and approve or reject access requests.",
      href: "/reactivation-requests",
      icon: FaUserClock,
      color: "from-amber-500 to-orange-600",
      surface: "border-amber-100/90",
      count: pendingRequests ?? "—",
      countLabel: "Pending Appeals",
    },
    {
      title: "Question Management",
      badge: "Question Bank",
      description: "Curate mock interview questions across Technical, Behavioral, Situational, and HR tracks.",
      href: "/question-management",
      icon: FaQuestionCircle,
      color: "from-cyan-500 to-teal-600",
      surface: "border-cyan-100/90",
      count: totalQuestions ?? "—",
      countLabel: "Active Questions",
    },
    {
      title: "Staff Management",
      badge: "Supervisors",
      description: "Invite supervisors, configure department roles, and handle staff access credentials.",
      href: "/staff-management",
      icon: FaUserTie,
      color: "from-violet-500 to-indigo-600",
      surface: "border-violet-100/90",
      count: null,
      countLabel: null,
    },
    {
      title: "Staff Assignments",
      badge: "Student Pairing",
      description: "Assign designated staff members to specific student cohorts and track responsibilities.",
      href: "/staff-assignments",
      icon: FaUserCheck,
      color: "from-blue-500 to-indigo-600",
      surface: "border-blue-100/90",
      count: null,
      countLabel: null,
    },
    {
      title: "Interview Results",
      badge: "Evaluations",
      description: "Inspect student interview sessions, AI score rubrics, detailed feedback, and performance trends.",
      href: "/interview-results",
      icon: FaFileAlt,
      color: "from-indigo-500 to-purple-600",
      surface: "border-indigo-100/90",
      count: null,
      countLabel: null,
    },
    {
      title: "Backup & Restore",
      badge: "Data Protection",
      description: "Generate timestamped database snapshots or restore tables with verified integrity checks.",
      href: "/backup-restore",
      icon: FaDatabase,
      color: "from-emerald-500 to-teal-600",
      surface: "border-emerald-100/90",
      count: null,
      countLabel: null,
    },
  ];

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar adminName={adminName || undefined} />

      <main className="relative ml-20 max-w-7xl px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Hero Command Banner */}
        <section
          className={`glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-white/80 p-7 shadow-[0_25px_60px_-25px_rgba(14,116,144,0.35)] ring-1 ring-sky-100/90 transition-all duration-700 sm:p-9 ${
            mounted ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
          }`}
        >
          {/* Subtle Ambient Accent Header */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-sky-400/15 via-cyan-400/12 to-indigo-400/10" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-100 to-cyan-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-sky-800 shadow-sm">
                  <FaShieldAlt className="text-sky-600 text-[11px]" />
                  Admin Console
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur-sm">
                  <FaCalendarAlt className="text-slate-400 text-[11px]" />
                  {todayFormatted}
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                {greeting}{adminName ? ", " : ""}<span className="bg-gradient-to-r from-sky-600 via-blue-600 to-cyan-600 bg-clip-text text-transparent">{adminName}</span>
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                System overview and administration controls for Prepmate AI. Monitor candidate engagement, review question banks, and oversee staff activities.
              </p>
            </div>

            {/* Live Operational Status Pill */}
            <div className="flex shrink-0 flex-col items-start gap-2.5 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/70 p-4 shadow-sm ring-1 ring-emerald-100/80 sm:items-end">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Supabase Live
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">
                Connected · 11 Edge Functions Active
              </p>
            </div>
          </div>

          {/* Quick Command Actions */}
          <div className="relative mt-7 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-5 text-xs">
            <span className="font-bold uppercase tracking-wider text-slate-500">Quick Shortcuts:</span>
            <Link
              to="/reactivation-requests"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-1.5 font-semibold text-amber-700 transition hover:bg-amber-100/80 hover:text-amber-900"
            >
              <FaUserClock className="text-[10px]" /> Review Requests ({pendingRequests ?? 0})
            </Link>
            <Link
              to="/question-management"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200/80 bg-sky-50/80 px-3 py-1.5 font-semibold text-sky-700 transition hover:bg-sky-100/80 hover:text-sky-900"
            >
              <FaPlus className="text-[10px]" /> Add Question
            </Link>
            <Link
              to="/staff-management"
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200/80 bg-violet-50/80 px-3 py-1.5 font-semibold text-violet-700 transition hover:bg-violet-100/80 hover:text-violet-900"
            >
              <FaUserTie className="text-[10px]" /> Invite Staff
            </Link>
            <Link
              to="/interview-results"
              className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200/80 bg-purple-50/80 px-3 py-1.5 font-semibold text-purple-700 transition hover:bg-purple-100/80 hover:text-purple-900"
            >
              <FaFileAlt className="text-[10px]" /> View Results
            </Link>
          </div>
        </section>

        {/* Section Heading */}
        <section className="mt-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-700">Workspace Hub</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Management Modules</h2>
            </div>
            <p className="text-xs font-medium text-slate-500 sm:text-sm">Select any module to inspect and configure</p>
          </div>

          {/* Cards Grid */}
          <div className="grid items-stretch gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {managementTools.map(({ title, badge, description, href, icon: Icon, color, surface, count, countLabel }) => (
              <Link
                key={href}
                to={href}
                className={`glass-card group relative flex min-h-68 flex-col justify-between overflow-hidden rounded-[2rem] border ${surface} p-6 shadow-[0_15px_35px_-20px_rgba(14,116,144,0.3)] ring-1 ring-white/80 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_50px_-20px_rgba(37,99,235,0.4)] hover:ring-sky-200`}
              >
                <div className="absolute -top-16 -right-16 h-36 w-36 rounded-full bg-sky-200/20 blur-2xl transition duration-500 group-hover:scale-125" />

                <div>
                  <div className="flex items-center justify-between">
                    <span className={`flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-xl text-white shadow-md shadow-sky-500/25 ring-1 ring-white/30 transition-transform duration-300 group-hover:scale-110`}>
                      <Icon />
                    </span>
                    <span className="rounded-full border border-slate-200/70 bg-slate-50/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 transition group-hover:border-sky-300 group-hover:bg-sky-50 group-hover:text-sky-800">
                      {badge}
                    </span>
                  </div>

                  <h3 className="mt-5 text-xl font-bold text-slate-950 transition group-hover:text-sky-700">
                    {title}
                  </h3>

                  {count !== null && (
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold tracking-tight text-slate-950">{count}</span>
                      {countLabel && <span className="text-xs font-semibold text-slate-500">{countLabel}</span>}
                    </div>
                  )}

                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {description}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-slate-100/80 pt-4 text-xs font-bold text-sky-700">
                  <span className="transition group-hover:underline">Launch module</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-50 text-sky-600 transition-transform duration-300 group-hover:translate-x-1 group-hover:bg-sky-600 group-hover:text-white">
                    <FaArrowRight className="text-[10px]" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Security & Infrastructure Banner */}
        <section className="mt-10 rounded-[2rem] border border-sky-100/80 bg-gradient-to-r from-sky-50/60 via-white to-cyan-50/50 p-6 shadow-sm ring-1 ring-sky-200/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-md shadow-sky-500/25">
                <FaServer />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Infrastructure &amp; Access Controls</h4>
                <p className="text-xs text-slate-600">Row-level security policies, account deactivation restrictions, and real-time presence active on linked Supabase backend.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>RLS Enforced</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;
