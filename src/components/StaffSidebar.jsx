import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  FaChartPie,
  FaClipboardList,
  FaEnvelope,
  FaFileAlt,
  FaSignOutAlt,
  FaUserTie,
} from "react-icons/fa";
import { supabase } from "../services/supabase";
import { clearProfileOnlineStatus } from "../services/profilePresence";
import { useAuth } from "../contexts/authContext";
import {
  formatAdminDisplayName,
  getAdminAvatarInitial,
  isGenericRoleLabel,
} from "../services/adminProfile";
import {
  clearStaffProfileCache,
  fetchCurrentStaffProfile,
  getCachedStaffProfile,
  resolveStaffDisplayName,
} from "../services/staffProfile";

const links = [
  { to: "/staff-dashboard", label: "Dashboard", icon: FaChartPie, end: true },
  { to: "/staff/student-records", label: "Student Records", icon: FaClipboardList },
  { to: "/staff/interview-results", label: "Interview Results", icon: FaFileAlt },
  { to: "/staff/email-communication", label: "Email Communication", icon: FaEnvelope },
];

export default function StaffSidebar({ staffName }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const userEmail = session?.user?.email || "";
  const [profileState, setProfileState] = useState({
    userId: null,
    profile: null,
  });

  useEffect(() => {
    let active = true;

    if (!userId) {
      clearStaffProfileCache();
      return () => {
        active = false;
      };
    }

    if (getCachedStaffProfile(userId, userEmail)) {
      return () => {
        active = false;
      };
    }

    async function loadStaffProfile() {
      try {
        const profile = await fetchCurrentStaffProfile(session);
        if (active) {
          setProfileState({ userId, profile });
        }
      } catch (err) {
        console.warn("Unable to load staff profile:", err);
        if (active) {
          setProfileState({
            userId,
            profile: resolveStaffDisplayName({ user: session?.user }),
          });
        }
      }
    }

    loadStaffProfile();

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

    clearStaffProfileCache();
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
        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
        : "text-slate-600 hover:bg-sky-50 hover:text-sky-700 hover:translate-x-0.5"
    }`;

  const propDisplayName =
    typeof staffName === "string" && !isGenericRoleLabel(staffName)
      ? formatAdminDisplayName(staffName)
      : "";

  const cachedProfile = userId ? getCachedStaffProfile(userId, userEmail) : null;
  const loadedProfile =
    cachedProfile || (profileState.userId === userId ? profileState.profile : null);

  const resolvedProfile = propDisplayName
    ? {
        displayName: propDisplayName,
        initial: getAdminAvatarInitial(propDisplayName),
      }
    : loadedProfile || (!userId ? { displayName: "Staff Member", initial: "S" } : null);

  const displayName = resolvedProfile?.displayName || "";
  const initial = resolvedProfile?.initial || "S";

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-20 flex-col border-r border-slate-200 bg-white px-2 py-4 shadow-sm md:w-64 md:px-4 md:py-6">
      {/* Brand Header */}
      <div className="flex items-center justify-center gap-3 px-1 md:justify-start md:px-2">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 p-1.5 border border-sky-200">
          <img
            src="/PrepmateLogo.svg"
            alt="Prepmate logo"
            className="h-full w-full object-contain"
          />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" title="System Online" />
        </div>
        <div className="hidden min-w-0 md:block">
          <h1 className="text-lg font-bold tracking-tight text-slate-950">Prepmate AI</h1>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Staff Portal</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-8 flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            aria-label={label}
            className={navLinkClass}
          >
            <Icon className="shrink-0 text-base transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Staff Profile & Logout */}
      <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-200 pt-4 md:items-stretch">
        <div className="hidden items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-2.5 shadow-xs md:flex">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-xs">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-900" title={displayName || undefined}>
              {displayName || (
                <span
                  className="inline-block h-3 w-24 animate-pulse rounded bg-slate-200 align-middle"
                  aria-label="Loading staff name"
                />
              )}
            </p>
            <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-indigo-700 uppercase">
              <FaUserTie className="text-[9px]" /> STAFF MEMBER
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          aria-label="Logout"
          title="Logout"
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-700 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 active:translate-y-0 md:justify-start md:px-4"
        >
          <FaSignOutAlt className="text-sm transition-transform group-hover:-translate-x-0.5" />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
