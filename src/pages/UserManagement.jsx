import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaEye,
  FaSearch,
  FaTrash,
  FaToggleOff,
  FaToggleOn,
  FaUserCircle,
} from "react-icons/fa";
import AdminTopNav from "../components/AdminTopNav";
import { supabase } from "../services/supabase";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

function UserManagement() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  async function loadUsers() {
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

    const currentUserIdValue = session.user.id;
    setCurrentUserId(currentUserIdValue);

    const { data: adminData, error: adminError } = await supabase
      .from("admins")
      .select("id")
      .eq("id", currentUserIdValue)
      .single();

    if (adminError) {
      console.error("Admin verification error:", adminError);
      setLoadError("Unable to verify admin access. Check your Supabase configuration.");
      setLoading(false);
      return;
    }

    if (!adminData) {
      console.warn("Signed in user is not in admins table:", session.user.id);
      setLoadError("You must be an admin to view user profiles.");
      setLoading(false);
      return;
    }

    const sources = [
      { table: "profiles", select: "*" },
      { table: "admins", select: "*" },
    ];

    const allRows = [];
    let lastError = null;
    let anySourceSucceeded = false;

    for (const source of sources) {
      try {
        const { data, error } = await supabase.from(source.table).select(source.select);
        if (error) {
          lastError = error;
          continue;
        }

        anySourceSucceeded = true;

        if (Array.isArray(data) && data.length > 0) {
          const normalized = data
            .map((row) => {
              const idColumn = row.id ? "id" : row.user_id ? "user_id" : row.uid ? "uid" : null;
              const idValue = idColumn ? row[idColumn] : null;

              if (!idValue) return null;

              const activeValue =
                row.is_active ??
                row.active ??
                (typeof row.status === "string" ? row.status.toLowerCase() === "active" : false);

              const lastOnlineValue =
                row.last_online ||
                row.last_seen ||
                row.last_active ||
                row.last_active_at ||
                row.updated_at ||
                row.last_sign_in_at ||
                row.last_sign_in ||
                row.sign_in_at ||
                null;

              const isOnline = lastOnlineValue
                ? Date.now() - new Date(lastOnlineValue).getTime() < ONLINE_THRESHOLD_MS
                : false;

              const profileAuthUserId = row.auth_user_id || row.user_id || row.uid || null;
              const shouldSkipCurrent =
                currentUserIdValue &&
                (idValue === currentUserIdValue || profileAuthUserId === currentUserIdValue);

              if (shouldSkipCurrent) return null;

              return {
                ...row,
                _sourceTable: source.table,
                _idColumn: idColumn,
                _idValue: idValue,
                id: idValue,
                full_name:
                  row.full_name ||
                  row.fullname ||
                  row.name ||
                  row.user_metadata?.full_name ||
                  row.email ||
                  "Unnamed User",
                email: row.email || row.user_email || row.user_metadata?.email || "",
                is_active: Boolean(activeValue),
                is_online: isOnline,
                created_at: row.created_at || row.createdAt || row.inserted_at || new Date().toISOString(),
                last_online_at: lastOnlineValue ? new Date(lastOnlineValue).toISOString() : null,
              };
            })
            .filter(Boolean);

          allRows.push(...normalized);
        }
      } catch (err) {
        lastError = err;
        console.error(`Error querying table ${source.table}:`, err?.message || err);
      }
    }

    if (!anySourceSucceeded) {
      console.error("All user table queries failed:", lastError);
      setLoadError("Unable to load users. Check the console for details.");
      setUsers([]);
      setSelectedUser(null);
      setLoading(false);
      return;
    }

    if (allRows.length === 0) {
      setLoadError(
        "No profiles were returned from Supabase. This is often caused by Row Level Security policies on the profiles table."
      );
      setUsers([]);
      setSelectedUser(null);
      setLoading(false);
      return;
    }

    const deduped = Object.values(
      allRows.reduce((acc, row) => {
        if (!row.id) return acc;
        if (!acc[row.id] || acc[row.id]._sourceTable === "users") {
          acc[row.id] = row;
        }
        return acc;
      }, {})
    );

    const currentUserEmail = session?.user?.email?.toLowerCase();
    const filteredDeduped = currentUserIdValue
      ? deduped.filter((row) => {
          const authUserId = row.auth_user_id || row.user_id || row.uid || null;
          const rowEmail = (row.email || row.user_email || row.user_metadata?.email || "").toLowerCase();
          return (
            row.id !== currentUserIdValue &&
            authUserId !== currentUserIdValue &&
            rowEmail !== currentUserEmail
          );
        })
      : deduped;

    filteredDeduped.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    setUsers(filteredDeduped);
    setSelectedUser((prev) => {
      if (!prev) return null;
      return deduped.find((user) => user.id === prev.id) || null;
    });
    setLoading(false);
  }

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    return users.filter((user) => {
      const name = user.full_name?.toLowerCase() || "";
      const email = user.email?.toLowerCase() || "";
      const query = searchTerm.toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [searchTerm, users]);

  const activeCount = users.filter((user) => user.is_active).length;
  const inactiveCount = users.length - activeCount;

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

      alert("User account deleted successfully.");
      setSelectedUser(null);
      setDeleteUserTarget(null);
      await loadUsers();
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

      <AdminTopNav adminName="Administrator" />

      <main className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8">
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
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Active Accounts</p>
              <p className="mt-4 text-4xl font-semibold text-slate-950">{activeCount}</p>
              <p className="mt-2 text-sm text-slate-500">Users with an active account.</p>
            </div>
            <div className={`stat-card rounded-[1.75rem] bg-gradient-to-br from-violet-100 via-white to-indigo-50 p-6 shadow-[0_18px_40px_-24px_rgba(99,102,241,0.7)] ring-1 ring-violet-100 transition duration-500 ${mounted ? "scale-100" : "scale-95"}`}>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Inactive Accounts</p>
              <p className="mt-4 text-4xl font-semibold text-slate-950">{inactiveCount}</p>
              <p className="mt-2 text-sm text-slate-500">Users that are temporarily disabled.</p>
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
                            {user.is_online ? "Online" : "Offline"}
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
                  {selectedUser ? selectedUser.full_name || selectedUser.email : "Select a user"}
                </h2>
              </div>
              {selectedUser && (
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${
                    selectedUser.is_online ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${selectedUser.is_online ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {selectedUser.is_online ? "Online" : "Offline"}
                </span>
              )}
            </div>

            {selectedUser ? (
              <div className="mt-8 grid gap-6">
                <div className="rounded-3xl bg-gradient-to-br from-sky-50 to-cyan-50 p-6 shadow-inner shadow-sky-100">
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Full Name</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{selectedUser.full_name || "Unnamed User"}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-slate-50 p-5 shadow-sm ring-1 ring-slate-200">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Account Created</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">{new Date(selectedUser.created_at).toLocaleString()}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-5 shadow-sm ring-1 ring-slate-200">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Last Online</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      {selectedUser.last_online_at ? new Date(selectedUser.last_online_at).toLocaleString() : "Unavailable"}
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl bg-slate-50 p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-400">User ID</p>
                  <p className="mt-3 break-all text-sm text-slate-700">{selectedUser.id}</p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => toggleActiveState(selectedUser)}
                    disabled={actionLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_15px_24px_-18px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectedUser.is_active ? <FaToggleOff /> : <FaToggleOn />}
                    {selectedUser.is_active ? "Deactivate Account" : "Activate Account"}
                  </button>
                  <button
                    onClick={() => confirmDeleteUser(selectedUser)}
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
    </div>
  );
}

export default UserManagement;