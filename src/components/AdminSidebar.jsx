import { NavLink, useNavigate } from "react-router-dom";
import {
  FaUserCog,
  FaUsers,
  FaQuestionCircle,
  FaSignOutAlt,
  FaUserTie,
  FaDatabase,
  FaUserCheck,
  FaFileAlt,
  FaShieldAlt,
} from "react-icons/fa";
import { supabase } from "../services/supabase";
import { clearProfileOnlineStatus } from "../services/profilePresence";

export default function AdminSidebar({ adminName = "Administrator" }) {
  const navigate = useNavigate();

  async function handleLogout() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("Unable to retrieve the session before sign out:", sessionError);
      return;
    }

    if (sessionData.session?.user.id) {
      try {
        await clearProfileOnlineStatus(sessionData.session.user.id);
      } catch (error) {
        console.error("Unable to clear the profile online status:", error);
      }
    }

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("Unable to sign out:", error);
      return;
    }
    navigate("/");
  }

  const navLinkClass = ({ isActive }) =>
    `group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-all duration-200 md:px-4 ${
      isActive
        ? "bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 text-white shadow-lg shadow-sky-500/25 ring-1 ring-white/20"
        : "text-slate-600 hover:bg-gradient-to-r hover:from-sky-50/90 hover:to-cyan-50/50 hover:text-sky-700 hover:translate-x-0.5"
    }`;

  const initial = (adminName || "A").trim().charAt(0).toUpperCase();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-20 flex-col border-r border-sky-100/80 bg-white/92 px-2 py-4 shadow-[14px_0_45px_-24px_rgba(14,116,144,0.35)] backdrop-blur-2xl md:w-64 md:px-4 md:py-6">
      {/* Brand Header */}
      <div className="flex items-center justify-center gap-3 px-1 md:justify-start md:px-2">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-50 to-cyan-50 p-1.5 shadow-md shadow-sky-200/50 ring-1 ring-sky-200/70">
          <img
            src="/PrepmateLogo.svg"
            alt="Prepmate logo"
            className="h-full w-full object-contain drop-shadow-[0_4px_8px_rgba(37,99,235,0.25)]"
          />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" title="System Online" />
        </div>
        <div className="hidden min-w-0 md:block">
          <div className="flex items-center gap-1.5">
            <h1 className="text-lg font-bold tracking-tight text-slate-950">Prepmate</h1>
            <span className="rounded-md bg-gradient-to-r from-sky-500 to-cyan-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">AI</span>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Admin Console</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-8 flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        <NavLink to="/dashboard" title="Dashboard" aria-label="Dashboard" className={navLinkClass}>
          <FaUserCog className="shrink-0 text-base transition-transform group-hover:scale-110" />
          <span className="hidden md:inline">Dashboard</span>
        </NavLink>

        <NavLink to="/user-management" title="User Management" aria-label="User Management" className={navLinkClass}>
          <FaUsers className="shrink-0 text-base transition-transform group-hover:scale-110" />
          <span className="hidden md:inline">User Management</span>
        </NavLink>

        <NavLink to="/question-management" title="Question Management" aria-label="Question Management" className={navLinkClass}>
          <FaQuestionCircle className="shrink-0 text-base transition-transform group-hover:scale-110" />
          <span className="hidden md:inline">Question Management</span>
        </NavLink>

        <NavLink to="/staff-management" title="Staff Management" aria-label="Staff Management" className={navLinkClass}>
          <FaUserTie className="shrink-0 text-base transition-transform group-hover:scale-110" />
          <span className="hidden md:inline">Staff Management</span>
        </NavLink>

        <NavLink to="/staff-assignments" title="Staff Assignments" aria-label="Staff Assignments" className={navLinkClass}>
          <FaUserCheck className="shrink-0 text-base transition-transform group-hover:scale-110" />
          <span className="hidden md:inline">Staff Assignments</span>
        </NavLink>

        <NavLink to="/interview-results" title="Interview Results" aria-label="Interview Results" className={navLinkClass}>
          <FaFileAlt className="shrink-0 text-base transition-transform group-hover:scale-110" />
          <span className="hidden md:inline">Interview Results</span>
        </NavLink>

        <NavLink to="/backup-restore" title="Backup and Restore" aria-label="Backup and Restore" className={navLinkClass}>
          <FaDatabase className="shrink-0 text-base transition-transform group-hover:scale-110" />
          <span className="hidden md:inline">Backup &amp; Restore</span>
        </NavLink>
      </nav>

      {/* Admin Profile & Logout */}
      <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-200/80 pt-4 md:items-stretch">
        <div className="hidden items-center gap-3 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-cyan-50/60 p-2.5 shadow-sm ring-1 ring-sky-200/40 md:flex">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-bold text-white shadow-md shadow-sky-500/30">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-900">{adminName || "Administrator"}</p>
            <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-sky-700 uppercase">
              <FaShieldAlt className="text-[9px]" /> Admin
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          aria-label="Logout"
          title="Logout"
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 via-red-500 to-rose-600 px-3 py-2.5 text-xs font-semibold text-white shadow-[0_10px_20px_-10px_rgba(244,63,94,0.7)] transition duration-200 hover:shadow-[0_14px_25px_-8px_rgba(244,63,94,0.85)] hover:-translate-y-0.5 active:translate-y-0 md:justify-start md:px-4"
        >
          <FaSignOutAlt className="text-sm transition-transform group-hover:-translate-x-0.5" />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
