import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FaClipboardList, FaEnvelope, FaFileAlt, FaArrowRight, FaCalendarAlt, FaUserTie } from "react-icons/fa";
import StaffSidebar from "../components/StaffSidebar";
import { useAuth } from "../contexts/authContext";

const sections = [
  {
    title: "Student Records",
    badge: "Assigned Students",
    description: "Inspect student profiles, assigned tracks, and supervisor progress monitoring.",
    href: "/staff/student-records",
    icon: FaClipboardList,
    color: "from-violet-500 to-indigo-600",
    surface: "border-violet-100/90",
  },
  {
    title: "Interview Results",
    badge: "Mock Evaluations",
    description: "Review interview session recordings, score breakdowns, and AI feedback rubrics.",
    href: "/staff/interview-results",
    icon: FaFileAlt,
    color: "from-emerald-500 to-teal-600",
    surface: "border-emerald-100/90",
  },
  {
    title: "Email Communication",
    badge: "Student Outreach",
    description: "Send personalized reminders, feedback, and concerns directly to your assigned students.",
    href: "/staff/email-communication",
    icon: FaEnvelope,
    color: "from-sky-500 to-blue-600",
    surface: "border-sky-100/90",
  },
];

function StaffDashboard() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const metadataName = session?.user?.user_metadata?.full_name;
  const email = session?.user?.email;
  const staffName = userId
    ? metadataName || email?.split("@")[0] || "Staff"
    : "Staff";

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

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <StaffSidebar staffName={staffName} />

      <main className="relative ml-20 max-w-7xl px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        <section className="glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-white/80 p-7 shadow-[0_25px_60px_-25px_rgba(14,116,144,0.35)] ring-1 ring-sky-100/90 sm:p-9">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-sky-400/15 via-indigo-400/12 to-cyan-400/10" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-100 to-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-indigo-800 shadow-sm">
                  <FaUserTie className="text-[11px]" />
                  Staff Portal
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur-sm">
                  <FaCalendarAlt className="text-slate-400 text-[11px]" />
                  {todayFormatted}
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                {greeting}, <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-600 bg-clip-text text-transparent">{staffName}</span>
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Your supervisor dashboard for Prepmate AI. Review your assigned students, assess performance transcripts, and monitor interview readiness.
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-2 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/70 p-4 shadow-sm ring-1 ring-emerald-100/80 sm:items-end">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Supervisor Session Active
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">Role-scoped access granted</p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-700">Supervisor Hub</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Assigned Tools</h2>
            </div>
            <p className="text-xs font-medium text-slate-500 sm:text-sm">Choose an area to review</p>
          </div>
          <div className="grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map(({ title, badge, description, href, icon: Icon, color, surface }) => (
              <Link
                key={href}
                to={href}
                className={`glass-card group relative flex min-h-68 flex-col justify-between overflow-hidden rounded-[2rem] border ${surface} p-7 shadow-[0_15px_35px_-20px_rgba(14,116,144,0.3)] ring-1 ring-white/80 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_50px_-20px_rgba(37,99,235,0.4)] hover:ring-sky-200`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-xl text-white shadow-md shadow-indigo-500/25 ring-1 ring-white/30 transition-transform duration-300 group-hover:scale-110`}>
                      <Icon />
                    </span>
                    <span className="rounded-full border border-slate-200/70 bg-slate-50/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 transition group-hover:border-indigo-300 group-hover:bg-indigo-50 group-hover:text-indigo-800">
                      {badge}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-slate-950 transition group-hover:text-indigo-700">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-slate-100/80 pt-4 text-xs font-bold text-indigo-700">
                  <span className="transition group-hover:underline">Open section</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition-transform duration-300 group-hover:translate-x-1 group-hover:bg-indigo-600 group-hover:text-white">
                    <FaArrowRight className="text-[10px]" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default StaffDashboard;
