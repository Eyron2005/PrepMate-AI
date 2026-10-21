import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaClipboardList, FaCog, FaFileAlt } from "react-icons/fa";
import StaffSidebar from "../components/StaffSidebar";
import { supabase } from "../services/supabase";

const sections = [
  {
    title: "Student Records",
    description: "View students assigned to your responsibilities.",
    href: "/staff/student-records",
    icon: FaClipboardList,
    color: "from-violet-500 to-indigo-500",
    surface: "border-violet-100",
  },
  {
    title: "Interview Results",
    description: "Review results for students assigned to you.",
    href: "/staff/interview-results",
    icon: FaFileAlt,
    color: "from-emerald-500 to-teal-500",
    surface: "border-emerald-100",
  },
  {
    title: "System Settings",
    description: "View organization details and OJT defaults.",
    href: "/staff/system-settings",
    icon: FaCog,
    color: "from-amber-500 to-orange-500",
    surface: "border-amber-100",
  },
];

function StaffDashboard() {
  const [staffName, setStaffName] = useState("Staff");

  useEffect(() => {
    let active = true;

    async function loadStaffName() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("Unable to load staff session:", error);
        return;
      }
      if (!active || !session) return;

      const name = session.user.user_metadata?.full_name
        || session.user.email?.split("@")[0]
        || "Staff";
      setStaffName(name);
    }

    loadStaffName();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <StaffSidebar staffName={staffName} />

      <main className="relative ml-20 max-w-7xl px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        <section className="glass-card relative overflow-hidden rounded-[2rem] border border-white/70 p-7 shadow-[0_25px_60px_-30px_rgba(14,116,144,0.5)] ring-1 ring-sky-100/80 sm:p-9">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-sky-500/10 via-cyan-400/10 to-indigo-400/10" />
          <div className="relative">
            <span className="inline-flex rounded-full bg-gradient-to-r from-sky-100 to-cyan-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.3em] text-sky-700">
              Staff Dashboard
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Welcome back, {staffName}
            </h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Review your assigned students and interview results, and view limited system settings.
            </p>
          </div>
        </section>

        <section className="mt-9">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-700">Workspace</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">Staff tools</h2>
            </div>
            <p className="text-sm text-slate-500">Choose a section to get started</p>
          </div>
          <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map(({ title, description, href, icon: Icon, color, surface }) => (
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
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{description}</p>
                <span className="mt-5 text-sm font-semibold text-sky-700">Open section</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default StaffDashboard;
