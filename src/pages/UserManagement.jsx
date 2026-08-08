import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaEye,
  FaSearch,
  FaTrash,
  FaToggleOff,
  FaToggleOn,
  FaUserCircle,
} from "react-icons/fa";
import { supabase } from "../services/supabase";

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

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    // trigger entrance animations after mount
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  async function loadUsers() {
    setLoading(true);
    setLoadError(null);

    const {
      data: sessionData,
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Supabase session error:", sessionError);
      setLoadError("Unable to verify your session. Please sign in again.");
      setLoading(false);
      return;
    }

    const session = sessionData?.session;
    console.log("Supabase session:", session || null);

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
      { table: "users", select: "*" },
    ];

    const allRows = [];
    let lastError = null;
    let anySourceSucceeded = false;

    for (const source of sources) {
      try {
        const { data, error } = await supabase.from(source.table).select(source.select);
        console.log(`table=${source.table} ->`, error ? `ERROR: ${error.message}` : `${(data || []).length} rows`);
        if (error) {
          lastError = error;
          continue;
        }

        anySourceSucceeded = true;
        if (Array.isArray(data) && data.length > 0) {
          const normalized = data
            .map((row) => {
              const idColumn = row.id
                ? "id"
                : row.user_id
                ? "user_id"
                : row.uid
                ? "uid"
                : null;
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
      console.info("No user rows returned from available tables (admins/profiles/users).");
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

  async function deleteUser(user) {
    const confirmed = window.confirm(
      `Delete ${user.full_name || user.email || "this user"}? This action cannot be undone.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    const sourceTable = user._sourceTable || "admins";
    const idColumn = user._idColumn || "id";
    const idValue = user._idValue || user.id;

    const { error } = await supabase.from(sourceTable).delete().eq(idColumn, idValue);

    if (error) {
      console.error("Error deleting user:", error);
      alert("Could not delete user.");
      setActionLoading(false);
      return;
    }

    setSelectedUser(null);
    await loadUsers();
    setActionLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className={`mx-auto flex max-w-7xl flex-col gap-8 transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6'}`}>
        <div className="flex flex-col gap-4 rounded-[2rem] bg-white p-8 shadow-xl ring-1 ring-slate-200 transform transition hover:shadow-2xl hover:-translate-y-1">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Admin Dashboard</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-900">User Management</h1>
              <p className="mt-3 max-w-2xl text-slate-600">
                View users, search profiles, inspect account details, and manage activation state from one dashboard.
              </p>
            </div>
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 rounded-3xl border border-blue-600 bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <FaArrowLeft /> Back to Dashboard
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className={`rounded-[1.75rem] bg-blue-600 p-6 text-white shadow-lg ring-1 ring-blue-800 transform transition duration-500 ${mounted ? 'scale-100' : 'scale-95'}`}>
              <p className="text-sm uppercase tracking-[0.24em] text-blue-200">Total Users</p>
              <p className="mt-4 text-4xl font-semibold">{users.length}</p>
              <p className="mt-2 text-sm text-blue-100/90">All registered users in the system.</p>
            </div>
            <div className={`rounded-[1.75rem] bg-slate-50 p-6 shadow-sm ring-1 ring-slate-200 transform transition duration-500 ${mounted ? 'scale-100' : 'scale-95'}`}>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Active Accounts</p>
              <p className="mt-4 text-4xl font-semibold text-slate-900">{activeCount}</p>
              <p className="mt-2 text-sm text-slate-500">Users with an active account.</p>
            </div>
            <div className={`rounded-[1.75rem] bg-slate-50 p-6 shadow-sm ring-1 ring-slate-200 transform transition duration-500 ${mounted ? 'scale-100' : 'scale-95'}`}>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Inactive Accounts</p>
              <p className="mt-4 text-4xl font-semibold text-slate-900">{inactiveCount}</p>
              <p className="mt-2 text-sm text-slate-500">Users that are temporarily disabled.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">View Users</h2>
                <p className="mt-2 text-sm text-slate-500">Search users by name or email and select a profile to review details.</p>
              </div>
              <div className="relative max-w-sm">
                <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search users..."
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-12 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Joined</th>
                    <th className="px-6 py-4">Last Online</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                        Loading users...
                      </td>
                    </tr>
                  ) : loadError ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-rose-600">
                        {loadError}
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                        No users found. Try a different search term.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user, idx) => (
                      <tr
                        key={user.id}
                        style={{ transitionDelay: `${idx * 50}ms` }}
                        className={`transform transition-all duration-500 ease-out hover:bg-slate-50 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
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
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              user.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {user.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4">{new Date(user.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {user.last_online_at ? new Date(user.last_online_at).toLocaleString() : "Unavailable"}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="inline-flex items-center gap-2 rounded-3xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-xs font-semibold text-white transition-transform transform hover:-translate-y-0.5 hover:scale-105 shadow-sm"
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

          <div className="rounded-[2rem] bg-white p-8 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">User Profile</p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-900">{selectedUser ? selectedUser.full_name || selectedUser.email : "Select a user to view details"}</h2>
              </div>
              {selectedUser && (
                <span className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold ${selectedUser.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {selectedUser.is_active ? "Active" : "Inactive"}
                </span>
              )}
            </div>

            {selectedUser ? (
              <div className="mt-8 grid gap-6">
                <div className="rounded-3xl bg-slate-50 p-6">
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Full Name</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{selectedUser.full_name || "Unnamed User"}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-slate-50 p-6">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Account Created</p>
                    <p className="mt-3 text-lg font-semibold text-slate-900">{new Date(selectedUser.created_at).toLocaleString()}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-6">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Last Online</p>
                    <p className="mt-3 text-lg font-semibold text-slate-900">
                      {selectedUser.last_online_at ? new Date(selectedUser.last_online_at).toLocaleString() : "Unavailable"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-slate-50 p-6">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">User ID</p>
                    <p className="mt-3 break-all text-sm text-slate-700">{selectedUser.id}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => toggleActiveState(selectedUser)}
                    disabled={actionLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectedUser.is_active ? <FaToggleOff /> : <FaToggleOn />}
                    {selectedUser.is_active ? "Deactivate Account" : "Activate Account"}
                  </button>
                  <button
                    onClick={() => deleteUser(selectedUser)}
                    disabled={actionLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-3xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FaTrash /> Delete User
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                Select a user from the table to view profile details and manage the account.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserManagement;
