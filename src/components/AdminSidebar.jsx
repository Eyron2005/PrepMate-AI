import { NavLink, useNavigate } from "react-router-dom";
import {
  FaUserCog,
  FaUsers,
  FaQuestionCircle,
  FaSignOutAlt,
  FaUserTie,
  FaDatabase,
  FaCog,
  FaUserCheck,
} from "react-icons/fa";
import { supabase } from "../services/supabase";

export default function AdminSidebar({ adminName = "Administrator" }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
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
            <p className="text-xs font-medium tracking-[0.18em] text-sky-700 uppercase">Admin Panel</p>
          </div>
      </div>

      <nav className="mt-8 flex flex-1 flex-col gap-2 overflow-y-auto">
          <NavLink to="/dashboard" title="Dashboard" aria-label="Dashboard" className={navLinkClass}>
            <FaUserCog className="shrink-0 text-base" />
            <span className="hidden md:inline">Dashboard</span>
          </NavLink>

          <NavLink to="/user-management" title="User Management" aria-label="User Management" className={navLinkClass}>
            <FaUsers className="shrink-0 text-base" />
            <span className="hidden md:inline">User Management</span>
          </NavLink>

          <NavLink to="/question-management" title="Question Management" aria-label="Question Management" className={navLinkClass}>
            <FaQuestionCircle className="shrink-0 text-base" />
            <span className="hidden md:inline">Question Management</span>
          </NavLink>

          <NavLink to="/staff-management" title="Staff Management" aria-label="Staff Management" className={navLinkClass}>
            <FaUserTie className="shrink-0 text-base" />
            <span className="hidden md:inline">Staff Management</span>
          </NavLink>

          <NavLink to="/staff-assignments" title="Staff Assignments" aria-label="Staff Assignments" className={navLinkClass}>
            <FaUserCheck className="shrink-0 text-base" />
            <span className="hidden md:inline">Staff Assignments</span>
          </NavLink>

          <NavLink to="/backup-restore" title="Backup and Restore" aria-label="Backup and Restore" className={navLinkClass}>
            <FaDatabase className="shrink-0 text-base" />
            <span className="hidden md:inline">Backup &amp; Restore</span>
          </NavLink>

          <NavLink to="/system-settings" title="System Settings" aria-label="System Settings" className={navLinkClass}>
            <FaCog className="shrink-0 text-base" />
            <span className="hidden md:inline">System Settings</span>
          </NavLink>
      </nav>

      <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-200 pt-4 md:items-stretch">
          <div className="hidden truncate rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2 text-sm font-semibold text-sky-800 shadow-inner shadow-sky-100 md:block">
            {adminName || "Administrator"}
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
