import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaUserClock,
  FaCheck,
  FaTimes,
  FaSearch,
  FaEye,
  FaExclamationTriangle,
  FaSyncAlt,
  FaInfoCircle,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

function getStatusBadge(status) {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80";
    case "approved":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80";
    case "rejected":
      return "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

function getInitials(name) {
  if (!name) return "S";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function ReactivationRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending"); // 'pending' | 'all' | 'approved' | 'rejected'
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Modals state
  const [inspectTarget, setInspectTarget] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [adminRemarks, setAdminRemarks] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      setRefreshing(true);
      // Try the secure RPC function first
      const { data, error } = await supabase.rpc("get_admin_reactivation_requests", {
        p_status: statusFilter === "all" ? null : statusFilter,
      });

      if (error) {
        console.warn("RPC get_admin_reactivation_requests error, trying fallback query:", error);
        // Fallback directly to table
        let query = supabase
          .from("account_reactivation_requests")
          .select("id, user_id, registered_email, reactivation_reason, status, submitted_at, reviewed_at, reviewed_by, admin_remarks, email_verified_at")
          .order("submitted_at", { ascending: false });

        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }

        const fallback = await query;
        if (fallback.error) throw fallback.error;

        // Populate student names
        const rows = fallback.data || [];
        const userIds = rows.map((r) => r.user_id).filter(Boolean);
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);

        const nameMap = new Map((profilesData || []).map((p) => [p.id, p.full_name]));

        setRequests(
          rows.map((r) => ({
            ...r,
            student_name: nameMap.get(r.user_id) || "Student Candidate",
          }))
        );
      } else {
        setRequests(data || []);
      }
    } catch (err) {
      console.error("Error loading reactivation requests:", err);
      setActionError(`Unable to load reactivation requests: ${err.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const frameId = requestAnimationFrame(loadRequests);
    return () => cancelAnimationFrame(frameId);
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return requests;
    return requests.filter(
      (r) =>
        r.student_name?.toLowerCase().includes(query) ||
        r.registered_email?.toLowerCase().includes(query) ||
        r.reactivation_reason?.toLowerCase().includes(query)
    );
  }, [requests, searchTerm]);

  const counts = useMemo(() => {
    const pending = requests.filter((r) => r.status === "pending").length;
    const approved = requests.filter((r) => r.status === "approved").length;
    const rejected = requests.filter((r) => r.status === "rejected").length;
    return {
      all: requests.length,
      pending,
      approved,
      rejected,
    };
  }, [requests]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActionLoading(true);
    setActionError("");

    try {
      const { data, error } = await supabase.functions.invoke("review-reactivation-request", {
        body: {
          requestId: approveTarget.id,
          action: "approve",
          adminRemarks: adminRemarks.trim() || undefined,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to approve reactivation request.");
      }
      if (!data?.success) {
        throw new Error(data?.error || "Reactivation approval failed.");
      }

      setApproveTarget(null);
      setAdminRemarks("");
      setSuccessMessage("Reactivation request approved successfully.");
      await loadRequests();
    } catch (err) {
      console.error("Approve error:", err);
      setActionError(err.message || "Failed to approve request.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!adminRemarks.trim()) {
      setActionError("Please provide an administrative reason for rejecting the request.");
      return;
    }

    setActionLoading(true);
    setActionError("");

    try {
      const { data, error } = await supabase.functions.invoke("review-reactivation-request", {
        body: {
          requestId: rejectTarget.id,
          action: "reject",
          adminRemarks: adminRemarks.trim(),
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to reject reactivation request.");
      }
      if (!data?.success) {
        throw new Error(data?.error || "Reactivation rejection failed.");
      }

      setRejectTarget(null);
      setAdminRemarks("");
      setSuccessMessage("Reactivation request rejected.");
      await loadRequests();
    } catch (err) {
      console.error("Reject error:", err);
      setActionError(err.message || "Failed to reject request.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar adminName="Administrator" />

      <main className="relative ml-20 flex max-w-7xl flex-col gap-8 px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Banner Hero */}
        <section
          className={`glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-white/80 p-7 shadow-[0_25px_60px_-25px_rgba(14,116,144,0.35)] ring-1 ring-sky-100/90 transition-all duration-700 sm:p-9 ${
            mounted ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
          }`}
        >
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-amber-400/15 via-sky-400/12 to-indigo-400/10" />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-100 to-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-amber-800 shadow-sm">
                <FaUserClock className="text-amber-700 text-[11px]" />
                Account Reactivation Queue
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Reactivation Requests
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Review submitted requests from deactivated students. Approving restores application access and clears Auth bans.
              </p>
            </div>

            <button
              type="button"
              onClick={loadRequests}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-sky-200/80 bg-white/80 px-4 py-2.5 text-xs font-bold text-sky-700 shadow-sm transition hover:bg-sky-50 hover:shadow disabled:opacity-50"
            >
              <FaSyncAlt className={`text-xs ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Refreshing..." : "Refresh Queue"}</span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="relative mt-8 grid gap-4 sm:grid-cols-3">
            <div className="stat-card rounded-[1.75rem] border border-amber-100/80 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/60 p-6 shadow-[0_18px_35px_-22px_rgba(245,158,11,0.3)] ring-1 ring-amber-200/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800">Pending Review</p>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                </span>
              </div>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">{counts.pending}</p>
              <p className="mt-1 text-xs text-slate-500">Awaiting administrative decision</p>
            </div>

            <div className="stat-card rounded-[1.75rem] border border-emerald-100/80 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/60 p-6 shadow-[0_18px_35px_-22px_rgba(16,185,129,0.3)] ring-1 ring-emerald-200/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-800">Approved Total</p>
                <FaCheck className="text-emerald-600 text-sm" />
              </div>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">{counts.approved}</p>
              <p className="mt-1 text-xs text-slate-500">Restored to active status</p>
            </div>

            <div className="stat-card rounded-[1.75rem] border border-rose-100/80 bg-gradient-to-br from-rose-50/80 via-white to-pink-50/60 p-6 shadow-[0_18px_35px_-22px_rgba(244,63,94,0.3)] ring-1 ring-rose-200/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-800">Rejected Total</p>
                <FaTimes className="text-rose-600 text-sm" />
              </div>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">{counts.rejected}</p>
              <p className="mt-1 text-xs text-slate-500">Deactivation upheld</p>
            </div>
          </div>
        </section>

        {/* Alerts */}
        {(actionError || successMessage) && (
          <div
            role="status"
            className={`flex items-center gap-3 rounded-2xl border p-4 text-xs font-bold shadow-sm ${
              actionError
                ? "border-rose-200 bg-rose-50/90 text-rose-800"
                : "border-emerald-200 bg-emerald-50/90 text-emerald-800"
            }`}
          >
            {actionError ? <FaExclamationTriangle className="text-sm shrink-0" /> : <FaCheck className="text-sm shrink-0" />}
            <span className="flex-1">{actionError || successMessage}</span>
            <button
              onClick={() => {
                setActionError("");
                setSuccessMessage("");
              }}
              className="text-xs text-slate-400 hover:text-slate-700"
            >
              <FaTimes />
            </button>
          </div>
        )}

        {/* Requests Table Card */}
        <section className="glass-card rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.4)] ring-1 ring-sky-100/90 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Student Requests</h2>
              <p className="mt-1 text-xs text-slate-500">Inspect justification reasons and approve or reject submissions.</p>
            </div>

            {/* Search Bar */}
            <div className="relative w-full sm:max-w-xs">
              <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search student or email..."
                className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 pl-10 pr-4 py-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
              />
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
            <button
              type="button"
              onClick={() => setStatusFilter("pending")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === "pending"
                  ? "bg-amber-600 text-white shadow-sm shadow-amber-600/30"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Pending
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === "all"
                  ? "bg-sky-600 text-white shadow-sm shadow-sky-600/30"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All Requests
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("approved")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === "approved"
                  ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <FaCheck className="text-[10px]" />
              Approved
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("rejected")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === "rejected"
                  ? "bg-rose-600 text-white shadow-sm shadow-rose-600/30"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <FaTimes className="text-[10px]" />
              Rejected
            </button>
          </div>

          {/* Table */}
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs text-slate-700">
                <thead className="bg-slate-50/90 text-left uppercase tracking-wider text-[11px] font-bold text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Candidate</th>
                    <th className="px-4 py-3.5">Submitted</th>
                    <th className="px-4 py-3.5">Reactivation Reason</th>
                    <th className="px-4 py-3.5">Email Status</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-14 text-center text-slate-400">
                        <FaSyncAlt className="mx-auto mb-2 animate-spin text-base text-sky-600" />
                        Loading reactivation queue...
                      </td>
                    </tr>
                  ) : filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-14 text-center text-slate-400">
                        No {statusFilter !== "all" ? statusFilter : ""} reactivation requests found.
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((req) => (
                      <tr key={req.id} className="transition-colors hover:bg-sky-50/50">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-sky-600 text-xs font-bold text-white shadow-sm">
                              {getInitials(req.student_name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-bold text-slate-900">{req.student_name}</p>
                              <p className="truncate text-[11px] text-slate-500">{req.registered_email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                          {new Date(req.submitted_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="max-w-xs">
                            <p className="line-clamp-2 text-xs text-slate-800 font-medium">
                              {req.reactivation_reason}
                            </p>
                            <button
                              type="button"
                              onClick={() => setInspectTarget(req)}
                              className="mt-1 text-[11px] font-bold text-sky-700 hover:underline inline-flex items-center gap-1"
                            >
                              <FaEye className="text-[10px]" /> Read full text
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                              req.email_verified_at
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {req.email_verified_at ? "Verified" : "Unconfirmed"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${getStatusBadge(req.status)}`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {req.status === "pending" ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setApproveTarget(req);
                                  setAdminRemarks("");
                                  setActionError("");
                                }}
                                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                              >
                                <FaCheck className="text-[10px]" /> Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectTarget(req);
                                  setAdminRemarks("");
                                  setActionError("");
                                }}
                                className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                              >
                                <FaTimes className="text-[10px]" /> Reject
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setInspectTarget(req)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
                            >
                              <FaInfoCircle className="text-[10px]" /> Review Info
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Inspect Reason / Details Modal */}
      {inspectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-slate-200/80 fade-in-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reactivation Submission</span>
                <h3 className="text-lg font-bold text-slate-950">{inspectTarget.student_name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                <FaTimes />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Registered Student Email</p>
                <p className="font-semibold text-slate-800 mt-0.5">{inspectTarget.registered_email}</p>
              </div>

              <div>
                <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Submitted Reason</p>
                <div className="mt-1 max-h-48 overflow-y-auto rounded-xl bg-slate-50 p-3.5 font-medium leading-relaxed text-slate-800 ring-1 ring-slate-100">
                  {inspectTarget.reactivation_reason}
                </div>
              </div>

              {inspectTarget.reviewed_at && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500">Review Decision</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${getStatusBadge(inspectTarget.status)}`}>
                      {inspectTarget.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Reviewed by <strong>{inspectTarget.reviewer_name || "Administrator"}</strong> on {new Date(inspectTarget.reviewed_at).toLocaleString()}
                  </p>
                  {inspectTarget.admin_remarks && (
                    <div className="mt-2 text-[11px] text-slate-700">
                      <strong>Admin Remarks:</strong> {inspectTarget.admin_remarks}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setInspectTarget(null)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-slate-200/80 fade-in-up">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <FaCheck className="text-lg" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-950">Approve Reactivation Request</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Are you sure you want to approve this student's request? Their account will be reactivated and they will be allowed to log in again.
            </p>

            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs space-y-1">
              <p><strong>Candidate:</strong> {approveTarget.student_name}</p>
              <p><strong>Email:</strong> {approveTarget.registered_email}</p>
            </div>

            <div className="mt-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Admin Approval Remarks (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Reviewed appeal and verified student eligibility."
                value={adminRemarks}
                onChange={(e) => setAdminRemarks(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={actionLoading}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-700 disabled:opacity-50"
              >
                {actionLoading ? "Approving Account..." : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-10 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-slate-200/80 fade-in-up">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <FaTimes className="text-lg" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-950">Reject Reactivation Request</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Please specify the administrative remarks explaining why this student's reactivation request is rejected. The account will remain deactivated.
            </p>

            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs space-y-1">
              <p><strong>Candidate:</strong> {rejectTarget.student_name}</p>
              <p><strong>Email:</strong> {rejectTarget.registered_email}</p>
            </div>

            <div className="mt-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Administrative Remarks * (Required)
              </label>
              <textarea
                required
                rows={3}
                placeholder="Explain the reason for rejecting this reactivation request..."
                value={adminRemarks}
                onChange={(e) => setAdminRemarks(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={actionLoading || !adminRemarks.trim()}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/30 hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoading ? "Rejecting Request..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReactivationRequests;
