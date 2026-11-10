import { supabase } from "./supabase.js";
import { fetchCurrentAdminProfile, formatAdminDisplayName } from "./adminProfile.js";

const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 10000;

export const EMAIL_STATUS_META = {
  pending: {
    key: "pending",
    label: "Pending",
    description: "Queued for handoff to email provider.",
    badgeClass: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  },
  accepted: {
    key: "accepted",
    label: "Sent / Accepted",
    description: "Accepted by email provider; awaiting final delivery confirmation.",
    badgeClass: "bg-sky-50 text-sky-700 ring-1 ring-sky-200/80",
  },
  delivered: {
    key: "delivered",
    label: "Delivered",
    description: "Delivery confirmed by email provider.",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80",
  },
  failed: {
    key: "failed",
    label: "Failed",
    description: "Email sending was rejected or failed.",
    badgeClass: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80",
  },
  bounced: {
    key: "bounced",
    label: "Bounced",
    description: "Recipient mail server bounced the email.",
    badgeClass: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80",
  },
};

export function getEmailStatusMeta(status) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  return EMAIL_STATUS_META[normalized] || EMAIL_STATUS_META.pending;
}

export const EMAIL_TEMPLATES = [
  {
    key: "account_concern",
    label: "Account-Related Concern",
    category: "Account",
    subject: "Concern Regarding Your PrepMate AI Account",
    body: [
      "Dear [Student Name],",
      "",
      "We would like to discuss a concern regarding your PrepMate AI account. Please review this message and contact the appropriate staff member if further clarification is needed.",
      "",
      "**Action Requested:**",
      "- Log in to your PrepMate AI student portal to verify your account details.",
      "- Reply to this email if you need assistance or believe an issue occurred in error.",
      "",
      "Thank you,",
      "PrepMate AI Team",
    ].join("\n"),
  },
  {
    key: "interview_feedback",
    label: "Interview Performance Feedback",
    category: "Performance",
    subject: "PrepMate AI Mock Interview Feedback & Next Steps",
    body: [
      "Dear [Student Name],",
      "",
      "Thank you for completing your recent mock interview practice on PrepMate AI. Based on your recent evaluation, we would like to share a quick follow-up and recommendations for your upcoming internship preparation:",
      "",
      "**Key Focus Areas:**",
      "- Review your recent interview response breakdown and rubric scores.",
      "- Practice structuring behavioral answers clearly using the **STAR method** (Situation, Task, Action, Result).",
      "",
      "Please let us know if you would like to schedule a follow-up coaching session.",
      "",
      "Best regards,",
      "PrepMate AI Team",
    ].join("\n"),
  },
  {
    key: "ojt_reminder",
    label: "OJT Preparation Reminder",
    category: "Reminder",
    subject: "Important Reminder: OJT Readiness & Mock Interview Schedule",
    body: [
      "Dear [Student Name],",
      "",
      "This is a reminder to stay on track with your **On-the-Job Training (OJT) preparation** milestones on PrepMate AI.",
      "",
      "**Before your upcoming deadline, please ensure you:**",
      "- Complete your assigned mock interview practice sessions.",
      "- Review your **Employment Readiness Index (ERI)** summary and feedback notes.",
      "",
      "Reach out if you encounter any schedule conflicts or technical issues.",
      "",
      "Thank you,",
      "PrepMate AI Team",
    ].join("\n"),
  },
  {
    key: "incomplete_profile",
    label: "Missing Info / Incomplete Profile",
    category: "Profile",
    subject: "Action Required: Complete Your PrepMate AI Student Profile",
    body: [
      "Dear [Student Name],",
      "",
      "We noticed that some details on your **PrepMate AI student profile** are missing or incomplete. Keeping your profile updated helps supervisors accurately monitor your OJT readiness.",
      "",
      "**Please update the following at your earliest convenience:**",
      "- Full name and verified contact details",
      "- Relevant academic or OJT placement information",
      "",
      "Thank you for your prompt attention.",
      "",
      "Best regards,",
      "PrepMate AI Team",
    ].join("\n"),
  },
  {
    key: "general_announcement",
    label: "General Student Announcement",
    category: "Announcement",
    subject: "PrepMate AI Announcement for OJT Candidates",
    body: [
      "Dear [Student Name],",
      "",
      "We are sharing an important update regarding the **PrepMate AI OJT Interview Preparation Program**.",
      "",
      "**Details:**",
      "- [Enter your announcement details, dates, or instructions here]",
      "",
      "Please check your PrepMate AI dashboard regularly for updates.",
      "",
      "Warm regards,",
      "PrepMate AI Team",
    ].join("\n"),
  },
  {
    key: "admin_notice",
    label: "Important Administrative Notice",
    category: "Notice",
    subject: "Important Administrative Notice – PrepMate AI",
    body: [
      "Dear [Student Name],",
      "",
      "Please take note of the following **important administrative notice** regarding your PrepMate AI student record:",
      "",
      "[Write specific instructions, compliance notes, or deadlines here]",
      "",
      "Please acknowledge or respond if follow-up action is requested.",
      "",
      "Sincerely,",
      "PrepMate AI Administration",
    ].join("\n"),
  },
];

export function applyEmailTemplate(templateKey, { studentName = "", multiple = false } = {}) {
  const template = EMAIL_TEMPLATES.find((t) => t.key === templateKey);
  if (!template) return null;

  const recipientLabel = multiple
    ? "Student"
    : typeof studentName === "string" && studentName.trim()
      ? studentName.trim()
      : "Student";

  return {
    templateKey: template.key,
    subject: template.subject,
    bodyText: template.body.replaceAll("[Student Name]", recipientLabel),
  };
}

export function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function applyInlineFormatting(escapedLine) {
  // Bold (**text**) then italic (*text*)
  return escapedLine
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

/**
 * Converts plain/markdown-lite email text into safe HTML paragraphs, line breaks, bold, italic, and bullet lists.
 */
export function formatEmailBodyToHtml(bodyText) {
  const normalized = typeof bodyText === "string" ? bodyText.replace(/\r\n/g, "\n").trim() : "";
  if (!normalized) return "";

  const blocks = normalized.split(/\n{2,}/);
  const htmlBlocks = blocks.map((block) => {
    const lines = block.split("\n");
    const segments = [];
    let currentParagraphLines = [];
    let currentListItems = [];

    const flushParagraph = () => {
      if (currentParagraphLines.length > 0) {
        const htmlLines = currentParagraphLines
          .map((line) => applyInlineFormatting(escapeHtml(line)))
          .join("<br />");
        segments.push(`<p style="margin: 0 0 12px 0; line-height: 1.6; color: #1e293b;">${htmlLines}</p>`);
        currentParagraphLines = [];
      }
    };

    const flushList = () => {
      if (currentListItems.length > 0) {
        const itemsHtml = currentListItems
          .map((item) => `<li style="margin: 4px 0;">${applyInlineFormatting(escapeHtml(item))}</li>`)
          .join("");
        segments.push(`<ul style="margin: 8px 0 12px 0; padding-left: 20px; color: #334155;">${itemsHtml}</ul>`);
        currentListItems = [];
      }
    };

    for (const line of lines) {
      const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
      if (bulletMatch) {
        flushParagraph();
        currentListItems.push(bulletMatch[1]);
      } else {
        flushList();
        currentParagraphLines.push(line);
      }
    }

    flushList();
    flushParagraph();
    return segments.join("\n");
  });

  return htmlBlocks.join("\n");
}

export function validateEmailDraft({
  recipients = [],
  subject = "",
  messageText = "",
  isAdmin = false,
  canEmailUnassigned = false,
}) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return { valid: false, error: "Please select a student recipient." };
  }

  for (const recipient of recipients) {
    if (!recipient?.id) {
      return { valid: false, error: "One or more selected recipients are invalid." };
    }
    const email = typeof recipient.email === "string" ? recipient.email.trim() : "";
    if (!email || !SIMPLE_EMAIL_REGEX.test(email)) {
      return {
        valid: false,
        error: `Student "${recipient.full_name || "Unknown"}" does not have a valid registered email address.`,
      };
    }
    if (!isAdmin && !canEmailUnassigned && recipient.is_assigned === false) {
      return {
        valid: false,
        error: `You are not assigned to "${recipient.full_name || "this student"}". Staff can only email assigned students unless explicitly authorized.`,
      };
    }
  }

  const trimmedSubject = typeof subject === "string" ? subject.trim() : "";
  if (!trimmedSubject) {
    return { valid: false, error: "Email subject is required." };
  }
  if (trimmedSubject.length > MAX_SUBJECT_LENGTH) {
    return {
      valid: false,
      error: `Email subject must not exceed ${MAX_SUBJECT_LENGTH} characters.`,
    };
  }

  const trimmedBody = typeof messageText === "string" ? messageText.trim() : "";
  if (!trimmedBody) {
    return { valid: false, error: "Message body cannot be empty." };
  }
  if (trimmedBody.length > MAX_BODY_LENGTH) {
    return {
      valid: false,
      error: `Message body must not exceed ${MAX_BODY_LENGTH.toLocaleString()} characters.`,
    };
  }

  return { valid: true, error: "" };
}

export async function fetchEmailableStudents() {
  const { data, error } = await supabase.rpc("get_emailable_students");
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

export async function fetchCurrentSenderIdentity(session, isStaffPortal) {
  const userId = session?.user?.id || null;
  const userEmail = session?.user?.email || "";

  if (!userId) {
    return {
      userId: null,
      name: isStaffPortal ? "Staff" : "Admin",
      email: "",
      role: isStaffPortal ? "staff" : "admin",
      canEmailUnassigned: false,
    };
  }

  if (isStaffPortal) {
    const { data: staffRow } = await supabase
      .from("staff")
      .select("id, full_name, email, position, department, can_email_unassigned_students")
      .eq("id", userId)
      .maybeSingle();

    const rawName =
      staffRow?.full_name ||
      session?.user?.user_metadata?.full_name ||
      userEmail?.split("@")[0] ||
      "Staff Member";

    return {
      userId,
      name: formatAdminDisplayName(rawName) || rawName,
      email: staffRow?.email || userEmail,
      position: staffRow?.position || "",
      department: staffRow?.department || "",
      role: "staff",
      canEmailUnassigned: Boolean(staffRow?.can_email_unassigned_students),
    };
  }

  const profile = await fetchCurrentAdminProfile(session);
  return {
    userId,
    name: profile?.displayName || formatAdminDisplayName(userEmail?.split("@")[0] || "") || "Administrator",
    email: userEmail,
    role: "admin",
    canEmailUnassigned: true,
  };
}

export async function fetchEmailLogs({ limit = 100 } = {}) {
  const { data, error } = await supabase
    .from("student_email_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

export async function sendStudentEmail({ recipientIds, subject, messageText, templateKey = null }) {
  const { data, error } = await supabase.functions.invoke("send-student-email", {
    body: {
      action: "send",
      recipientIds,
      subject,
      messageText,
      templateKey,
    },
  });

  if (error) {
    let message = error.message || "Unable to send email.";
    if (error.context && typeof error.context.json === "function") {
      try {
        const parsed = await error.context.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // retain error.message
      }
    }
    throw new Error(message);
  }

  return data;
}

export async function syncEmailStatuses(logIds = []) {
  const { data, error } = await supabase.functions.invoke("send-student-email", {
    body: {
      action: "sync-status",
      logIds,
    },
  });

  if (error) {
    let message = error.message || "Unable to refresh delivery status.";
    if (error.context && typeof error.context.json === "function") {
      try {
        const parsed = await error.context.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // retain error.message
      }
    }
    throw new Error(message);
  }

  return data;
}
