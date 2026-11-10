import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FaClipboardList, FaEnvelope, FaFileAlt, FaArrowRight, FaCalendarAlt, FaUserTie } from "react-icons/fa";
import StaffSidebar from "../components/StaffSidebar";
import { useAuth } from "../contexts/authContext";
import { fetchCurrentStaffProfile, getCachedStaffProfile } from "../services/staffProfile";

const sections = [
  {
    title: "Student Records",
    badge: "Assigned Students",
    description: "View your assigned students, their details, and interview progress.",
    href: "/staff/student-records",
    icon: FaClipboardList,
    color: "bg-violet-600",
    surface: "border-slate-200",
  },
  {
    title: "Interview Results",
    badge: "Mock Evaluations",
    description: "See student interview answers, scores, and AI feedback.",
    href: "/staff/interview-results",
    icon: FaFileAlt,
    color: "bg-emerald-600",
    surface: "border-slate-200",
  },
  {
    title: "Email Communication",
    badge: "Student Outreach",
    description: "Send personalized reminders, feedback, and concerns directly to your assigned students.",
    href: "/staff/email-communication",
    icon: FaEnvelope,
    color: "bg-blue-600",
    surface: "border-slate-200",
  },
];

function StaffDashboard() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const email = session?.user?.email || "";
  const [profileState, setProfileState] = useState({
    userId: null,
    displayName: "",
  });

  const cachedStaff = userId ? getCachedStaffProfile(userId, email) : null;
  const staffName =
    cachedStaff?.displayName ||
    (profileState.userId === userId ? profileState.displayName : "");

  useEffect(() => {
    let active = true;

    async function loadStaffName() {
      if (!userId || getCachedStaffProfile(userId, email)) return;

      const profile = await fetchCurrentStaffProfile(session);
      if (!active) return;
      setProfileState({ userId, displayName: profile.displayName });
    }

    loadStaffName();

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

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <StaffSidebar staffName={staffName || undefined} />

      <main className="relative ml-20 max-w-7xl px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        <section className="glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-slate-200 p-7 shadow-sm sm:p-9">
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-indigo-800 shadow-sm">
                  <FaUserTie className="text-[11px]" />
                  Staff Portal
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  <FaCalendarAlt className="text-slate-400 text-[11px]" />
                  {todayFormatted}
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                {greeting}{staffName ? ", " : ""}<span className="text-indigo-600">{staffName}</span>
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                View your assigned students, check their interview results, and track readiness progress.
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-4 shadow-sm ring-1 ring-emerald-100/80 sm:items-end">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Supervisor Session Active
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">Staff access active</p>
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
                className={`glass-card group relative flex min-h-68 flex-col justify-between overflow-hidden rounded-[2rem] border ${surface} p-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md hover:border-indigo-300`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`flex h-13 w-13 items-center justify-center rounded-2xl ${color} text-xl text-white shadow-md shadow-indigo-500/25 ring-1 ring-white/30 transition-transform duration-300 group-hover:scale-110`}>
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
