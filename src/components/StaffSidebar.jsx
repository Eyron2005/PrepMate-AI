import { NavLink, useNavigate } from "react-router-dom";
import {
  FaChartPie,
  FaClipboardList,
  FaFileAlt,
  FaCog,
  FaSignOutAlt,
} from "react-icons/fa";
import { supabase } from "../services/supabase";

const links = [
  { to: "/staff-dashboard", label: "Dashboard", icon: FaChartPie, end: true },
  { to: "/staff/student-records", label: "Student Records", icon: FaClipboardList },
  { to: "/staff/interview-results", label: "Interview Results", icon: FaFileAlt },
  { to: "/staff/system-settings", label: "System Settings", icon: FaCog },
];

export default function StaffSidebar({ staffName = "Staff" }) {
  const navigate = useNavigate();

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Unable to sign out:", error);
      return;
    }
    navigate("/");
  }

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-all duration-200 md:px-4 ${
      isActive
        ? "bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 text-white shadow-lg shadow-sky-500/20"
        : "text-slate-600 hover:bg-sky-50 hover:text-sky-700"
    }`;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-20 flex-col border-r border-sky-100/80 bg-white/90 px-2 py-4 shadow-[12px_0_40px_-28px_rgba(14,116,144,0.5)] backdrop-blur-xl md:w-64 md:px-4 md:py-6">
      <div className="flex items-center justify-center gap-3 px-1 md:justify-start md:px-2">
        <img
          src="/PrepmateLogo.svg"
          alt="Prepmate logo"
          className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_10px_12px_rgba(37,99,235,0.22)] md:h-11 md:w-11"
        />
        <div className="hidden min-w-0 md:block">
          <h1 className="text-xl font-semibold text-slate-900">Prepmate AI</h1>
          <p className="text-xs font-medium tracking-[0.18em] text-sky-700 uppercase">Staff Portal</p>
        </div>
      </div>

      <nav className="mt-8 flex flex-1 flex-col gap-2 overflow-y-auto">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            aria-label={label}
            className={navLinkClass}
          >
            <Icon className="shrink-0 text-base" />
            <span className="hidden md:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-200 pt-4 md:items-stretch">
        <div className="hidden truncate rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2 text-sm font-semibold text-sky-800 shadow-inner shadow-sky-100 md:block">
          {staffName || "Staff"}
        </div>
        <button
          onClick={handleLogout}
          aria-label="Logout"
          title="Logout"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 px-3 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_-12px_rgba(239,68,68,0.9)] transition duration-300 hover:shadow-[0_16px_28px_-14px_rgba(239,68,68,0.95)] md:justify-start md:px-4"
        >
          <FaSignOutAlt className="text-sm" />
          <span className="hidden md:inline">Logout</span>
        </button>
      </div>
    </aside>
  );
}
