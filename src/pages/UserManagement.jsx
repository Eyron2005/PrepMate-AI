import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaEye,
  FaSearch,
  FaUserCircle,
  FaSyncAlt,
  FaCopy,
  FaCheck,
  FaTimes,
  FaShieldAlt,
  FaCalendarAlt,
  FaClock,
  FaBan,
  FaUserCheck,
  FaUserSlash,
  FaExclamationTriangle,
  FaArrowRight,
  FaTrash,
  FaGraduationCap,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";
import { usePresence } from "../contexts/presenceContext";
import { isPresenceRecentlyOnline, ONLINE_THRESHOLD_MS } from "../services/presence";
import {
  getEriClassification,
  fetchStudentEriHistory,
} from "../services/eri";
import EriProgressRing from "../components/EriProgressRing";
import EriHistoryChart from "../components/EriHistoryChart";

const USER_PAGE_SIZE = 50;

function escapeSearchValue(value) {
  return value.replace(/[\\%_,()"]/g, "\\$&");
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
  const navigate = useNavigate();
  const { connectionCounts } = usePresence();
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState("all"); // 'all' | 'active' | 'deactivated'
  const [presenceOnlyOnline, setPresenceOnlyOnline] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [matchingUserCount, setMatchingUserCount] = useState(0);
  const [totalUserCount, setTotalUserCount] = useState(null);
  const [activeUserCount, setActiveUserCount] = useState(null);
  const [deactivatedUserCount, setDeactivatedUserCount] = useState(null);
  const [onlineCount, setOnlineCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Deactivate modal state
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateReason, setDeactivateReason] = useState("Violation of Terms of Service");
  const [deactivateDetails, setDeactivateDetails] = useState("");
  const [deactivateError, setDeactivateError] = useState("");

  // Direct Reactivate modal state
  const [reactivateTarget, setReactivateTarget] = useState(null);
  const [reactivateRemarks, setReactivateRemarks] = useState("");
  const [reactivateError, setReactivateError] = useState("");

  // Permanent Delete modal state
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);

  // Success message modal state
  const [successMessage, setSuccessMessage] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  // Student ERI state
  const [studentEriHistory, setStudentEriHistory] = useState([]);
  const [loadingEriHistory, setLoadingEriHistory] = useState(false);

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
      const pageOffset = currentPage * USER_PAGE_SIZE;

      // 1. Try secure RPC that joins auth.users for reliable email & account status
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_admin_profiles_with_email",
        {
          search_term: debouncedSearchTerm || null,
          status_filter: accountStatusFilter,
          page_limit: USER_PAGE_SIZE,
          page_offset: pageOffset,
        }
      );

      let profileUsers = [];
      let totalCount = 0;

      if (!rpcError && Array.isArray(rpcData)) {
        const { data: countData, error: countError } = await supabase.rpc(
          "get_admin_profiles_count",
          {
            search_term: debouncedSearchTerm || null,
            status_filter: accountStatusFilter,
          }
        );
        totalCount = !countError && countData != null ? Number(countData) : rpcData.length;

        profileUsers = rpcData.map((row) => {
          const lastOnlineDate = row.last_online ? new Date(row.last_online) : null;
          const lastOnlineAt =
            lastOnlineDate && Number.isFinite(lastOnlineDate.getTime())
              ? lastOnlineDate.toISOString()
              : null;
          const status = row.account_status || "active";
          return {
            ...row,
            full_name: row.full_name || row.email || "Unnamed Candidate",
            email: row.email || "",
            account_status: status,
            is_active: status === "active",
            presence_user_id: row.auth_user_id || row.id,
            presence_managed: false,
            legacy_is_online: isPresenceRecentlyOnline(lastOnlineAt),
            created_at: row.created_at || new Date().toISOString(),
            last_online_at: lastOnlineAt,
            latest_eri:
              row.latest_eri !== null && row.latest_eri !== undefined
                ? Number(row.latest_eri)
                : null,
            latest_eri_date: row.latest_eri_date || null,
            completed_assessments_count: Number(row.completed_assessments_count || 0),
          };
        });
      } else {
        // Fallback to direct profiles table query if RPC is temporarily unavailable
        console.warn("Direct query fallback in effect:", rpcError?.message);
        let query = supabase
          .from("profiles")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(pageOffset, pageOffset + USER_PAGE_SIZE - 1)
          .abortSignal(controller.signal);

        if (debouncedSearchTerm) {
          const search = escapeSearchValue(debouncedSearchTerm);
          query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
        }

        if (accountStatusFilter === "active") {
          query = query.or("account_status.is.null,account_status.eq.active");
        } else if (accountStatusFilter === "deactivated") {
          query = query.eq("account_status", "deactivated");
        }

        const { data, count, error } = await query;
        if (error) throw error;

        totalCount = count || 0;
        profileUsers = (data || []).map((row) => {
          const lastOnlineDate = row.last_online ? new Date(row.last_online) : null;
          const lastOnlineAt =
            lastOnlineDate && Number.isFinite(lastOnlineDate.getTime())
              ? lastOnlineDate.toISOString()
              : null;
          const status = row.account_status || "active";
          return {
            ...row,
            full_name: row.full_name || "Unnamed Candidate",
            email: row.email || "",
            account_status: status,
            is_active: status === "active",
            presence_user_id: row.auth_user_id || row.id,
            presence_managed: false,
            legacy_is_online: isPresenceRecentlyOnline(lastOnlineAt),
            created_at: row.created_at || new Date().toISOString(),
            last_online_at: lastOnlineAt,
            latest_eri:
              row.latest_eri !== null && row.latest_eri !== undefined
                ? Number(row.latest_eri)
                : null,
            latest_eri_date: row.latest_eri_date || null,
            completed_assessments_count: Number(row.completed_assessments_count || 0),
          };
        });
      }

      if (currentRequestId !== requestId.current) return;

      setUsers(profileUsers);
      setMatchingUserCount(totalCount);
      setSelectedUser((previous) => {
        if (!previous) return null;
        return profileUsers.find((user) => user.id === previous.id) || previous;
      });
      hasLoadedUsers.current = true;
    } catch (error) {
      if (currentRequestId !== requestId.current || controller.signal.aborted) return;
      console.error("Error querying user profiles:", error);
      setLoadError("Unable to load candidates. Please try again later.");
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [currentPage, debouncedSearchTerm, accountStatusFilter]);

  const loadAccountCounts = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_admin_account_status_counts");
      if (!error && Array.isArray(data) && data[0]) {
        setTotalUserCount(Number(data[0].total_count) || 0);
        setActiveUserCount(Number(data[0].active_count) || 0);
        setDeactivatedUserCount(Number(data[0].deactivated_count) || 0);
      } else {
        const { count, error: countErr } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true });
        if (!countErr) {
          setTotalUserCount(count || 0);
        }
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
      setUsers((currentUsers) =>
        currentUsers.map((user) => {
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
        })
      );
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

  // Load selected candidate's detailed ERI assessment history
  useEffect(() => {
    let isMounted = true;

    const frameId = requestAnimationFrame(async () => {
      if (!selectedUser?.id) {
        if (isMounted) {
          setStudentEriHistory([]);
          setLoadingEriHistory(false);
        }
        return;
      }

      setLoadingEriHistory(true);
      try {
        const history = await fetchStudentEriHistory(selectedUser.id);
        if (isMounted) {
          setStudentEriHistory(history || []);
        }
      } catch (err) {
        console.error("Failed to load student ERI assessment history:", err);
        if (isMounted) setStudentEriHistory([]);
      } finally {
        if (isMounted) setLoadingEriHistory(false);
      }
    });

    return () => {
      isMounted = false;
      cancelAnimationFrame(frameId);
    };
  }, [selectedUser?.id]);

  const usersWithPresence = useMemo(
    () =>
      users
        .map((user) => ({
          ...user,
          connection_count: connectionCounts[user.presence_user_id] || 0,
          is_online: user.presence_managed
            ? (connectionCounts[user.presence_user_id] || 0) > 0
            : user.legacy_is_online,
        }))
        .sort((a, b) => {
          if (a.is_online !== b.is_online) return Number(b.is_online) - Number(a.is_online);
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
    [connectionCounts, users]
  );

  const displayedUsers = useMemo(() => {
    if (!presenceOnlyOnline) return usersWithPresence;
    return usersWithPresence.filter((u) => u.is_online);
  }, [presenceOnlyOnline, usersWithPresence]);

  const pageCount = Math.max(1, Math.ceil(matchingUserCount / USER_PAGE_SIZE));

  const selectedUserWithPresence = selectedUser
    ? {
        ...selectedUser,
        ...usersWithPresence.find((u) => u.id === selectedUser.id),
      }
    : null;

  // Open Deactivate Confirmation Modal
  function initiateDeactivate(user) {
    setDeactivateTarget(user);
    setDeactivateReason("Violation of Terms of Service");
    setDeactivateDetails("");
    setDeactivateError("");
  }

  // Open Direct Reactivate Confirmation Modal
  function initiateReactivate(user) {
    setReactivateTarget(user);
    setReactivateRemarks("");
    setReactivateError("");
  }

  // Execute Deactivation via Backend Edge Function
  async function handleConfirmDeactivation() {
    if (!deactivateTarget) return;

    if (!deactivateDetails.trim()) {
      setDeactivateError("Please provide administrative remarks or details for this deactivation.");
      return;
    }

    setActionLoading(true);
    setDeactivateError("");

    try {
      const userId = deactivateTarget.id;
      const { data, error } = await supabase.functions.invoke("deactivate-account", {
        body: {
          userId,
          reason: deactivateReason,
          details: deactivateDetails.trim(),
        },
      });

      if (error) {
        throw new Error(error.message || "Deactivation service call failed.");
      }

      if (!data?.success) {
        throw new Error(data?.error || data?.message || "Student deactivation failed.");
      }

      // Close modal and notify
      setDeactivateTarget(null);
      setDeactivateReason("Violation of Terms of Service");
      setDeactivateDetails("");
      setSuccessMessage("Student account successfully deactivated.");

      // Refresh directory and counts immediately
      await Promise.all([loadUsers(), loadAccountCounts()]);
    } catch (err) {
      console.error("DEACTIVATE ERROR:", err);
      setDeactivateError(err.message || "Failed to deactivate student account.");
    } finally {
      setActionLoading(false);
    }
  }

  // Execute Direct Administrator Reactivation via Backend Edge Function
  async function handleConfirmReactivation() {
    if (!reactivateTarget) return;

    setActionLoading(true);
    setReactivateError("");

    try {
      const userId = reactivateTarget.id;
      const { data, error } = await supabase.functions.invoke("admin-reactivate-account", {
        body: {
          userId,
          adminRemarks: reactivateRemarks.trim(),
        },
      });

      if (error) {
        throw new Error(error.message || "Reactivation service call failed.");
      }

      if (!data?.success) {
        throw new Error(data?.error || data?.message || "Student reactivation failed.");
      }

      // Close modal and notify
      setReactivateTarget(null);
      setReactivateRemarks("");
      setSuccessMessage("Student account successfully reactivated.");

      // Refresh directory and counts immediately
      await Promise.all([loadUsers(), loadAccountCounts()]);
    } catch (err) {
      console.error("REACTIVATE ERROR:", err);
      setReactivateError(err.message || "Failed to reactivate student account.");
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Permanent Delete User (Fallback administrative purge)
  async function handleDeleteUser() {
    if (!deleteUserTarget) return;

    setActionLoading(true);
    try {
      const userId = deleteUserTarget.id;
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { userId },
      });

      if (error) {
        throw new Error(error.message || "Delete service call failed.");
      }

      if (!data?.success) {
        throw new Error(data?.error || data?.message || "User deletion failed.");
      }

      setSelectedUser(null);
      setDeleteUserTarget(null);
      await Promise.all([loadUsers(), loadAccountCounts()]);
      setSuccessMessage("User account deleted successfully.");
    } catch (err) {
      console.error("DELETE USER ERROR:", err);
      alert(`Failed to delete user.\n\n${err?.message || "Unknown error occurred."}`);
    } finally {
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
                Search candidate profiles, monitor real-time presence, inspect student records, and securely manage account activation status.
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
          <div className="relative mt-8 grid gap-4 sm:grid-cols-4">
            {/* Total Students */}
            <div
              className={`stat-card rounded-[1.75rem] bg-gradient-to-br from-sky-600 via-blue-600 to-cyan-500 p-5 text-white shadow-[0_18px_35px_-20px_rgba(37,99,235,0.85)] ring-1 ring-white/30 transition duration-500 ${
                mounted ? "scale-100" : "scale-95"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-100">Total Students</p>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold text-white">ALL</span>
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight">{totalUserCount ?? "—"}</p>
              <p className="mt-1.5 text-xs text-sky-100/90">Registered candidates in system</p>
            </div>

            {/* Active Accounts */}
            <div
              className={`stat-card rounded-[1.75rem] border border-emerald-100/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/60 p-5 shadow-[0_18px_35px_-22px_rgba(16,185,129,0.35)] ring-1 ring-emerald-200/50 transition duration-500 ${
                mounted ? "scale-100" : "scale-95"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-800">Active</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                  <FaUserCheck className="text-[10px]" /> OK
                </span>
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{activeUserCount ?? "—"}</p>
              <p className="mt-1.5 text-xs text-slate-500">Unrestricted app login access</p>
            </div>

            {/* Deactivated Accounts */}
            <div
              className={`stat-card rounded-[1.75rem] border border-rose-100/80 bg-gradient-to-br from-rose-50/70 via-white to-amber-50/50 p-5 shadow-[0_18px_35px_-22px_rgba(225,29,72,0.3)] ring-1 ring-rose-200/50 transition duration-500 ${
                mounted ? "scale-100" : "scale-95"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-800">Deactivated</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-800">
                  <FaUserSlash className="text-[10px]" /> HOLD
                </span>
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{deactivatedUserCount ?? "—"}</p>
              <p className="mt-1.5 text-xs text-slate-500">Banned from signing in</p>
            </div>

            {/* Realtime Online */}
            <div
              className={`stat-card rounded-[1.75rem] border border-cyan-100/80 bg-gradient-to-br from-cyan-50/90 via-white to-sky-50/60 p-5 shadow-[0_18px_35px_-22px_rgba(14,116,144,0.3)] ring-1 ring-cyan-200/50 transition duration-500 ${
                mounted ? "scale-100" : "scale-95"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Online Now</p>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{onlineCount ?? "—"}</p>
              <p className="mt-1.5 text-xs text-slate-500">Active in the last 5 minutes</p>
            </div>
          </div>
        </section>

        {/* Content Layout: Table & Profile Inspector */}
        <section className="grid gap-7 xl:grid-cols-[1.55fr_1fr]">
          {/* Candidates Table Card */}
          <div className="glass-card rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.4)] ring-1 ring-sky-100/90 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Student Directory</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Select a student profile to inspect metadata or modify account status.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full max-w-xs">
                <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by student name or email..."
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

            {/* Filter Tabs: Account Status */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAccountStatusFilter("all");
                    setCurrentPage(0);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    accountStatusFilter === "all"
                      ? "bg-sky-600 text-white shadow-sm shadow-sky-600/30"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  All Students {totalUserCount !== null && `(${totalUserCount})`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountStatusFilter("active");
                    setCurrentPage(0);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    accountStatusFilter === "active"
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Active {activeUserCount !== null && `(${activeUserCount})`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountStatusFilter("deactivated");
                    setCurrentPage(0);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    accountStatusFilter === "deactivated"
                      ? "bg-rose-600 text-white shadow-sm shadow-rose-600/30"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  Deactivated {deactivatedUserCount !== null && `(${deactivatedUserCount})`}
                </button>
              </div>

              {/* Online Only Filter Toggle */}
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 select-none">
                <input
                  type="checkbox"
                  checked={presenceOnlyOnline}
                  onChange={(e) => setPresenceOnlyOnline(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>Online Only ({onlineCount ?? 0})</span>
              </label>
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
                      <th className="px-4 py-3.5">Account Status</th>
                      <th className="px-4 py-3.5">Employment Readiness (ERI)</th>
                      <th className="px-4 py-3.5">Presence</th>
                      <th className="px-4 py-3.5">Registered</th>
                      <th className="px-4 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-14 text-center text-slate-400">
                          <FaSyncAlt className="mx-auto mb-2 animate-spin text-base text-sky-600" />
                          Loading candidate profiles...
                        </td>
                      </tr>
                    ) : loadError && displayedUsers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-14 text-center text-rose-600">
                          {loadError}
                        </td>
                      </tr>
                    ) : displayedUsers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-14 text-center text-slate-400">
                          No student accounts match the selected criteria.
                        </td>
                      </tr>
                    ) : (
                      displayedUsers.map((user) => {
                        const isSelected = selectedUser?.id === user.id;
                        const isDeactivated = user.account_status === "deactivated";

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
                                <div
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm ${
                                    isDeactivated
                                      ? "bg-gradient-to-br from-slate-400 to-slate-600"
                                      : "bg-gradient-to-br from-sky-500 to-blue-600"
                                  }`}
                                >
                                  {getInitials(user.full_name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-bold text-slate-900">{user.full_name}</p>
                                  <p className="truncate text-[11px] text-slate-500">
                                    {user.email || "No email on record"}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Authoritative Account Status Badge */}
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                  isDeactivated
                                    ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                                    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    isDeactivated ? "bg-rose-500" : "bg-emerald-500"
                                  }`}
                                />
                                {isDeactivated ? "Deactivated" : "Active"}
                              </span>
                            </td>

                            {/* Employment Readiness Index (ERI) */}
                            <td className="px-4 py-3.5">
                              {user.latest_eri !== null && user.latest_eri !== undefined ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-slate-900 text-xs">
                                      {user.latest_eri}%
                                    </span>
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                                        getEriClassification(user.latest_eri).badgeClass
                                      }`}
                                    >
                                      {getEriClassification(user.latest_eri).label}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-400">
                                    {user.completed_assessments_count > 0
                                      ? `${user.completed_assessments_count} session${
                                          user.completed_assessments_count > 1 ? "s" : ""
                                        }`
                                      : "Latest evaluation"}
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                                  Not Yet Available
                                </span>
                              )}
                            </td>

                            {/* Presence Status */}
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                  user.is_online
                                    ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    user.is_online ? "bg-cyan-500 animate-pulse" : "bg-slate-400"
                                  }`}
                                />
                                {user.is_online ? "Online" : "Offline"}
                              </span>
                            </td>

                            <td className="px-4 py-3.5 text-slate-500">
                              {new Date(user.created_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </td>

                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isDeactivated && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      initiateReactivate(user);
                                    }}
                                    disabled={actionLoading}
                                    title="Reactivate Student Account"
                                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100 disabled:opacity-50"
                                  >
                                    <FaUserCheck className="text-[11px]" /> Reactivate
                                  </button>
                                )}
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
                              </div>
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
                  ? "No matching students"
                  : `Showing ${currentPage * USER_PAGE_SIZE + 1}–${Math.min(
                      (currentPage + 1) * USER_PAGE_SIZE,
                      matchingUserCount
                    )} of ${matchingUserCount} students`}
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
                <span className="font-semibold text-slate-700">
                  Page {currentPage + 1} of {pageCount}
                </span>
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
                <h3 className="text-lg font-bold text-slate-950">Student Details</h3>
              </div>
              {selectedUserWithPresence && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    selectedUserWithPresence.is_online
                      ? "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-300"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      selectedUserWithPresence.is_online ? "bg-cyan-500 animate-pulse" : "bg-slate-400"
                    }`}
                  />
                  {selectedUserWithPresence.is_online ? "Active Now" : "Offline"}
                </span>
              )}
            </div>

            {selectedUserWithPresence ? (
              <div className="mt-6 flex flex-col gap-6">
                {/* User Identity Card */}
                <div className="flex items-center gap-4 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/70 p-4 shadow-sm ring-1 ring-sky-200/50">
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold text-white shadow-md ${
                      selectedUserWithPresence.account_status === "deactivated"
                        ? "bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-500/20"
                        : "bg-gradient-to-br from-sky-500 to-blue-600 shadow-sky-500/30"
                    }`}
                  >
                    {getInitials(selectedUserWithPresence.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-base font-bold text-slate-950">
                      {selectedUserWithPresence.full_name}
                    </h4>
                    <p className="truncate text-xs font-medium text-slate-600">
                      {selectedUserWithPresence.email || "No email on record"}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="inline-block rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-sky-800">
                        Student
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                          selectedUserWithPresence.account_status === "deactivated"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            selectedUserWithPresence.account_status === "deactivated"
                              ? "bg-rose-500"
                              : "bg-emerald-500"
                          }`}
                        />
                        {selectedUserWithPresence.account_status === "deactivated"
                          ? "Deactivated"
                          : "Active"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="space-y-3 text-xs">
                  {/* User ID with Copy */}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Profile Identifier
                      </p>
                      <p className="truncate font-mono text-[11px] font-semibold text-slate-700 max-w-[180px]">
                        {selectedUserWithPresence.id}
                      </p>
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
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Account Created
                      </p>
                      <p className="font-semibold text-slate-800">
                        {new Date(selectedUserWithPresence.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Last Online */}
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
                    <FaClock className="text-slate-400 text-sm" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Last Seen Activity
                      </p>
                      <p className="font-semibold text-slate-800">
                        {selectedUserWithPresence.last_online_at
                          ? new Date(selectedUserWithPresence.last_online_at).toLocaleString()
                          : "No recent activity recorded"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Employment Readiness Index (ERI) Section */}
                <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/70 via-white to-cyan-50/60 p-4 shadow-sm ring-1 ring-sky-200/50">
                  <div className="flex items-center justify-between border-b border-sky-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm shadow-sky-600/30">
                        <FaGraduationCap className="text-xs" />
                      </span>
                      <div>
                        <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                          Employment Readiness (ERI)
                        </h5>
                        <p className="text-[10px] text-slate-500">
                          Multimodal Mock Interview Index
                        </p>
                      </div>
                    </div>
                    {selectedUserWithPresence.latest_eri !== null && selectedUserWithPresence.latest_eri !== undefined ? (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ring-1 ${
                          getEriClassification(selectedUserWithPresence.latest_eri).badgeClass
                        }`}
                      >
                        {getEriClassification(selectedUserWithPresence.latest_eri).label}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        Pending Assessment
                      </span>
                    )}
                  </div>

                  {selectedUserWithPresence.latest_eri !== null && selectedUserWithPresence.latest_eri !== undefined ? (
                    <div className="mt-4 space-y-4">
                      {/* Metric Ring & Quick Highlights */}
                      <div className="flex items-center justify-around gap-4 rounded-xl bg-white/80 p-3 ring-1 ring-slate-100">
                        <EriProgressRing
                          score={selectedUserWithPresence.latest_eri}
                          size={88}
                          strokeWidth={7}
                          showLabel={false}
                          classification={getEriClassification(selectedUserWithPresence.latest_eri)}
                        />
                        <div className="flex-1 space-y-2 text-xs">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Latest Assessment
                            </span>
                            <p className="font-semibold text-slate-800">
                              {selectedUserWithPresence.latest_eri_date
                                ? new Date(selectedUserWithPresence.latest_eri_date).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : "Recent"}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Completed Evaluations
                            </span>
                            <p className="font-semibold text-slate-800">
                              {selectedUserWithPresence.completed_assessments_count || studentEriHistory.length || 1} interview session(s)
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* ERI History Trend Chart & Chronological List */}
                      {loadingEriHistory ? (
                        <div className="rounded-2xl border border-slate-100 bg-white/70 p-6 text-center text-xs text-slate-400">
                          <FaSyncAlt className="mx-auto mb-1 animate-spin text-sm text-sky-600" />
                          Loading historical assessments...
                        </div>
                      ) : (
                        <EriHistoryChart history={studentEriHistory} />
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white/60 p-4 text-center">
                      <p className="text-xs font-bold text-slate-700">Not Yet Available</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        This student has not completed any mock interview evaluations on PrepMate AI yet.
                      </p>
                    </div>
                  )}
                </div>

                {/* Account Status Information Card if Deactivated */}
                {selectedUserWithPresence.account_status === "deactivated" ? (
                  <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50/90 via-white to-amber-50/60 p-4 ring-1 ring-rose-300/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FaBan className="text-rose-600 text-base" />
                        <h5 className="font-bold text-rose-950 text-xs uppercase tracking-wider">
                          Account Suspended
                        </h5>
                      </div>
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-rose-800">
                        Deactivated
                      </span>
                    </div>

                    <div className="mt-3 space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                          Deactivation Reason:
                        </span>
                        <p className="font-semibold text-rose-900">
                          {selectedUserWithPresence.deactivation_reason || "Administrative Hold"}
                        </p>
                      </div>
                      {selectedUserWithPresence.deactivation_details && (
                        <div>
                          <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                            Administrative Remarks:
                          </span>
                          <p className="text-slate-700 italic">
                            &ldquo;{selectedUserWithPresence.deactivation_details}&rdquo;
                          </p>
                        </div>
                      )}
                      {selectedUserWithPresence.deactivated_at && (
                        <div>
                          <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                            Deactivated On:
                          </span>
                          <p className="font-medium text-slate-600">
                            {new Date(selectedUserWithPresence.deactivated_at).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Account Controls for Deactivated Student */}
                    <div className="mt-5 border-t border-rose-100 pt-4 space-y-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Account Access Controls
                      </p>

                      {/* REACTIVATE ACCOUNT BUTTON - Direct Administrator Reactivation */}
                      <button
                        type="button"
                        onClick={() => initiateReactivate(selectedUserWithPresence)}
                        disabled={actionLoading}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                      >
                        <FaUserCheck className="text-sm" />
                        <span>Reactivate Account</span>
                      </button>

                      {/* View Reactivation Requests Link */}
                      <button
                        type="button"
                        onClick={() => navigate("/reactivation-requests")}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
                      >
                        <span>View Reactivation Requests</span>
                        <FaArrowRight className="text-[10px]" />
                      </button>

                      {/* Optional Permanent Delete (Purge) */}
                      <button
                        type="button"
                        onClick={() => setDeleteUserTarget(selectedUserWithPresence)}
                        disabled={actionLoading}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-[11px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                      >
                        <FaTrash className="text-[10px]" />
                        <span>Permanent Delete (Purge)</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Active Account Controls */
                  <div className="space-y-2.5 border-t border-slate-100 pt-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Account Access Controls
                    </p>

                    {/* DEACTIVATE ACCOUNT BUTTON - invokes deactivate-account Edge Function */}
                    <button
                      type="button"
                      onClick={() => initiateDeactivate(selectedUserWithPresence)}
                      disabled={actionLoading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-50"
                    >
                      <FaBan className="text-sm" />
                      <span>Deactivate Account</span>
                    </button>

                    {/* Optional Permanent Delete (for testing or complete cleanup) */}
                    <button
                      type="button"
                      onClick={() => setDeleteUserTarget(selectedUserWithPresence)}
                      disabled={actionLoading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 py-2.5 text-[11px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                    >
                      <FaTrash className="text-[10px]" />
                      <span>Permanent Delete (Purge)</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <FaUserCircle className="text-2xl" />
                </div>
                <p className="text-xs font-bold text-slate-700">No Candidate Selected</p>
                <p className="mt-1 text-[11px] text-slate-500 max-w-[200px]">
                  Click on any candidate row in the table to inspect details or manage access.
                </p>
              </div>
            )}
          </aside>
        </section>
      </main>

      {/* Deactivate Student Account Confirmation Modal */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-rose-200/80">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <FaExclamationTriangle className="text-xl" />
            </div>

            <h3 className="mt-4 text-2xl font-extrabold text-slate-950">
              Deactivate Student Account
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
              Are you sure you want to deactivate this student&apos;s PrepMate AI account? The student will lose access to the application until an administrator approves a reactivation request.
            </p>

            {/* Target Information Card */}
            <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50/60 p-4 ring-1 ring-rose-200/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Student Name
                  </p>
                  <p className="font-bold text-slate-900 truncate">{deactivateTarget.full_name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Registered Email
                  </p>
                  <p className="font-semibold text-slate-700 truncate">
                    {deactivateTarget.email || "No email on record"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Current Status
                  </p>
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Profile Identifier
                  </p>
                  <p className="font-mono text-[11px] text-slate-500 truncate">{deactivateTarget.id}</p>
                </div>
              </div>
            </div>

            {/* Deactivation Reason & Remarks Form */}
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800">
                  Deactivation Reason <span className="text-rose-600">*</span>
                </label>
                <select
                  value={deactivateReason}
                  onChange={(e) => setDeactivateReason(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                >
                  <option value="Violation of Terms of Service">Violation of Terms of Service</option>
                  <option value="Academic Integrity / Policy Violation">
                    Academic Integrity / Policy Violation
                  </option>
                  <option value="Suspicious or Unauthorized Activity">
                    Suspicious or Unauthorized Activity
                  </option>
                  <option value="Administrative Disciplinary Hold">
                    Administrative Disciplinary Hold
                  </option>
                  <option value="Student Voluntary Request">Student Voluntary Request</option>
                  <option value="Other">Other Reason (describe below)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800">
                  Administrative Remarks & Notes <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={3}
                  value={deactivateDetails}
                  onChange={(e) => setDeactivateDetails(e.target.value)}
                  placeholder="Provide detailed context or explanation for why this student account is being deactivated..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              {deactivateError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-600">
                  {deactivateError}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDeactivateTarget(null);
                  setDeactivateReason("Violation of Terms of Service");
                  setDeactivateDetails("");
                  setDeactivateError("");
                }}
                disabled={actionLoading}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivation}
                disabled={actionLoading || !deactivateDetails.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/30 transition hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoading ? (
                  <>
                    <FaSyncAlt className="animate-spin text-xs" />
                    <span>Deactivating...</span>
                  </>
                ) : (
                  <>
                    <FaBan className="text-xs" />
                    <span>Confirm Deactivation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate Student Account Confirmation Modal (Direct Admin Reactivation) */}
      {reactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-emerald-200/80">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <FaUserCheck className="text-xl" />
            </div>

            <h3 className="mt-4 text-2xl font-extrabold text-slate-950">
              Reactivate Student Account
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
              Are you sure you want to reactivate this student&apos;s account? This will restore the student&apos;s access to PrepMate AI even if they have not submitted a reactivation request.
            </p>

            {/* Target Information Card */}
            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 ring-1 ring-emerald-200/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Student Name
                  </p>
                  <p className="font-bold text-slate-900 truncate">{reactivateTarget.full_name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Registered Email
                  </p>
                  <p className="font-semibold text-slate-700 truncate">
                    {reactivateTarget.email || "No email on record"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Current Status
                  </p>
                  <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Deactivated
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Profile Identifier
                  </p>
                  <p className="font-mono text-[11px] text-slate-500 truncate">{reactivateTarget.id}</p>
                </div>
              </div>
            </div>

            {/* Optional Administrative Remarks Form */}
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800">
                  Administrative Remarks <span className="font-normal text-slate-400">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={reactivateRemarks}
                  onChange={(e) => setReactivateRemarks(e.target.value)}
                  placeholder="e.g. Issue resolved with administration, direct verification completed, disciplinary hold lifted..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  These remarks will be recorded in the audit log and attached to any pending request as the resolution rationale.
                </p>
              </div>

              {reactivateError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-600">
                  {reactivateError}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setReactivateTarget(null);
                  setReactivateRemarks("");
                  setReactivateError("");
                }}
                disabled={actionLoading}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReactivation}
                disabled={actionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
              >
                {actionLoading ? (
                  <>
                    <FaSyncAlt className="animate-spin text-xs" />
                    <span>Reactivating...</span>
                  </>
                ) : (
                  <>
                    <FaUserCheck className="text-xs" />
                    <span>Confirm Reactivation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal (Purge) */}
      {deleteUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-slate-200/80">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <FaTrash className="text-lg" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-950">
              Permanently purge candidate record?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              This will permanently delete <strong>{deleteUserTarget.full_name}</strong> and all associated interview sessions. (Note: To temporarily suspend access without losing data, use <em>Deactivate Account</em> instead).
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
                onClick={handleDeleteUser}
                disabled={actionLoading}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/30 transition hover:bg-rose-700 disabled:opacity-60"
              >
                {actionLoading ? "Purging..." : "Confirm Purge"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Modal */}
      {successMessage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white p-7 text-center shadow-2xl ring-1 ring-emerald-200">
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
