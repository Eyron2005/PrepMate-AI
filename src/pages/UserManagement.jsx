import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaEye,
  FaSearch,
  FaTrash,
  FaToggleOff,
  FaToggleOn,
  FaUserCircle,
  FaSyncAlt,
  FaCopy,
  FaCheck,
  FaTimes,
  FaShieldAlt,
  FaCalendarAlt,
  FaClock,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";
import { usePresence } from "../contexts/presenceContext";
import { isPresenceRecentlyOnline, ONLINE_THRESHOLD_MS } from "../services/presence";

const USER_PAGE_SIZE = 50;
const PROFILE_COLUMNS = "id, auth_user_id, full_name, email, is_active, created_at, last_online";

function getAccountIsActive(row) {
  const activeValue = row.is_active ?? row.active;

  if (typeof activeValue === "boolean") return activeValue;
  if (typeof activeValue === "string") {
    return ["true", "1", "active", "enabled"].includes(activeValue.trim().toLowerCase());
  }
  if (activeValue != null) return Boolean(activeValue);

  if (typeof row.status === "string" && row.status.trim()) {
    return row.status.trim().toLowerCase() === "active";
  }

  return true;
}

function escapeSearchValue(value) {
  return value.replace(/[\\%_,()"]/g, "\\$&");
}

function isMissingColumnError(error) {
  return error?.code === "42703"
    || error?.code === "PGRST204"
    || /column .* does not exist|could not find .* column/i.test(error?.message || "");
}

function getInitials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function UserManagement() {
  const { connectionCounts } = usePresence();
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'online' | 'offline'
  const [currentPage, setCurrentPage] = useState(0);
  const [matchingUserCount, setMatchingUserCount] = useState(0);
  const [totalUserCount, setTotalUserCount] = useState(null);
  const [onlineCount, setOnlineCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  const requestId = useRef(0);
  const requestController = useRef(null);
  const hasLoadedUsers = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
      setCurrentPage(0);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  const loadUsers = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;

    if (hasLoadedUsers.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const buildQuery = (columns) => {
        let query = supabase
          .from("profiles")
          .select(columns, { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(currentPage * USER_PAGE_SIZE, (currentPage + 1) * USER_PAGE_SIZE - 1)
          .abortSignal(controller.signal);

        if (debouncedSearchTerm) {
          const search = escapeSearchValue(debouncedSearchTerm);
          query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
        }
        return query;
      };

      let result = await buildQuery(PROFILE_COLUMNS);
      if (result.error && isMissingColumnError(result.error) && !controller.signal.aborted) {
        console.warn("The profiles table has a different column set; retrying with its available fields.");
        result = await buildQuery("*");
      }

      const { data, error, count } = result;
      if (error) throw error;
      if (currentRequestId !== requestId.current) return;

      const profileUsers = (data || [])
        .filter((row) => row.id)
        .map((row) => {
          const lastOnlineDate = row.last_online ? new Date(row.last_online) : null;
          const lastOnlineAt =
            lastOnlineDate && Number.isFinite(lastOnlineDate.getTime())
              ? lastOnlineDate.toISOString()
              : null;
          return {
            ...row,
            _sourceTable: "profiles",
            _idColumn: "id",
            _idValue: row.id,
            full_name: row.full_name || row.email || "Unnamed User",
            email: row.email || "",
            is_active: getAccountIsActive(row),
            presence_user_id: row.auth_user_id || row.id,
            presence_managed: false,
            legacy_is_online: isPresenceRecentlyOnline(lastOnlineAt),
            created_at: row.created_at || new Date().toISOString(),
            last_online_at: lastOnlineAt,
          };
        });

      setUsers(profileUsers);
      setMatchingUserCount(count || 0);
      setSelectedUser((previous) => {
        if (!previous) return null;
        return profileUsers.find((user) => user.id === previous.id) || previous;
      });
      hasLoadedUsers.current = true;
    } catch (error) {
      if (currentRequestId !== requestId.current || controller.signal.aborted) return;
      console.error("Error querying user profiles:", error);
      setLoadError("Unable to load users. Please try again later.");
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [currentPage, debouncedSearchTerm]);

  const loadAccountCounts = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });

      if (error) {
        console.error("Unable to load total user count:", error);
      } else {
        setTotalUserCount(count || 0);
      }
    } catch (error) {
      console.error("Unable to load user account counts:", error);
    }
  }, []);

  const refreshOnlineStatuses = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();
      const { data, error, count } = await supabase
        .from("profiles")
        .select("id, auth_user_id, last_online", { count: "exact" })
        .gte("last_online", cutoff)
        .order("last_online", { ascending: false });

      if (error) {
        console.error("Unable to refresh online user statuses:", error);
        return;
      }

      const profiles = data || [];
      const latestOnlineAt = new Map();
      for (const profile of profiles) {
        if (!profile.last_online) continue;
        latestOnlineAt.set(profile.id, profile.last_online);
        if (profile.auth_user_id) latestOnlineAt.set(profile.auth_user_id, profile.last_online);
      }

      setOnlineCount(count || 0);
      const now = Date.now();
      setUsers((currentUsers) => currentUsers.map((user) => {
        const lastOnline =
          latestOnlineAt.get(user.id) ||
          latestOnlineAt.get(user.presence_user_id) ||
          user.last_online_at;
        const isOnline = isPresenceRecentlyOnline(lastOnline, now);
        if (lastOnline === user.last_online_at && isOnline === user.legacy_is_online) return user;
        return {
          ...user,
          last_online_at: lastOnline,
          legacy_is_online: isOnline,
        };
      }));
    } catch (error) {
      console.error("Unable to refresh online user statuses:", error);
    }
  }, []);

  useEffect(() => {
    const frameId = requestAnimationFrame(loadUsers);
    return () => {
      cancelAnimationFrame(frameId);
      requestController.current?.abort();
    };
  }, [loadUsers]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      loadAccountCounts();
      refreshOnlineStatuses();
    });
    const intervalId = window.setInterval(refreshOnlineStatuses, 60_000);
    return () => {
      cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
    };
  }, [loadAccountCounts, refreshOnlineStatuses]);

  const usersWithPresence = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        connection_count: connectionCounts[user.presence_user_id] || 0,
        is_online: user.presence_managed
          ? (connectionCounts[user.presence_user_id] || 0) > 0
          : user.legacy_is_online,
      })).sort((a, b) => {
        if (a.is_online !== b.is_online) return Number(b.is_online) - Number(a.is_online);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [connectionCounts, users],
  );

  const filteredUsers = useMemo(() => {
    if (statusFilter === "online") {
      return usersWithPresence.filter((u) => u.is_online);
    }
    if (statusFilter === "offline") {
      return usersWithPresence.filter((u) => !u.is_online);
    }
    return usersWithPresence;
  }, [statusFilter, usersWithPresence]);

  const pageCount = Math.max(1, Math.ceil(matchingUserCount / USER_PAGE_SIZE));

  const selectedUserWithPresence = selectedUser
    ? {
        ...selectedUser,
        ...usersWithPresence.find((user) => user.presence_user_id === selectedUser.presence_user_id),
      }
    : null;

  const offlineCount =
    totalUserCount === null || onlineCount === null
      ? null
      : Math.max(0, totalUserCount - onlineCount);

  async function toggleActiveState(user) {
    setActionLoading(true);
    const sourceTable = user._sourceTable || "admins";
    const idColumn = user._idColumn || "id";
    const idValue = user._idValue || user.id;

    const { error } = await supabase
      .from(sourceTable)
      .update({ is_active: !user.is_active })
      .eq(idColumn, idValue);

    if (error) {
      console.error("Error updating user status:", error);
      alert("Could not update user status.");
      setActionLoading(false);
      return;
    }

    await Promise.all([loadUsers(), loadAccountCounts()]);
    setActionLoading(false);
  }

  function confirmDeleteUser(user) {
    setDeleteUserTarget(user);
  }

  async function deleteUser() {
    if (!deleteUserTarget) return;

    setActionLoading(true);

    try {
      const userId = deleteUserTarget.id;

      if (!userId) {
        throw new Error("User ID is missing.");
      }

      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { userId },
      });

      if (error) {
        throw new Error(error.message || "Edge Function failed.");
      }

      if (!data?.success) {
        throw new Error(data?.error || data?.message || "User deletion failed.");
      }

      setSelectedUser(null);
      setDeleteUserTarget(null);
      await Promise.all([loadUsers(), loadAccountCounts()]);
      setActionLoading(false);
      setSuccessMessage("User account deleted successfully.");
    } catch (error) {
      console.error("DELETE USER ERROR:", error);
      alert(`Failed to delete user.\n\n${error?.message || "Unknown error occurred."}`);
      setActionLoading(false);
    }
  }

  function copyToClipboard(text) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  }

  const handleRefreshAll = () => {
    loadUsers();
    loadAccountCounts();
    refreshOnlineStatuses();
  };

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar adminName="Administrator" />

      <main className="relative ml-20 flex max-w-7xl flex-col gap-8 px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Header Hero */}
        <section
          className={`glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-white/80 p-7 shadow-[0_25px_60px_-25px_rgba(14,116,144,0.35)] ring-1 ring-sky-100/90 transition-all duration-700 sm:p-9 ${
            mounted ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
          }`}
        >
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-sky-400/15 via-cyan-400/12 to-indigo-400/10" />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-100 to-cyan-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-sky-800 shadow-sm">
                <FaShieldAlt className="text-sky-600 text-[11px]" />
                Directory Management
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                User Management
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Search profiles, monitor real-time user presence, inspect metadata, and manage active account access.
              </p>
            </div>

            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-sky-200/80 bg-white/80 px-4 py-2.5 text-xs font-bold text-sky-700 shadow-sm transition hover:bg-sky-50 hover:shadow disabled:opacity-50"
            >
              <FaSyncAlt className={`text-xs ${refreshing || loading ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Refreshing..." : "Sync Directory"}</span>
            </button>
          </div>

          {/* Stats Bar */}
          <div className="relative mt-8 grid gap-4 sm:grid-cols-3">
            {/* Total Users */}
            <div className={`stat-card rounded-[1.75rem] bg-gradient-to-br from-sky-600 via-blue-600 to-cyan-500 p-6 text-white shadow-[0_18px_35px_-20px_rgba(37,99,235,0.85)] ring-1 ring-white/30 transition duration-500 ${mounted ? "scale-100" : "scale-95"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-100">Total Users</p>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold text-white">ALL</span>
              </div>
              <p className="mt-4 text-4xl font-extrabold tracking-tight">{totalUserCount ?? "—"}</p>
              <p className="mt-2 text-xs text-sky-100/90">Registered candidate profiles in database</p>
            </div>

            {/* Online Users */}
            <div className={`stat-card rounded-[1.75rem] border border-cyan-100/80 bg-gradient-to-br from-cyan-50/90 via-white to-sky-50/60 p-6 shadow-[0_18px_35px_-22px_rgba(14,116,144,0.4)] ring-1 ring-cyan-200/50 transition duration-500 ${mounted ? "scale-100" : "scale-95"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Online Users</p>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              </div>
              <p className="mt-4 text-4xl font-extrabold tracking-tight text-slate-950">{onlineCount ?? "—"}</p>
              <p className="mt-2 text-xs text-slate-500">Active or connected in last 5 minutes</p>
            </div>

            {/* Offline Users */}
            <div className={`stat-card rounded-[1.75rem] border border-violet-100/80 bg-gradient-to-br from-violet-50/70 via-white to-indigo-50/50 p-6 shadow-[0_18px_35px_-22px_rgba(99,102,241,0.3)] ring-1 ring-violet-200/50 transition duration-500 ${mounted ? "scale-100" : "scale-95"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-800">Offline Users</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">AWAY</span>
              </div>
              <p className="mt-4 text-4xl font-extrabold tracking-tight text-slate-950">{offlineCount ?? "—"}</p>
              <p className="mt-2 text-xs text-slate-500">Not currently detected in active session</p>
            </div>
          </div>
        </section>

        {/* Content Layout: Table & Profile Inspector */}
        <section className="grid gap-7 xl:grid-cols-[1.55fr_1fr]">
          {/* Users Table Card */}
          <div className="glass-card rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.4)] ring-1 ring-sky-100/90 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Candidate Profiles</h2>
                <p className="mt-1 text-xs text-slate-500">Search and select a user to review complete details.</p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full max-w-xs">
                <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 pl-10 pr-9 py-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <FaTimes className="text-xs" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  statusFilter === "all"
                    ? "bg-sky-600 text-white shadow-sm shadow-sky-600/30"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Users ({matchingUserCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("online")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  statusFilter === "online"
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Online ({onlineCount ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("offline")}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  statusFilter === "offline"
                    ? "bg-slate-700 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Offline ({offlineCount ?? 0})
              </button>
            </div>

            {loadError && users.length > 0 && (
              <p role="status" className="mt-4 text-xs font-semibold text-rose-600">
                {loadError} Showing previously cached records.
              </p>
            )}

            {/* Table */}
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-xs text-slate-700">
                  <thead className="bg-slate-50/90 text-left uppercase tracking-wider text-[11px] font-bold text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">Candidate</th>
                      <th className="px-4 py-3.5">Presence</th>
                      <th className="px-4 py-3.5">Registered</th>
                      <th className="px-4 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-14 text-center text-slate-400">
                          <FaSyncAlt className="mx-auto mb-2 animate-spin text-base text-sky-600" />
                          Loading candidate profiles...
                        </td>
                      </tr>
                    ) : loadError && filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-14 text-center text-rose-600">
                          {loadError}
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-14 text-center text-slate-400">
                          No candidate profiles match the current criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => {
                        const isSelected = selectedUser?.id === user.id;
                        return (
                          <tr
                            key={user.id}
                            onClick={() => setSelectedUser(user)}
                            className={`cursor-pointer transition-colors hover:bg-sky-50/60 ${
                              isSelected ? "bg-sky-50/90 ring-1 ring-inset ring-sky-300" : ""
                            }`}
                          >
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-xs font-bold text-white shadow-sm">
                                  {getInitials(user.full_name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-bold text-slate-900">{user.full_name}</p>
                                  <p className="truncate text-[11px] text-slate-500">{user.email || "No email"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                  user.is_online
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${user.is_online ? "bg-emerald-500" : "bg-slate-400"}`} />
                                {user.is_online ? "Online" : "Offline"}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-slate-500">
                              {new Date(user.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedUser(user);
                                }}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                                  isSelected
                                    ? "bg-sky-600 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-sky-100 hover:text-sky-800"
                                }`}
                              >
                                <FaEye className="text-[11px]" /> Inspect
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination Controls */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <p>
                {matchingUserCount === 0
                  ? "No matching users"
                  : `Showing ${currentPage * USER_PAGE_SIZE + 1}–${Math.min(
                      (currentPage + 1) * USER_PAGE_SIZE,
                      matchingUserCount,
                    )} of ${matchingUserCount} users`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
                  disabled={currentPage === 0 || loading}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="font-semibold text-slate-700">Page {currentPage + 1} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(pageCount - 1, page + 1))}
                  disabled={currentPage >= pageCount - 1 || loading}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* Profile Inspector Aside */}
          <aside className="glass-card rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(6,182,212,0.4)] ring-1 ring-cyan-100/90 sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Inspector</p>
                <h3 className="text-lg font-bold text-slate-950">Profile Details</h3>
              </div>
              {selectedUserWithPresence && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    selectedUserWithPresence.is_online
                      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${selectedUserWithPresence.is_online ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                  {selectedUserWithPresence.is_online ? "Active Now" : "Offline"}
                </span>
              )}
            </div>

            {selectedUserWithPresence ? (
              <div className="mt-6 flex flex-col gap-6">
                {/* User Identity Card */}
                <div className="flex items-center gap-4 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/70 p-4 shadow-sm ring-1 ring-sky-200/50">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-xl font-extrabold text-white shadow-md shadow-sky-500/30">
                    {getInitials(selectedUserWithPresence.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-base font-bold text-slate-950">{selectedUserWithPresence.full_name}</h4>
                    <p className="truncate text-xs font-medium text-slate-600">{selectedUserWithPresence.email}</p>
                    <span className="mt-1 inline-block rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-sky-800">
                      Candidate
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="space-y-3 text-xs">
                  {/* User ID with Copy */}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Profile ID</p>
                      <p className="truncate font-mono text-[11px] font-semibold text-slate-700 max-w-[180px]">{selectedUserWithPresence.id}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedUserWithPresence.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
                      title="Copy User ID"
                    >
                      {copiedId ? <FaCheck className="text-emerald-600" /> : <FaCopy />}
                      <span>{copiedId ? "Copied" : "Copy"}</span>
                    </button>
                  </div>

                  {/* Registered At */}
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
                    <FaCalendarAlt className="text-slate-400 text-sm" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account Created</p>
                      <p className="font-semibold text-slate-800">
                        {new Date(selectedUserWithPresence.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Last Online */}
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
                    <FaClock className="text-slate-400 text-sm" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Seen Activity</p>
                      <p className="font-semibold text-slate-800">
                        {selectedUserWithPresence.last_online_at
                          ? new Date(selectedUserWithPresence.last_online_at).toLocaleString()
                          : "No recent activity recorded"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Management Actions */}
                <div className="space-y-2.5 border-t border-slate-100 pt-5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account Controls</p>

                  <button
                    type="button"
                    onClick={() => toggleActiveState(selectedUserWithPresence)}
                    disabled={actionLoading}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold transition shadow-sm ${
                      selectedUserWithPresence.is_active
                        ? "bg-slate-100 text-slate-800 hover:bg-slate-200"
                        : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/30"
                    } disabled:opacity-50`}
                  >
                    {selectedUserWithPresence.is_active ? <FaToggleOff className="text-sm" /> : <FaToggleOn className="text-sm" />}
                    <span>{selectedUserWithPresence.is_active ? "Deactivate Account" : "Activate Account"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => confirmDeleteUser(selectedUserWithPresence)}
                    disabled={actionLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    <FaTrash className="text-xs" />
                    <span>Delete User Account</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <FaUserCircle className="text-2xl" />
                </div>
                <p className="text-xs font-bold text-slate-700">No Candidate Selected</p>
                <p className="mt-1 text-[11px] text-slate-500 max-w-[200px]">
                  Click on any user in the table to inspect details or adjust access privileges.
                </p>
              </div>
            )}
          </aside>
        </section>
      </main>

      {/* Delete User Modal */}
      {deleteUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-slate-200/80 fade-in-up">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <FaTrash className="text-lg" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-950">Delete candidate profile?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              This will permanently remove <strong>{deleteUserTarget.full_name}</strong> from the database including mock interview scores and session history.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteUserTarget(null)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteUser}
                disabled={actionLoading}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/30 transition hover:bg-rose-700 disabled:opacity-60"
              >
                {actionLoading ? "Deleting Profile..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Modal */}
      {successMessage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white p-7 text-center shadow-2xl ring-1 ring-emerald-200 fade-in-up">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <FaCheck className="text-lg" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-950">{successMessage}</h3>
            <button
              type="button"
              onClick={() => setSuccessMessage("")}
              className="mt-6 w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition hover:bg-emerald-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
