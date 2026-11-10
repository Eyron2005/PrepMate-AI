import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 100;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 10000;

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInlineHtml(escapedLine: string): string {
  return escapedLine
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

function formatMessageBodyHtml(bodyText: string): string {
  const normalized = bodyText.replace(/\r\n/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const segments: string[] = [];
      let paragraphLines: string[] = [];
      let listItems: string[] = [];

      const flushParagraph = () => {
        if (paragraphLines.length > 0) {
          const htmlLines = paragraphLines
            .map((line) => formatInlineHtml(escapeHtml(line)))
            .join("<br />");
          segments.push(`<p style="margin:0 0 12px 0;line-height:1.6;color:#1e293b;">${htmlLines}</p>`);
          paragraphLines = [];
        }
      };

      const flushList = () => {
        if (listItems.length > 0) {
          const items = listItems
            .map((item) => `<li style="margin:4px 0;">${formatInlineHtml(escapeHtml(item))}</li>`)
            .join("");
          segments.push(`<ul style="margin:8px 0 12px 0;padding-left:20px;color:#334155;">${items}</ul>`);
          listItems = [];
        }
      };

      for (const line of lines) {
        const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
        if (bulletMatch) {
          flushParagraph();
          listItems.push(bulletMatch[1]);
        } else {
          flushList();
          paragraphLines.push(line);
        }
      }

      flushList();
      flushParagraph();
      return segments.join("\n");
    })
    .join("\n");
}

function buildEmailHtml({
  subject,
  bodyHtml,
  senderName,
  senderRoleLabel,
  timestampLabel,
}: {
  subject: string;
  bodyHtml: string;
  senderName: string;
  senderRoleLabel: string;
  timestampLabel: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:20px 28px;background:linear-gradient(135deg,#0284c7,#2563eb);color:#ffffff;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;">PrepMate AI Portal</div>
        <div style="margin-top:4px;font-size:18px;font-weight:700;line-height:1.3;">${escapeHtml(subject)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 28px;font-size:14px;color:#1e293b;">
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.5;">
        <div><strong>Sent by:</strong> ${escapeHtml(senderName)} (${escapeHtml(senderRoleLabel)})</div>
        <div><strong>Sent at:</strong> ${escapeHtml(timestampLabel)}</div>
        <div style="margin-top:6px;color:#94a3b8;">This message was sent from the PrepMate AI Admin Portal.</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function resolveFromAddress(resendKey: string): Promise<string> {
  const explicitFrom = Deno.env.get("RESEND_FROM_EMAIL") || Deno.env.get("EMAIL_FROM_ADDRESS");
  if (explicitFrom && explicitFrom.trim()) {
    return explicitFrom.trim();
  }

  try {
    const domainsRes = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${resendKey}` },
      signal: AbortSignal.timeout(5000),
    });

    if (domainsRes.ok) {
      const domainsJson = await domainsRes.json();
      const verifiedDomain = Array.isArray(domainsJson?.data)
        ? domainsJson.data.find((d: { status?: string; name?: string }) => d?.status === "verified" && d?.name)
        : null;

      if (verifiedDomain?.name) {
        return `PrepMate AI <noreply@${verifiedDomain.name}>`;
      }
    }
  } catch (err) {
    console.warn("Could not query Resend domains endpoint:", err);
  }

  return "PrepMate AI <onboarding@resend.dev>";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return respond(405, { error: "Method not allowed." });
  }

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!authorization || !token) {
    return respond(401, { error: "Authentication is required." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(500, { error: "Supabase Edge Function environment is not configured." });
  }

  try {
    // 1. Authenticate caller via Supabase Auth
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userResult, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userResult?.user) {
      return respond(401, { error: "Your session is invalid or expired. Please sign in again." });
    }

    const callerId = userResult.user.id;
    const callerEmail = userResult.user.email || "";
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Verify active Administrator or Staff role on the server
    const [{ data: adminRecord, error: adminErr }, { data: staffRecord, error: staffErr }] = await Promise.all([
      adminClient
        .from("admins")
        .select("id, full_name, role, is_active")
        .eq("id", callerId)
        .maybeSingle(),
      adminClient
        .from("staff")
        .select("id, full_name, email, position, department, is_active, can_email_unassigned_students")
        .eq("id", callerId)
        .maybeSingle(),
    ]);

    if (adminErr || staffErr) {
      console.error("Permission verification query failed:", adminErr || staffErr);
      return respond(500, { error: "Unable to verify sender permissions." });
    }

    const isAdmin = Boolean(adminRecord && adminRecord.is_active !== false);
    const isStaff = Boolean(!isAdmin && staffRecord && staffRecord.is_active !== false);

    if (!isAdmin && !isStaff) {
      return respond(403, { error: "Only active administrators or authorized staff members can use email communication." });
    }

    const senderRole: "admin" | "staff" = isAdmin ? "admin" : "staff";
    const senderRoleLabel = isAdmin ? "Administrator" : (staffRecord?.position || "Staff Supervisor");
    const canEmailUnassigned = isAdmin || Boolean(staffRecord?.can_email_unassigned_students);

    let senderName = isAdmin
      ? (adminRecord?.full_name || "")
      : (staffRecord?.full_name || "");
    if (!senderName || ["admin", "administrator", "staff"].includes(senderName.trim().toLowerCase())) {
      const metaName = userResult.user.user_metadata?.full_name;
      if (typeof metaName === "string" && metaName.trim()) {
        senderName = metaName.trim();
      }
    }
    if (!senderName.trim()) {
      senderName = callerEmail?.split("@")[0] || (isAdmin ? "PrepMate Administrator" : "PrepMate Staff");
    }

    // Parse body safely
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return respond(400, { error: "Request body must be valid JSON." });
    }

    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "send";
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return respond(500, { error: "Email provider (RESEND_API_KEY) is not configured in Supabase secrets." });
    }

    // ---------------------------------------------------------
    // ACTION: sync-status (check actual Resend delivery/bounce events)
    // ---------------------------------------------------------
    if (action === "sync-status") {
      const requestedIds = Array.isArray(body.logIds)
        ? body.logIds.filter((id): id is string => typeof id === "string" && UUID_REGEX.test(id))
        : [];

      let query = adminClient
        .from("student_email_logs")
        .select("id, sender_id, provider_message_id, status")
        .in("status", ["pending", "accepted"])
        .not("provider_message_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(25);

      if (!isAdmin) {
        query = query.eq("sender_id", callerId);
      }
      if (requestedIds.length > 0) {
        query = query.in("id", requestedIds);
      }

      const { data: pendingLogs, error: lookupError } = await query;
      if (lookupError) {
        return respond(500, { error: `Unable to load logs for status sync: ${lookupError.message}` });
      }

      let updatedCount = 0;
      const nowIso = new Date().toISOString();

      for (const log of pendingLogs || []) {
        if (!log.provider_message_id) continue;
        try {
          const checkRes = await fetch(`https://api.resend.com/emails/${encodeURIComponent(log.provider_message_id)}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${resendKey}` },
            signal: AbortSignal.timeout(5000),
          });
          if (!checkRes.ok) continue;

          const eventData = await checkRes.json();
          const lastEvent = typeof eventData?.last_event === "string" ? eventData.last_event.toLowerCase() : "";

          if (lastEvent === "delivered" && log.status !== "delivered") {
            await adminClient
              .from("student_email_logs")
              .update({
                status: "delivered",
                delivered_at: nowIso,
                provider_response: eventData,
                updated_at: nowIso,
              })
              .eq("id", log.id);
            updatedCount++;
          } else if (lastEvent === "bounced" && log.status !== "bounced") {
            await adminClient
              .from("student_email_logs")
              .update({
                status: "bounced",
                bounced_at: nowIso,
                error_message: "Recipient email bounced.",
                provider_response: eventData,
                updated_at: nowIso,
              })
              .eq("id", log.id);
            updatedCount++;
          } else if (["complained", "failed", "canceled"].includes(lastEvent) && log.status !== "failed") {
            await adminClient
              .from("student_email_logs")
              .update({
                status: "failed",
                error_message: `Provider reported event: ${lastEvent}`,
                provider_response: eventData,
                updated_at: nowIso,
              })
              .eq("id", log.id);
            updatedCount++;
          }
        } catch (syncErr) {
          console.warn(`Status check failed for message ${log.provider_message_id}:`, syncErr);
        }
      }

      return respond(200, {
        success: true,
        checkedCount: pendingLogs?.length || 0,
        updatedCount,
      });
    }

    // ---------------------------------------------------------
    // ACTION: send
    // ---------------------------------------------------------
    const rawRecipientIds = Array.isArray(body.recipientIds)
      ? body.recipientIds
      : typeof body.recipientId === "string"
        ? [body.recipientId]
        : [];
    const recipientIds = [...new Set(rawRecipientIds.filter((id): id is string => typeof id === "string" && UUID_REGEX.test(id)))];

    if (recipientIds.length === 0) {
      return respond(400, { error: "At least one valid student recipient ID is required." });
    }
    if (recipientIds.length > MAX_RECIPIENTS) {
      return respond(400, { error: `Cannot send to more than ${MAX_RECIPIENTS} students in one request.` });
    }

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const messageText = typeof body.messageText === "string" ? body.messageText.trim() : "";
    const templateKey = typeof body.templateKey === "string" && body.templateKey.trim()
      ? body.templateKey.trim().slice(0, 64)
      : null;

    if (!subject || subject.length > MAX_SUBJECT_LENGTH) {
      return respond(400, { error: `Email subject must be between 1 and ${MAX_SUBJECT_LENGTH} characters.` });
    }
    if (!messageText || messageText.length > MAX_BODY_LENGTH) {
      return respond(400, { error: `Message body must be between 1 and ${MAX_BODY_LENGTH} characters.` });
    }

    // Look up recipient student profiles from trusted database
    const { data: profiles, error: profilesErr } = await adminClient
      .from("profiles")
      .select("id, auth_user_id, full_name, email, account_status")
      .in("id", recipientIds);

    if (profilesErr) {
      console.error("Failed to fetch recipient profiles:", profilesErr);
      return respond(500, { error: "Unable to verify recipient student profiles." });
    }

    if (!profiles || profiles.length !== recipientIds.length) {
      return respond(404, { error: "One or more selected students were not found." });
    }

    // Verify targets are genuine students (not admins or staff)
    const candidateUserIds = [
      ...new Set(profiles.flatMap((p) => [p.id, p.auth_user_id]).filter(Boolean)),
    ];
    const [{ data: adminMatches }, { data: staffMatches }] = await Promise.all([
      adminClient.from("admins").select("id").in("id", candidateUserIds),
      adminClient.from("staff").select("id").in("id", candidateUserIds),
    ]);

    const nonStudentIds = new Set([
      ...(adminMatches || []).map((a) => a.id),
      ...(staffMatches || []).map((s) => s.id),
    ]);
    for (const p of profiles) {
      if (nonStudentIds.has(p.id) || (p.auth_user_id && nonStudentIds.has(p.auth_user_id))) {
        return respond(400, { error: "Emails through Student Communication can only target student accounts." });
      }
    }

    // Enforce staff-to-student assignment check on the backend
    if (!isAdmin && !canEmailUnassigned) {
      const { data: assignments, error: assignErr } = await adminClient
        .from("staff_student_assignments")
        .select("student_user_id")
        .eq("staff_id", callerId);

      if (assignErr) {
        return respond(500, { error: "Unable to verify your student assignment permissions." });
      }

      const assignedSet = new Set((assignments || []).map((a) => a.student_user_id));
      for (const p of profiles) {
        const isAssigned = assignedSet.has(p.id) || (p.auth_user_id ? assignedSet.has(p.auth_user_id) : false);
        if (!isAssigned) {
          return respond(403, {
            error: `Access denied: "${p.full_name || "Selected student"}" is not assigned to your staff account.`,
          });
        }
      }
    }

    const fromAddress = await resolveFromAddress(resendKey);
    const bodyHtml = formatMessageBodyHtml(messageText);
    const sendTimestamp = new Date();
    const timestampLabel = sendTimestamp.toLocaleString("en-US", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " (PHT)";

    const renderedHtml = buildEmailHtml({
      subject,
      bodyHtml,
      senderName,
      senderRoleLabel,
      timestampLabel,
    });

    const plainTextWithFooter = `${messageText}\n\n---\nSent by: ${senderName} (${senderRoleLabel})\nSent at: ${timestampLabel}\nPrepMate AI Admin Portal`;

    const batchId = recipientIds.length > 1 ? crypto.randomUUID() : null;
    const results: Array<{
      logId: string | null;
      recipientId: string;
      recipientName: string;
      recipientEmail: string;
      status: "accepted" | "failed";
      providerMessageId: string | null;
      error: string | null;
    }> = [];

    for (const profile of profiles) {
      const authTargetId = profile.auth_user_id || profile.id;
      let trustedEmail = typeof profile.email === "string" ? profile.email.trim() : "";

      // Prefer authoritative Auth email record
      try {
        const { data: authUserResult } = await adminClient.auth.admin.getUserById(authTargetId);
        if (authUserResult?.user?.email) {
          trustedEmail = authUserResult.user.email.trim();
        }
      } catch {
        // retain profile.email fallback
      }

      const recipientName = profile.full_name?.trim() || "Student";

      if (!trustedEmail || !EMAIL_REGEX.test(trustedEmail)) {
        const { data: failedRow } = await adminClient
          .from("student_email_logs")
          .insert({
            batch_id: batchId,
            sender_id: callerId,
            sender_name: senderName,
            sender_email: callerEmail || null,
            sender_role: senderRole,
            recipient_profile_id: profile.id,
            recipient_user_id: authTargetId,
            recipient_name: recipientName,
            recipient_email: trustedEmail || "missing-email",
            subject,
            body_text: messageText,
            body_html: renderedHtml,
            template_key: templateKey,
            status: "failed",
            provider: "resend",
            error_message: "Student account does not have a valid registered email address.",
          })
          .select("id")
          .single();

        results.push({
          logId: failedRow?.id || null,
          recipientId: profile.id,
          recipientName,
          recipientEmail: trustedEmail || "",
          status: "failed",
          providerMessageId: null,
          error: `No valid registered email found for ${recipientName}.`,
        });
        continue;
      }

      // 1. Create pending log row
      const { data: pendingRow, error: insertErr } = await adminClient
        .from("student_email_logs")
        .insert({
          batch_id: batchId,
          sender_id: callerId,
          sender_name: senderName,
          sender_email: callerEmail || null,
          sender_role: senderRole,
          recipient_profile_id: profile.id,
          recipient_user_id: authTargetId,
          recipient_name: recipientName,
          recipient_email: trustedEmail,
          subject,
          body_text: messageText,
          body_html: renderedHtml,
          template_key: templateKey,
          status: "pending",
          provider: "resend",
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("Failed to create pending email log:", insertErr);
      }
      const logId = pendingRow?.id || null;

      // 2. Dispatch via Resend API
      try {
        const resendPayload: Record<string, unknown> = {
          from: fromAddress,
          to: [trustedEmail],
          subject,
          html: renderedHtml,
          text: plainTextWithFooter,
        };
        if (callerEmail && EMAIL_REGEX.test(callerEmail)) {
          resendPayload.reply_to = callerEmail;
        }

        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(resendPayload),
          signal: AbortSignal.timeout(12000),
        });

        const rawRespText = await resendResponse.text();
        let resendJson: Record<string, unknown> = {};
        try {
          resendJson = rawRespText ? JSON.parse(rawRespText) : {};
        } catch {
          resendJson = { raw: rawRespText };
        }

        const providerMessageId = typeof resendJson.id === "string" ? resendJson.id : null;
        const nowIso = new Date().toISOString();

        if (resendResponse.ok && providerMessageId) {
          if (logId) {
            await adminClient
              .from("student_email_logs")
              .update({
                status: "accepted",
                provider_message_id: providerMessageId,
                provider_response: resendJson,
                sent_at: nowIso,
                updated_at: nowIso,
              })
              .eq("id", logId);
          }

          results.push({
            logId,
            recipientId: profile.id,
            recipientName,
            recipientEmail: trustedEmail,
            status: "accepted",
            providerMessageId,
            error: null,
          });
        } else {
          const providerErrorMsg =
            (typeof resendJson.message === "string" && resendJson.message) ||
            (typeof resendJson.error === "string" && resendJson.error) ||
            `Resend rejected request with HTTP ${resendResponse.status}.`;

          if (logId) {
            await adminClient
              .from("student_email_logs")
              .update({
                status: "failed",
                error_message: providerErrorMsg,
                provider_response: resendJson,
                updated_at: nowIso,
              })
              .eq("id", logId);
          }

          results.push({
            logId,
            recipientId: profile.id,
            recipientName,
            recipientEmail: trustedEmail,
            status: "failed",
            providerMessageId: null,
            error: providerErrorMsg,
          });
        }
      } catch (sendErr) {
        const msg = (sendErr as Error).message || "Network error contacting email provider.";
        const nowIso = new Date().toISOString();
        if (logId) {
          await adminClient
            .from("student_email_logs")
            .update({
              status: "failed",
              error_message: msg,
              updated_at: nowIso,
            })
            .eq("id", logId);
        }

        results.push({
          logId,
          recipientId: profile.id,
          recipientName,
          recipientEmail: trustedEmail,
          status: "failed",
          providerMessageId: null,
          error: msg,
        });
      }
    }

    const sentCount = results.filter((r) => r.status === "accepted").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    const firstError = results.find((r) => r.error)?.error || null;

    return respond(200, {
      success: sentCount > 0 && failedCount === 0,
      partialSuccess: sentCount > 0 && failedCount > 0,
      sentCount,
      failedCount,
      fromAddress,
      batchId,
      sender: {
        id: callerId,
        name: senderName,
        role: senderRole,
      },
      error: sentCount === 0 ? (firstError || "Email sending failed.") : firstError,
      results,
    });
  } catch (err) {
    console.error("Unexpected error in send-student-email:", err);
    return respond(500, { error: (err as Error).message || "Internal server error sending email." });
  }
});
