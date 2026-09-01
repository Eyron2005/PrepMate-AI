import { NavLink, useNavigate } from "react-router-dom";
import { FaUserCog, FaUsers, FaQuestionCircle, FaSignOutAlt } from "react-icons/fa";
import { supabase } from "../services/supabase";

export default function AdminTopNav({ adminName = "Administrator" }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
      isActive
        ? "bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 text-white shadow-[0_10px_18px_-8px_rgba(37,99,235,0.7)]"
        : "bg-white/80 text-slate-700 shadow-[0_8px_18px_-12px_rgba(15,23,42,0.45)] hover:-translate-y-0.5 hover:bg-slate-50"
    }`;

  return (
    <header className="sticky top-0 z-20 border-b border-sky-100/80 bg-white/75 backdrop-blur-xl shadow-[0_18px_40px_-28px_rgba(14,116,144,0.5)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-sky-600 via-blue-600 to-cyan-500 text-lg font-bold text-white shadow-[0_14px_30px_-12px_rgba(37,99,235,0.9)] ring-2 ring-white/70">
            H
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Prepmate AI</h1>
            <p className="text-xs font-medium tracking-[0.18em] text-sky-700 uppercase">Admin Panel</p>
          </div>
        </div>

        <nav className="hidden items-center gap-3 md:flex">
          <NavLink to="/dashboard" className={navLinkClass}>
            <FaUserCog className="text-sm" />
            Dashboard
          </NavLink>

          <NavLink to="/user-management" className={navLinkClass}>
            <FaUsers className="text-sm" />
            User Management
          </NavLink>

          <NavLink to="/question-management" className={navLinkClass}>
            <FaQuestionCircle className="text-sm" />
            Question Management
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden rounded-full border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-1.5 text-sm font-semibold text-sky-800 shadow-inner shadow-sky-100 sm:block">
            {adminName || "Administrator"}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_-12px_rgba(239,68,68,0.9)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_28px_-14px_rgba(239,68,68,0.95)]"
          >
            <FaSignOutAlt className="text-sm" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
