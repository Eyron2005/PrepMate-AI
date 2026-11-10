import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FaBold,
  FaCheck,
  FaCheckCircle,
  FaClock,
  FaEnvelope,
  FaExclamationTriangle,
  FaEye,
  FaHistory,
  FaItalic,
  FaListUl,
  FaLock,
  FaPaperPlane,
  FaSearch,
  FaShieldAlt,
  FaSyncAlt,
  FaTimes,
  FaTimesCircle,
  FaUserCheck,
  FaUserTie,
  FaUsers,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import StaffSidebar from "../components/StaffSidebar";
import StudentAvatar from "../components/StudentAvatar";
import { useAuth } from "../contexts/authContext";
import {
  EMAIL_TEMPLATES,
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  applyEmailTemplate,
  fetchCurrentSenderIdentity,
  fetchEmailLogs,
  fetchEmailableStudents,
  formatEmailBodyToHtml,
  getEmailStatusMeta,
  sendStudentEmail,
  syncEmailStatuses,
  validateEmailDraft,
} from "../services/emailCommunication";

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EmailCommunication({ isStaff = false }) {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedStudentId = searchParams.get("studentId") || "";
  const isAdmin = !isStaff;

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("compose"); // "compose" | "history"

  // Sender & directory state
  const [sender, setSender] = useState(null);
  const [students, setStudents] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [directoryError, setDirectoryError] = useState("");

  // Email history state
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [syncingStatuses, setSyncingStatuses] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState("all");
  const [inspectLog, setInspectLog] = useState(null);

  // Compose state
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [subject, setSubject] = useState("");
  const [messageText, setMessageText] = useState("");
  const [editorMode, setEditorMode] = useState("write"); // "write" | "preview"
  const [formError, setFormError] = useState("");
  const [sendFeedback, setSendFeedback] = useState(null); // { type: "success" | "warning" | "error", title, detail, results }
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const textareaRef = useRef(null);
  const appliedPreselectRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    setLoadingDirectory(true);
    setLoadingLogs(true);
    setDirectoryError("");
    setLogsError("");

    try {
      const [senderInfo, eligibleStudents, emailLogs] = await Promise.all([
        fetchCurrentSenderIdentity(session, isStaff),
        fetchEmailableStudents(),
        fetchEmailLogs({ limit: 150 }),
      ]);

      setSender(senderInfo);
      setStudents(eligibleStudents);
      setLogs(emailLogs);

      if (!appliedPreselectRef.current && preselectedStudentId && eligibleStudents.length > 0) {
        const match = eligibleStudents.find((s) => s.id === preselectedStudentId);
        if (match) {
          setSelectedStudentIds([match.id]);
          appliedPreselectRef.current = true;
        }
      }
    } catch (err) {
      console.error("Error loading email communication data:", err);
      const message = err?.message || "Unable to load email communication records.";
      setDirectoryError(message);
      setLogsError(message);
    } finally {
      setLoadingDirectory(false);
      setLoadingLogs(false);
    }
  }, [isStaff, preselectedStudentId, session]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      loadWorkspaceData();
    });
    return () => cancelAnimationFrame(frameId);
  }, [loadWorkspaceData]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const name = (s.full_name || "").toLowerCase();
      const email = (s.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [studentSearch, students]);

  const selectedRecipients = useMemo(() => {
    const idSet = new Set(selectedStudentIds);
    return students.filter((s) => idSet.has(s.id));
  }, [selectedStudentIds, students]);

  const primaryRecipient = selectedRecipients[0] || null;

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs.filter((item) => {
      const matchesStatus = logStatusFilter === "all" || item.status === logStatusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return [
        item.recipient_name,
        item.recipient_email,
        item.sender_name,
        item.subject,
        item.provider_message_id,
      ].some((val) => typeof val === "string" && val.toLowerCase().includes(q));
    });
  }, [logSearch, logStatusFilter, logs]);

  const logStats = useMemo(() => {
    return {
      total: logs.length,
      accepted: logs.filter((l) => l.status === "accepted").length,
      delivered: logs.filter((l) => l.status === "delivered").length,
      issues: logs.filter((l) => l.status === "failed" || l.status === "bounced").length,
    };
  }, [logs]);

  const previewHtml = useMemo(() => formatEmailBodyToHtml(messageText), [messageText]);

  function handleSelectStudent(student) {
    setFormError("");
    if (broadcastMode && isAdmin) {
      setSelectedStudentIds((prev) =>
        prev.includes(student.id) ? prev.filter((id) => id !== student.id) : [...prev, student.id]
      );
    } else {
      setSelectedStudentIds([student.id]);
      if (selectedTemplateKey && (!subject.trim() || !messageText.trim())) {
        const applied = applyEmailTemplate(selectedTemplateKey, {
          studentName: student.full_name,
          multiple: false,
        });
        if (applied) {
          setSubject(applied.subject);
          setMessageText(applied.bodyText);
        }
      }
    }
  }

  function handleToggleBroadcastMode(enableBroadcast) {
    setBroadcastMode(enableBroadcast);
    setFormError("");
    if (!enableBroadcast && selectedStudentIds.length > 1) {
      setSelectedStudentIds((prev) => prev.slice(0, 1));
    }
  }

  function handleSelectAllFiltered() {
    if (!isAdmin || !broadcastMode) return;
    const eligibleIds = filteredStudents
      .filter((s) => Boolean(s.email && s.email.trim()))
      .map((s) => s.id);
    setSelectedStudentIds((prev) => [...new Set([...prev, ...eligibleIds])]);
    setFormError("");
  }

  function handleApplyTemplate(templateKey) {
    setSelectedTemplateKey(templateKey);
    if (!templateKey) return;

    const applied = applyEmailTemplate(templateKey, {
      studentName: primaryRecipient?.full_name || "Student",
      multiple: selectedRecipients.length > 1 || broadcastMode,
    });
    if (applied) {
      setSubject(applied.subject);
      setMessageText(applied.bodyText);
      setFormError("");
    }
  }

  function applyFormattingToken(kind) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? messageText.length;
    const end = el.selectionEnd ?? messageText.length;
    const selected = messageText.slice(start, end);

    let replacement = "";
    if (kind === "bold") {
      replacement = `**${selected || "important text"}**`;
    } else if (kind === "italic") {
      replacement = `*${selected || "emphasized text"}*`;
    } else if (kind === "bullet") {
      replacement = selected
        ? selected
            .split("\n")
            .map((line) => (line.trim().startsWith("- ") ? line : `- ${line}`))
            .join("\n")
        : "\n- List item";
    }

    const updated = `${messageText.slice(0, start)}${replacement}${messageText.slice(end)}`;
    setMessageText(updated);
    setFormError("");

    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + replacement.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function handleCancelCompose() {
    if (sending) return;
    const hasChanges = Boolean(subject.trim() || messageText.trim() || selectedStudentIds.length > 0);
    if (hasChanges && !window.confirm("Discard the current email draft and clear selected recipients?")) {
      return;
    }
    setSelectedStudentIds([]);
    setSelectedTemplateKey("");
    setSubject("");
    setMessageText("");
    setEditorMode("write");
    setFormError("");
    setSendFeedback(null);
  }

  function handleRequestSend(event) {
    event.preventDefault();
    if (sending) return;

    const validation = validateEmailDraft({
      recipients: selectedRecipients,
      subject,
      messageText,
      isAdmin,
      canEmailUnassigned: sender?.canEmailUnassigned || false,
    });

    if (!validation.valid) {
      setFormError(validation.error);
      return;
    }

    setFormError("");
    setConfirmOpen(true);
  }

  async function handleConfirmSend() {
    if (sending) return;
    setSending(true);
    setFormError("");
    setSendFeedback(null);

    try {
      const response = await sendStudentEmail({
        recipientIds: selectedRecipients.map((r) => r.id),
        subject: subject.trim(),
        messageText: messageText.trim(),
        templateKey: selectedTemplateKey || null,
      });

      setConfirmOpen(false);

      // Refresh logs immediately to reflect actual persisted outcome
      const updatedLogs = await fetchEmailLogs({ limit: 150 }).catch(() => logs);
      setLogs(updatedLogs);

      if (response?.success) {
        const acceptedResults = response.results || [];
        const firstMsgId = acceptedResults[0]?.providerMessageId;
        setSendFeedback({
          type: "success",
          title:
            response.sentCount > 1
              ? `${response.sentCount} emails accepted by provider (Sent / Accepted)`
              : `Email accepted for delivery to ${acceptedResults[0]?.recipientEmail || primaryRecipient?.email}`,
          detail: firstMsgId
            ? `Status recorded as "Sent / Accepted" (Provider Message ID: ${firstMsgId}). Delivery confirmation updates via provider webhook or "Check Delivery Status".`
            : 'Status recorded as "Sent / Accepted".',
          results: acceptedResults,
        });

        // Reset draft on clean full send
        setSubject("");
        setMessageText("");
        setSelectedTemplateKey("");
        setSelectedStudentIds([]);
        setEditorMode("write");
      } else if (response?.partialSuccess) {
        setSendFeedback({
          type: "warning",
          title: `${response.sentCount} accepted, ${response.failedCount} failed`,
          detail: response.error || "Some recipients could not be delivered. Inspect Email History for error details.",
          results: response.results || [],
        });
      } else {
        setSendFeedback({
          type: "error",
          title: "Email Sending Failed",
          detail: response?.error || "The email provider rejected this request. No email was falsely marked as sent.",
          results: response?.results || [],
        });
      }
    } catch (err) {
      setConfirmOpen(false);
      const updatedLogs = await fetchEmailLogs({ limit: 150 }).catch(() => logs);
      setLogs(updatedLogs);

      setSendFeedback({
        type: "error",
        title: "Email Sending Failed",
        detail: err?.message || "Unable to send email through backend service.",
        results: [],
      });
    } finally {
      setSending(false);
    }
  }

  async function handleSyncDeliveryStatuses() {
    if (syncingStatuses) return;
    setSyncingStatuses(true);
    setLogsError("");
    try {
      await syncEmailStatuses();
      const refreshed = await fetchEmailLogs({ limit: 150 });
      setLogs(refreshed);
    } catch (err) {
      console.error("Failed to refresh delivery statuses:", err);
      setLogsError(err?.message || "Could not refresh provider delivery statuses.");
    } finally {
      setSyncingStatuses(false);
    }
  }

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      {isStaff ? (
        <StaffSidebar staffName={sender?.name || undefined} />
      ) : (
        <AdminSidebar />
      )}

      <main className="relative ml-20 max-w-7xl px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Hero Header */}
        <section
          className={`glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-white/80 p-7 shadow-[0_25px_60px_-25px_rgba(14,116,144,0.35)] ring-1 ring-sky-100/90 transition-all duration-700 sm:p-9 ${
            mounted ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
          }`}
        >
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-sky-400/15 via-blue-400/12 to-cyan-400/10" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-100 to-cyan-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-sky-800 shadow-sm">
                  <FaEnvelope className="text-[11px] text-sky-600" />
                  Student Communication
                </span>
                {sender && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                    isAdmin
                      ? "bg-blue-50 text-blue-800 ring-1 ring-blue-200/80"
                      : "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200/80"
                  }`}>
                    {isAdmin ? <FaShieldAlt className="text-[10px]" /> : <FaUserTie className="text-[10px]" />}
                    Sender: {sender.name} ({sender.role.toUpperCase()})
                  </span>
                )}
              </div>

              <h1 className="mt-3.5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Email Communication
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                {isAdmin
                  ? "Send messages or announcements to students and check whether emails were delivered."
                  : sender?.canEmailUnassigned
                    ? "Send emails to students and check delivery status for your sent messages."
                    : "Send reminders and feedback directly to your assigned students."}
              </p>
            </div>

            {/* Tab Navigation Pills */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/85 p-1.5 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab("compose")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  activeTab === "compose"
                    ? "bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 text-white shadow-md shadow-sky-500/25"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <FaPaperPlane className="text-[11px]" />
                Compose Email
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  activeTab === "history"
                    ? "bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 text-white shadow-md shadow-sky-500/25"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <FaHistory className="text-[11px]" />
                Email History
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                  activeTab === "history"
                    ? "bg-white/25 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}>
                  {logs.length}
                </span>
              </button>
            </div>
          </div>

          {/* Summary KPIs */}
          <div className="relative mt-6 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Students</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{students.length}</p>
            </div>
            <div className="rounded-2xl border border-sky-200/80 bg-sky-50/70 px-4 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Sent / Accepted</p>
              <p className="mt-1 text-2xl font-extrabold text-sky-900">{logStats.accepted}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Confirmed Delivered</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-900">{logStats.delivered}</p>
            </div>
            <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Failed / Bounced</p>
              <p className="mt-1 text-2xl font-extrabold text-rose-900">{logStats.issues}</p>
            </div>
          </div>
        </section>

        {/* Send Outcome Notification Banner */}
        {sendFeedback && (
          <div
            role="status"
            className={`mt-6 rounded-2xl border p-4 sm:p-5 shadow-sm transition-all ${
              sendFeedback.type === "success"
                ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
                : sendFeedback.type === "warning"
                  ? "border-amber-200 bg-amber-50/90 text-amber-950"
                  : "border-rose-200 bg-rose-50/90 text-rose-950"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg shrink-0">
                  {sendFeedback.type === "success" ? (
                    <FaCheckCircle className="text-emerald-600" />
                  ) : sendFeedback.type === "warning" ? (
                    <FaExclamationTriangle className="text-amber-600" />
                  ) : (
                    <FaTimesCircle className="text-rose-600" />
                  )}
                </span>
                <div>
                  <h3 className="text-sm font-bold">{sendFeedback.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed opacity-90">{sendFeedback.detail}</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("history")}
                    className="mt-2 text-xs font-bold underline underline-offset-2 hover:opacity-80"
                  >
                    View in Email History &rarr;
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSendFeedback(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-black/5"
                aria-label="Dismiss notification"
              >
                <FaTimes className="text-xs" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: COMPOSE EMAIL */}
        {activeTab === "compose" && (
          <section className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
            {/* Left Column: Trusted Student Recipient Picker */}
            <div className="glass-card rounded-[2rem] border border-white/80 p-5 sm:p-6 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.35)] ring-1 ring-sky-100/90 flex flex-col max-h-[760px]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
                    1. Select Recipient
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAdmin
                      ? "Any registered student account"
                      : sender?.canEmailUnassigned
                        ? "Authorized student directory"
                        : "Assigned students only"}
                  </p>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleToggleBroadcastMode(!broadcastMode)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition border ${
                      broadcastMode
                        ? "border-sky-500 bg-sky-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    title="Send announcement to multiple students"
                  >
                    <FaUsers className="text-[10px]" />
                    {broadcastMode ? "Multi-Select On" : "Announcement"}
                  </button>
                )}
              </div>

              {/* Search Student Bar */}
              <div className="relative mt-4">
                <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student name or email..."
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
                />
              </div>

              {isAdmin && broadcastMode && (
                <div className="mt-2.5 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-600">
                    {selectedRecipients.length} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="font-bold text-sky-700 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedStudentIds([])}
                      className="font-bold text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Student List */}
              <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1">
                {loadingDirectory ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    <FaSyncAlt className="mx-auto mb-2 animate-spin text-sky-600" />
                    Loading student recipients...
                  </div>
                ) : directoryError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                    {directoryError}
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-xs text-slate-500">
                    {students.length === 0 && isStaff && !sender?.canEmailUnassigned
                      ? "No students are currently assigned to your staff account."
                      : "No students match your search."}
                  </div>
                ) : (
                  filteredStudents.map((student) => {
                    const isSelected = selectedStudentIds.includes(student.id);
                    const hasEmail = Boolean(student.email && student.email.trim());

                    return (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => handleSelectStudent(student)}
                        className={`w-full text-left rounded-2xl border p-3 transition flex items-start gap-3 ${
                          isSelected
                            ? "border-sky-500 bg-sky-50/90 ring-2 ring-sky-500/20 shadow-sm"
                            : "border-slate-200/80 bg-white/90 hover:border-sky-300 hover:bg-sky-50/30"
                        }`}
                      >
                        {isSelected && broadcastMode ? (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm bg-gradient-to-br from-sky-500 to-blue-600">
                            <FaCheck className="text-xs" />
                          </div>
                        ) : (
                          <StudentAvatar
                            avatarUrl={student.avatar_url}
                            name={student.full_name}
                            isDeactivated={student.account_status === "deactivated"}
                            size="md"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate text-xs font-bold text-slate-900">
                              {student.full_name || "Unnamed Student"}
                            </p>
                            {student.account_status === "deactivated" && (
                              <span className="shrink-0 rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-700">
                                Deactivated
                              </span>
                            )}
                          </div>
                          <p className={`truncate text-[11px] mt-0.5 ${
                            hasEmail ? "text-slate-600 font-medium" : "text-rose-600 font-semibold"
                          }`}>
                            {hasEmail ? student.email : "No registered email available"}
                          </p>
                          {student.is_assigned && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                              <FaUserCheck className="text-[8px]" /> Assigned Student
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Compose Form */}
            <form
              onSubmit={handleRequestSend}
              className="glass-card rounded-[2rem] border border-white/80 p-6 sm:p-8 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.35)] ring-1 ring-sky-100/90 space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
                    2. Compose Message
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Write your own email or pick a ready-made template.
                  </p>
                </div>

                {/* Trusted Sender Display */}
                {sender && (
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-[11px] text-slate-700">
                    <span className="font-bold">From:</span> {sender.name}{" "}
                    <span className="text-slate-400">({sender.role.toUpperCase()})</span>
                  </div>
                )}
              </div>

              {/* Selected Recipient Summary (Trusted Read-Only Email) */}
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/60 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-900">
                    <FaLock className="text-[10px] text-sky-600" />
                    Selected Recipient{selectedRecipients.length > 1 ? "s" : ""} (Verified Student Account)
                  </span>
                  {selectedRecipients.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedStudentIds([])}
                      className="text-[11px] font-bold text-slate-500 hover:text-rose-600"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                {selectedRecipients.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    Pick a student on the left to fill in their email address.
                  </p>
                ) : selectedRecipients.length === 1 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white bg-white/90 px-3 py-2">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Student Name
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        {primaryRecipient.full_name}
                      </span>
                    </div>
                    <div className="rounded-xl border border-white bg-white/90 px-3 py-2">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Registered Email Address
                      </span>
                      <span className="text-xs font-mono font-semibold text-sky-800 break-all">
                        {primaryRecipient.email || "No email on record"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {selectedRecipients.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800"
                      >
                        <span>{r.full_name}</span>
                        <span className="text-sky-700 font-mono text-[10px]">&lt;{r.email}&gt;</span>
                        <button
                          type="button"
                          onClick={() => handleSelectStudent(r)}
                          className="text-slate-400 hover:text-rose-600"
                          aria-label={`Remove ${r.full_name}`}
                        >
                          <FaTimes className="text-[9px]" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Optional Reusable Email Template */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Reusable Email Template (Optional)
                </label>
                <select
                  value={selectedTemplateKey}
                  onChange={(e) => handleApplyTemplate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
                >
                  <option value="">Custom Blank Message (No Template)</option>
                  {EMAIL_TEMPLATES.map((tpl) => (
                    <option key={tpl.key} value={tpl.key}>
                      [{tpl.category}] {tpl.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Email Subject */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="email-subject" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Email Subject <span className="text-rose-500">*</span>
                  </label>
                  <span className={`text-[11px] font-semibold ${
                    subject.length > MAX_SUBJECT_LENGTH ? "text-rose-600" : "text-slate-400"
                  }`}>
                    {subject.length} / {MAX_SUBJECT_LENGTH}
                  </span>
                </div>
                <input
                  id="email-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    if (formError) setFormError("");
                  }}
                  maxLength={MAX_SUBJECT_LENGTH}
                  placeholder="e.g., Concern Regarding Your PrepMate AI Account"
                  className="w-full rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
                />
              </div>

              {/* Message Body with Formatting Toolbar & Live HTML Preview */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label htmlFor="email-body" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Message Body <span className="text-rose-500">*</span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    {editorMode === "write" && (
                      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-1.5 py-1 mr-1">
                        <button
                          type="button"
                          onClick={() => applyFormattingToken("bold")}
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-sky-700"
                          title="Bold (**text**)"
                        >
                          <FaBold className="text-[11px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFormattingToken("italic")}
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-sky-700"
                          title="Italic (*text*)"
                        >
                          <FaItalic className="text-[11px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFormattingToken("bullet")}
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-sky-700"
                          title="Bullet List (- item)"
                        >
                          <FaListUl className="text-[11px]" />
                        </button>
                      </div>
                    )}

                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setEditorMode("write")}
                        className={`rounded-lg px-2.5 py-1 transition ${
                          editorMode === "write" ? "bg-white text-sky-700 shadow-sm" : "text-slate-600"
                        }`}
                      >
                        Write
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditorMode("preview")}
                        className={`rounded-lg px-2.5 py-1 transition ${
                          editorMode === "preview" ? "bg-white text-sky-700 shadow-sm" : "text-slate-600"
                        }`}
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                </div>

                {editorMode === "write" ? (
                  <textarea
                    id="email-body"
                    ref={textareaRef}
                    value={messageText}
                    onChange={(e) => {
                      setMessageText(e.target.value);
                      if (formError) setFormError("");
                    }}
                    rows={10}
                    maxLength={MAX_BODY_LENGTH}
                    placeholder={`Dear ${primaryRecipient?.full_name || "Student"},\n\nWrite your personalized message here... Use **bold**, *italic*, blank lines for paragraphs, or "- " for bullet lists.`}
                    className="w-full rounded-2xl border border-slate-200/90 bg-white p-4 text-xs leading-relaxed text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
                  />
                ) : (
                  <div className="min-h-[240px] rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Email Preview</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">{subject || "(No subject)"}</p>
                    </div>
                    {previewHtml ? (
                      <div
                        className="text-xs leading-relaxed text-slate-800 space-y-2"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    ) : (
                      <p className="text-xs text-slate-400 italic">Nothing written yet.</p>
                    )}
                    <div className="border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                      <p><strong>Sent by:</strong> {sender?.name || "Sender"} ({isAdmin ? "Administrator" : "Staff Supervisor"})</p>
                      <p><strong>Timestamp:</strong> {formatDateTime(new Date().toISOString())}</p>
                    </div>
                  </div>
                )}

                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Supports paragraphs, line breaks, **bold**, *italic*, and - bullet lists.</span>
                  <span>{messageText.length} / {MAX_BODY_LENGTH}</span>
                </div>
              </div>

              {formError && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 flex items-center gap-2">
                  <FaExclamationTriangle className="shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                  <FaClock className="text-slate-400" />
                  Sent emails are saved in Email History so you can check delivery status.
                </span>

                <div className="flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={handleCancelCompose}
                    disabled={sending}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-500/30 transition hover:shadow-sky-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <>
                        <FaSyncAlt className="animate-spin text-xs" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <FaPaperPlane className="text-xs" />
                        Send Email
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {/* TAB 2: EMAIL HISTORY & DELIVERY LOGS */}
        {activeTab === "history" && (
          <section className="mt-6 glass-card rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.4)] ring-1 ring-sky-100/90 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">Email History &amp; Delivery Logs</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAdmin
                    ? "List of all emails sent by admins and staff."
                    : "List of emails sent from your account and their delivery status."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncDeliveryStatuses}
                  disabled={syncingStatuses || loadingLogs}
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-800 shadow-sm transition hover:bg-sky-100 disabled:opacity-50"
                >
                  <FaSyncAlt className={`text-xs ${syncingStatuses ? "animate-spin" : ""}`} />
                  {syncingStatuses ? "Checking Provider..." : "Check Delivery Status"}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="mt-5 grid gap-3 sm:grid-cols-[1.5fr_220px]">
              <div className="relative">
                <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Search recipient, email, sender, subject, or message ID..."
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
                />
              </div>

              <select
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
              >
                <option value="all">All Statuses</option>
                <option value="accepted">Sent / Accepted</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="bounced">Bounced</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            {logsError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
                {logsError}
              </div>
            )}

            {/* History Table */}
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-xs text-slate-700">
                  <thead className="bg-slate-50/90 text-left uppercase tracking-wider text-[11px] font-bold text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Date &amp; Time</th>
                      <th className="px-4 py-3.5">Sender</th>
                      <th className="px-4 py-3.5">Recipient Student</th>
                      <th className="px-4 py-3.5">Subject</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingLogs ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-14 text-center text-slate-400">
                          <FaSyncAlt className="mx-auto mb-2 animate-spin text-base text-sky-600" />
                          Loading email communication logs...
                        </td>
                      </tr>
                    ) : filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-14 text-center text-slate-400">
                          No sent emails match your search or filter.
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => {
                        const statusMeta = getEmailStatusMeta(log.status);
                        return (
                          <tr key={log.id} className="transition-colors hover:bg-sky-50/40">
                            <td className="px-4 py-3.5 whitespace-nowrap text-[11px] text-slate-600">
                              {formatDateTime(log.created_at)}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <p className="font-bold text-slate-900 text-xs">{log.sender_name}</p>
                              <span className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                log.sender_role === "admin"
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-indigo-100 text-indigo-800"
                              }`}>
                                {log.sender_role}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="font-bold text-slate-900">{log.recipient_name}</p>
                              <p className="text-[11px] font-mono text-slate-500">{log.recipient_email}</p>
                            </td>
                            <td className="px-4 py-3.5 max-w-xs">
                              <p className="truncate font-semibold text-slate-800" title={log.subject}>
                                {log.subject}
                              </p>
                              {log.provider_message_id && (
                                <p className="truncate text-[10px] font-mono text-slate-400 mt-0.5">
                                  ID: {log.provider_message_id}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span
                                title={log.error_message || statusMeta.description}
                                className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-bold ${statusMeta.badgeClass}`}
                              >
                                {statusMeta.label}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right">
                              <button
                                type="button"
                                onClick={() => setInspectLog(log)}
                                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-sky-50 hover:text-sky-800"
                              >
                                <FaEye className="text-[10px]" /> Inspect
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
          </section>
        )}
      </main>

      {/* Confirmation Dialog Before Sending */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-slate-200/80 fade-in-up">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <FaPaperPlane className="text-base" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Confirm Send</p>
                <h3 className="text-xl font-extrabold text-slate-950">Send Email to Student{selectedRecipients.length > 1 ? "s" : ""}?</h3>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Recipient{selectedRecipients.length > 1 ? "s" : ""}</span>
                {selectedRecipients.length === 1 ? (
                  <p className="mt-0.5 font-bold text-slate-900">
                    {primaryRecipient?.full_name} <span className="font-mono font-normal text-sky-800">&lt;{primaryRecipient?.email}&gt;</span>
                  </p>
                ) : (
                  <p className="mt-0.5 font-bold text-slate-900">
                    {selectedRecipients.length} registered students selected
                  </p>
                )}
              </div>
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Subject</span>
                <p className="mt-0.5 font-semibold text-slate-900">{subject.trim()}</p>
              </div>
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Sent From</span>
                <p className="mt-0.5 text-slate-700">{sender?.name} ({isAdmin ? "ADMIN" : "STAFF"})</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={sending}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                disabled={sending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-500/30 transition hover:shadow-sky-500/50 disabled:opacity-60"
              >
                {sending ? (
                  <>
                    <FaSyncAlt className="animate-spin text-xs" /> Sending...
                  </>
                ) : (
                  <>
                    <FaPaperPlane className="text-xs" /> Confirm &amp; Send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Email Log Modal */}
      {inspectLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8 backdrop-blur-md">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-[2.25rem] glass-card-elevated border border-white/80 bg-white/95 shadow-2xl ring-1 ring-slate-200/80 fade-in-up">
            <div className="flex items-center justify-between border-b border-slate-100 px-7 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Email Details</p>
                <h3 className="mt-0.5 text-lg font-extrabold text-slate-950">{inspectLog.subject}</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectLog(null)}
                className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <FaTimes className="text-sm" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-7 py-5 space-y-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Sender</span>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {inspectLog.sender_name} ({inspectLog.sender_role?.toUpperCase()})
                  </p>
                  {inspectLog.sender_email && (
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">{inspectLog.sender_email}</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Recipient Student</span>
                  <p className="mt-0.5 font-bold text-slate-900">{inspectLog.recipient_name}</p>
                  <p className="text-[11px] font-mono text-sky-800 mt-0.5">{inspectLog.recipient_email}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-slate-200/80 bg-white p-3">
                <div>
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Status</span>
                  <span className={`mt-1 inline-block rounded-lg px-2 py-0.5 text-[11px] font-bold ${getEmailStatusMeta(inspectLog.status).badgeClass}`}>
                    {getEmailStatusMeta(inspectLog.status).label}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Sent On</span>
                  <p className="mt-1 font-semibold text-slate-700">{formatDateTime(inspectLog.created_at)}</p>
                </div>
                <div>
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Message ID</span>
                  <p className="mt-1 font-mono text-[11px] text-slate-600 truncate" title={inspectLog.provider_message_id || ""}>
                    {inspectLog.provider_message_id || "—"}
                  </p>
                </div>
              </div>

              {inspectLog.delivered_at && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-emerald-900 font-semibold">
                  Delivery confirmed at {formatDateTime(inspectLog.delivered_at)}.
                </div>
              )}

              {inspectLog.error_message && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-rose-900">
                  <p className="font-bold">Error Details</p>
                  <p className="mt-1 leading-relaxed">{inspectLog.error_message}</p>
                </div>
              )}

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Message Content</p>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {inspectLog.body_text}
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 px-7 py-4 bg-slate-50/60 rounded-b-[2.25rem]">
              <button
                type="button"
                onClick={() => setInspectLog(null)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailCommunication;
