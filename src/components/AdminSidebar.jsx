import { useEffect, useState } from "react";
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
  FaUserClock,
  FaEnvelope,
  FaSlidersH,
} from "react-icons/fa";
import { supabase } from "../services/supabase";
import { clearProfileOnlineStatus } from "../services/profilePresence";
import { useAuth } from "../contexts/authContext";
import {
  clearAdminProfileCache,
  fetchCurrentAdminProfile,
  formatAdminDisplayName,
  getAdminAvatarInitial,
  getCachedAdminProfile,
  isGenericRoleLabel,
  resolveAdminDisplayName,
} from "../services/adminProfile";

export default function AdminSidebar({ adminName }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const userEmail = session?.user?.email || "";
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [profileState, setProfileState] = useState({
    userId: null,
    profile: null,
  });

  useEffect(() => {
    let active = true;
    async function loadPendingCount() {
      try {
        const { count, error } = await supabase
          .from("account_reactivation_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");

        if (!error && active && count !== null) {
          setPendingRequestsCount(count);
        }
      } catch (err) {
        console.warn("Unable to load pending reactivation requests count:", err);
      }
    }

    loadPendingCount();
    const intervalId = window.setInterval(loadPendingCount, 45_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!userId) {
      clearAdminProfileCache();
      return () => {
        active = false;
      };
    }

    // Skip network lookup when this session's profile is already cached
    if (getCachedAdminProfile(userId, userEmail)) {
      return () => {
        active = false;
      };
    }

    async function loadAdminProfile() {
      try {
        const profile = await fetchCurrentAdminProfile(session);
        if (active) {
          setProfileState({ userId, profile });
        }
      } catch (err) {
        console.warn("Unable to load administrator profile:", err);
        if (active) {
          setProfileState({
            userId,
            profile: resolveAdminDisplayName({ user: session?.user }),
          });
        }
      }
    }

    loadAdminProfile();

    return () => {
      active = false;
    };
  }, [session, userEmail, userId]);

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

    clearAdminProfileCache();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("Unable to sign out:", error);
      return;
    }
    navigate("/");
  }

  const navLinkClass = ({ isActive }) =>
    `group relative flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold transition-all duration-200 md:px-4 ${
      isActive
        ? "bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 text-white shadow-lg shadow-sky-500/25 ring-1 ring-white/20"
        : "text-slate-600 hover:bg-gradient-to-r hover:from-sky-50/90 hover:to-cyan-50/50 hover:text-sky-700 hover:translate-x-0.5"
    }`;

  const propDisplayName =
    typeof adminName === "string" && !isGenericRoleLabel(adminName)
      ? formatAdminDisplayName(adminName)
      : "";

  const cachedProfile = userId ? getCachedAdminProfile(userId, userEmail) : null;
  const loadedProfile =
    cachedProfile || (profileState.userId === userId ? profileState.profile : null);

  const resolvedProfile = propDisplayName
    ? {
        displayName: propDisplayName,
        initial: getAdminAvatarInitial(propDisplayName),
      }
    : loadedProfile || (!userId ? { displayName: "Admin Account", initial: "A" } : null);

  const displayName = resolvedProfile?.displayName || "";
  const initial = resolvedProfile?.initial || "A";

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
          <div className="flex items-center gap-3">
            <FaUserCog className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">Dashboard</span>
          </div>
        </NavLink>

        <NavLink to="/user-management" title="User Management" aria-label="User Management" className={navLinkClass}>
          <div className="flex items-center gap-3">
            <FaUsers className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">User Management</span>
          </div>
        </NavLink>

        <NavLink to="/reactivation-requests" title="Reactivation Requests" aria-label="Reactivation Requests" className={navLinkClass}>
          <div className="flex items-center gap-3">
            <FaUserClock className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">Reactivation Requests</span>
          </div>
          {pendingRequestsCount > 0 && (
            <span className="hidden md:inline-flex rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm shadow-amber-500/50">
              {pendingRequestsCount}
            </span>
          )}
        </NavLink>

        <NavLink to="/question-management" title="Question Management" aria-label="Question Management" className={navLinkClass}>
          <div className="flex items-center gap-3">
            <FaQuestionCircle className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">Question Management</span>
          </div>
        </NavLink>

        <NavLink to="/interview-mode" title="Industries & Job Roles" aria-label="Industries & Job Roles" className={navLinkClass}>
          <div className="flex items-center gap-3">
            <FaSlidersH className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">Industries &amp; Roles</span>
          </div>
        </NavLink>

        <NavLink to="/staff-management" title="Staff Management" aria-label="Staff Management" className={navLinkClass}>
          <div className="flex items-center gap-3">
            <FaUserTie className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">Staff Management</span>
          </div>
        </NavLink>

        <NavLink to="/staff-assignments" title="Staff Assignments" aria-label="Staff Assignments" className={navLinkClass}>
          <div className="flex items-center gap-3">
            <FaUserCheck className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">Staff Assignments</span>
          </div>
        </NavLink>

        <NavLink to="/interview-results" title="Interview Results" aria-label="Interview Results" className={navLinkClass}>
          <div className="flex items-center gap-3">
            <FaFileAlt className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">Interview Results</span>
          </div>
        </NavLink>

        <NavLink to="/email-communication" title="Email Communication" aria-label="Email Communication" className={navLinkClass}>
          <div className="flex items-center gap-3">
            <FaEnvelope className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">Email Communication</span>
          </div>
        </NavLink>

        <NavLink to="/backup-restore" title="Backup and Restore" aria-label="Backup and Restore" className={navLinkClass}>
          <div className="flex items-center gap-3">
            <FaDatabase className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">Backup &amp; Restore</span>
          </div>
        </NavLink>
      </nav>

      {/* Admin Profile & Logout */}
      <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-200/80 pt-4 md:items-stretch">
        <div className="hidden items-center gap-3 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-cyan-50/60 p-2.5 shadow-sm ring-1 ring-sky-200/40 md:flex">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-bold text-white shadow-md shadow-sky-500/30">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-900" title={displayName || undefined}>
              {displayName || (
                <span
                  className="inline-block h-3 w-24 animate-pulse rounded bg-slate-200 align-middle"
                  aria-label="Loading administrator name"
                />
              )}
            </p>
            <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-sky-700 uppercase">
              <FaShieldAlt className="text-[9px]" /> ADMIN
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
