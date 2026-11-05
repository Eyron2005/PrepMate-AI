import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaEye,
  FaSearch,
  FaTrash,
  FaToggleOff,
  FaToggleOn,
  FaUserCircle,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";
import { usePresence } from "../contexts/presenceContext";
import { isPresenceRecentlyOnline } from "../services/presence";

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

function UserManagement() {
  const { connectionCounts } = usePresence();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Supabase session error:", sessionError);
      setLoadError("Unable to verify your session. Please sign in again.");
      setLoading(false);
      return;
    }

    const session = sessionData?.session;

    if (!session) {
      setLoadError("Please sign in as an admin to view users.");
      setLoading(false);
      navigate("/");
      return;
    }

    const profileRows = [];
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error("Error querying table profiles:", error);
        setLoadError("Unable to load users. Check the console for details.");
        setUsers([]);
        setSelectedUser(null);
        setLoading(false);
        return;
      }

      const page = data || [];
      profileRows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    const profileUsers = profileRows
      .filter((row) => row.id)
      .map((row) => {
        const lastOnlineValue = row.last_online || null;
        const presenceUserId = row.auth_user_id || row.user_id || row.uid || row.id;
        const lastOnlineDate = lastOnlineValue ? new Date(lastOnlineValue) : null;

        return {
          ...row,
          _sourceTable: "profiles",
          _idColumn: "id",
          _idValue: row.id,
          full_name:
            row.full_name ||
            row.fullname ||
            row.name ||
            row.user_metadata?.full_name ||
            row.email ||
            "Unnamed User",
          email: row.email || row.user_email || row.user_metadata?.email || "",
          is_active: getAccountIsActive(row),
          presence_user_id: presenceUserId,
          presence_managed: false,
          legacy_is_online: isPresenceRecentlyOnline(lastOnlineValue),
          created_at: row.created_at || row.createdAt || row.inserted_at || new Date().toISOString(),
          last_online_at:
            lastOnlineDate && Number.isFinite(lastOnlineDate.getTime())
              ? lastOnlineDate.toISOString()
              : null,
        };
      });

    profileUsers.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    setUsers(profileUsers);
    setSelectedUser((prev) => {
      if (!prev) return null;
      return profileUsers.find((user) => user.presence_user_id === prev.presence_user_id) || null;
    });
    setLoading(false);
  }, [navigate]);

  const refreshOnlineStatuses = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, auth_user_id, last_online");

    if (error) {
      console.error("Unable to refresh user online statuses:", error);
      return;
    }

    const latestStatuses = new Map();
    for (const profile of data || []) {
      const lastOnlineDate = profile.last_online ? new Date(profile.last_online) : null;
      const lastOnlineAt =
        lastOnlineDate && Number.isFinite(lastOnlineDate.getTime())
          ? lastOnlineDate.toISOString()
          : null;
      const status = {
        last_online_at: lastOnlineAt,
        legacy_is_online: isPresenceRecentlyOnline(lastOnlineAt),
      };

      latestStatuses.set(profile.id, status);
      if (profile.auth_user_id) latestStatuses.set(profile.auth_user_id, status);
    }

    setUsers((currentUsers) =>
      currentUsers.map((user) => {
        const latestStatus =
          latestStatuses.get(user.id) || latestStatuses.get(user.presence_user_id);
        return latestStatus ? { ...user, ...latestStatus } : user;
      }),
    );
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => loadUsers());
    return () => cancelAnimationFrame(id);
  }, [loadUsers]);

  useEffect(() => {
    const intervalId = window.setInterval(refreshOnlineStatuses, 15_000);
    return () => window.clearInterval(intervalId);
  }, [refreshOnlineStatuses]);

  const usersWithPresence = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        connection_count: connectionCounts[user.presence_user_id] || 0,
        is_online: user.presence_managed
          ? (connectionCounts[user.presence_user_id] || 0) > 0
          : user.legacy_is_online,
      })),
    [connectionCounts, users],
  );
  const filteredUsers = useMemo(() => {
    const matchingUsers = usersWithPresence.filter((user) => {
      if (!searchTerm.trim()) return true;
      const name = user.full_name?.toLowerCase() || "";
      const email = user.email?.toLowerCase() || "";
      const query = searchTerm.toLowerCase();
      return name.includes(query) || email.includes(query);
    });

    return matchingUsers.sort((a, b) => {
      if (a.is_online !== b.is_online) return Number(b.is_online) - Number(a.is_online);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [searchTerm, usersWithPresence]);

  const selectedUserWithPresence = selectedUser
    ? {
        ...selectedUser,
        ...usersWithPresence.find((user) => user.presence_user_id === selectedUser.presence_user_id),
      }
    : null;
  const onlineCount = usersWithPresence.filter((user) => user.is_online).length;
  const offlineCount = users.length - onlineCount;

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

    await loadUsers();
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
      await loadUsers();
      setActionLoading(false);
      setSuccessMessage("User account deleted successfully.");
    } catch (error) {
      console.error("DELETE USER ERROR:", error);
      alert(`Failed to delete user.\n\n${error?.message || "Unknown error occurred."}`);
      setActionLoading(false);
    }
  }

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar adminName="Administrator" />

      <main className="relative ml-20 flex max-w-7xl flex-col gap-8 px-4 py-8 md:ml-64">
        <section
          className={`glass-card relative overflow-hidden rounded-[2rem] border border-white/70 p-8 shadow-[0_25px_60px_-30px_rgba(14,116,144,0.5)] ring-1 ring-sky-100/80 transition-all duration-700 ${
            mounted ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
          }`}
        >
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-sky-500/12 via-cyan-400/10 to-indigo-400/10" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.32em] text-sky-700">Admin Dashboard</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-950">User Management</h1>
              <p className="mt-3 max-w-2xl text-slate-600">
                View users, search profiles, inspect account details, and manage activation state from one dashboard.
              </p>
            </div>
          </div>

          <div className="relative mt-8 grid gap-4 md:grid-cols-3">
            <div className={`stat-card rounded-[1.75rem] bg-gradient-to-br from-sky-600 via-blue-600 to-cyan-500 p-6 text-white shadow-[0_18px_40px_-20px_rgba(37,99,235,0.9)] transition duration-500 ${mounted ? "scale-100" : "scale-95"}`}>
              <p className="text-sm uppercase tracking-[0.24em] text-sky-100">Total Users</p>
              <p className="mt-4 text-4xl font-semibold">{users.length}</p>
              <p className="mt-2 text-sm text-sky-100/90">All registered users in the system.</p>
            </div>
            <div className={`stat-card rounded-[1.75rem] bg-gradient-to-br from-cyan-100 via-white to-sky-50 p-6 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.8)] ring-1 ring-sky-100 transition duration-500 ${mounted ? "scale-100" : "scale-95"}`}>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Online Users</p>
              <p className="mt-4 text-4xl font-semibold text-slate-950">{onlineCount}</p>
              <p className="mt-2 text-sm text-slate-500">Users currently shown as online.</p>
            </div>
            <div className={`stat-card rounded-[1.75rem] bg-gradient-to-br from-violet-100 via-white to-indigo-50 p-6 shadow-[0_18px_40px_-24px_rgba(99,102,241,0.7)] ring-1 ring-violet-100 transition duration-500 ${mounted ? "scale-100" : "scale-95"}`}>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Offline Users</p>
              <p className="mt-4 text-4xl font-semibold text-slate-950">{offlineCount}</p>
              <p className="mt-2 text-sm text-slate-500">Users not currently shown as online.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="glass-card rounded-[2rem] border border-white/70 p-6 shadow-[0_20px_45px_-30px_rgba(37,99,235,0.7)] ring-1 ring-sky-100/80">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">View Users</h2>
                <p className="mt-2 text-sm text-slate-500">Search users by name or email and select a profile to review details.</p>
              </div>
              <div className="relative max-w-sm">
                <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search users..."
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50/80 px-12 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/80 shadow-inner shadow-slate-100/80">
              <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                <thead className="bg-slate-50/90 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Joined</th>
                    <th className="px-6 py-4">Last Online</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white/70">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-500">Loading users...</td>
                    </tr>
                  ) : loadError ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-rose-600">{loadError}</td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-500">No users found. Try a different search term.</td>
                    </tr>
                  ) : (
                    filteredUsers.map((user, idx) => (
                      <tr
                        key={user.id}
                        style={{ transitionDelay: `${idx * 50}ms` }}
                        className={`transform transition-all duration-500 ease-out hover:bg-slate-50/90 ${mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-100 text-sky-700 shadow-sm">
                              <FaUserCircle />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{user.full_name || "Unnamed User"}</p>
                              <p className="text-xs text-slate-400">{user.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                              user.is_online ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${user.is_online ? "bg-emerald-500" : "bg-slate-400"}`} />
                            {user.is_online
                              ? `Online${user.connection_count > 1 ? ` · ${user.connection_count} connections` : ""}`
                              : "Offline"}
                          </span>
                        </td>
                        <td className="px-6 py-4">{new Date(user.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {user.last_online_at ? new Date(user.last_online_at).toLocaleString() : "Unavailable"}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="inline-flex items-center gap-2 rounded-3xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_22px_-14px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5"
                          >
                            <FaEye /> View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="glass-card rounded-[2rem] border border-white/70 p-8 shadow-[0_20px_45px_-30px_rgba(6,182,212,0.7)] ring-1 ring-cyan-100/80">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">User Profile</p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-950">
                  {selectedUserWithPresence
                    ? selectedUserWithPresence.full_name || selectedUserWithPresence.email
                    : "Select a user"}
                </h2>
              </div>
              {selectedUserWithPresence && (
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${
                    selectedUserWithPresence.is_online ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${selectedUserWithPresence.is_online ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {selectedUserWithPresence.is_online
                    ? `Online${selectedUserWithPresence.connection_count > 1 ? ` · ${selectedUserWithPresence.connection_count} connections` : ""}`
                    : "Offline"}
                </span>
              )}
            </div>

            {selectedUserWithPresence ? (
              <div className="mt-8 grid gap-6">
                <div className="rounded-3xl bg-gradient-to-br from-sky-50 to-cyan-50 p-6 shadow-inner shadow-sky-100">
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Full Name</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{selectedUserWithPresence.full_name || "Unnamed User"}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-slate-50 p-5 shadow-sm ring-1 ring-slate-200">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Account Created</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">{new Date(selectedUserWithPresence.created_at).toLocaleString()}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-5 shadow-sm ring-1 ring-slate-200">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Last Online</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      {selectedUserWithPresence.last_online_at ? new Date(selectedUserWithPresence.last_online_at).toLocaleString() : "Unavailable"}
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl bg-slate-50 p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-400">User ID</p>
                  <p className="mt-3 break-all text-sm text-slate-700">{selectedUserWithPresence.id}</p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => toggleActiveState(selectedUserWithPresence)}
                    disabled={actionLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_15px_24px_-18px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectedUserWithPresence.is_active ? <FaToggleOff /> : <FaToggleOn />}
                    {selectedUserWithPresence.is_active ? "Deactivate Account" : "Activate Account"}
                  </button>
                  <button
                    onClick={() => confirmDeleteUser(selectedUserWithPresence)}
                    disabled={actionLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_15px_24px_-18px_rgba(244,63,94,0.9)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FaTrash /> Delete User
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50/80 p-10 text-center text-slate-500">
                Select a user from the table to view profile details and manage the account.
              </div>
            )}
          </aside>
        </section>
      </main>

      {deleteUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] glass-card border border-white/70 bg-white/90 p-6 shadow-2xl ring-1 ring-slate-200/70 fade-in-up">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Confirm delete</p>
            <h3 className="mt-3 text-2xl font-semibold text-slate-950">Delete this user?</h3>
            <p className="mt-4 text-slate-600">This will permanently delete the user's account and related data. This action cannot be undone.</p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => setDeleteUserTarget(null)}
                className="rounded-3xl border border-slate-300 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteUser}
                disabled={actionLoading}
                className="rounded-3xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

        {successMessage && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4 py-10 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[2rem] glass-card border border-white/70 bg-white/95 p-8 text-center shadow-2xl ring-1 ring-emerald-200/80 fade-in-up">
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-600">Success</p>
              <h3 className="mt-3 text-2xl font-semibold text-slate-950">{successMessage}</h3>
              <button
                type="button"
                onClick={() => setSuccessMessage("")}
                className="mt-6 rounded-3xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                OK
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

export default UserManagement;