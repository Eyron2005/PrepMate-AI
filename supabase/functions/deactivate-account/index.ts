import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    console.error("Required Supabase Edge Function environment variables are missing.");
    return respond(500, { error: "Edge function environment is not configured." });
  }

  try {
    // 1. Authenticate caller identity using JWT
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userResult, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userResult.user) {
      return respond(401, { error: "Your session is invalid or expired. Please sign in again." });
    }
    const callerId = userResult.user.id;
    const callerEmail = userResult.user.email || "";

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Parse request body safely (body is optional for student self-deactivation)
    let body: Record<string, unknown> = {};
    try {
      const rawText = await request.text();
      if (rawText && rawText.trim()) {
        body = JSON.parse(rawText);
      }
    } catch {
      return respond(400, { error: "The request body must be valid JSON." });
    }

    // 3. Determine if caller is an active administrator
    const { data: adminRecord, error: adminLookupError } = await adminClient
      .from("admins")
      .select("id, is_active, full_name")
      .eq("id", callerId)
      .maybeSingle();

    if (adminLookupError) {
      console.error("Database error looking up admin privileges:", adminLookupError);
      return respond(500, { error: "Unable to verify user permissions." });
    }

    const isAdmin = Boolean(adminRecord && adminRecord.is_active !== false);

    let targetUserId: string;
    let targetProfile: {
      id: string;
      full_name: string | null;
      email: string | null;
      account_status: string | null;
    };
    let reason: string;
    let details: string | null = null;
    let isSelfDeactivation = false;
    let performerRole: string;
    let deactivationAgreed = false;
    let deactivationAgreedAt: string | null = null;
    const deactivationTimestamp = new Date().toISOString();

    if (isAdmin) {
      // ---------------------------------------------------------
      // PATH A: Administrator-Initiated Student Deactivation
      // ---------------------------------------------------------
      const requestedUserId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!requestedUserId || !/^[0-9a-f-]{36}$/i.test(requestedUserId)) {
        return respond(400, { error: "A valid student user ID is required for administrative deactivation." });
      }

      if (requestedUserId.toLowerCase() === callerId.toLowerCase()) {
        return respond(400, { error: "Administrators cannot deactivate their own account." });
      }

      // Security checks: target cannot be another administrator or staff supervisor
      const [adminCheck, staffCheck, profileCheck] = await Promise.all([
        adminClient.from("admins").select("id").eq("id", requestedUserId).maybeSingle(),
        adminClient.from("staff").select("id").eq("id", requestedUserId).maybeSingle(),
        adminClient.from("profiles").select("id, full_name, email, account_status").eq("id", requestedUserId).maybeSingle(),
      ]);

      if (adminCheck.data) {
        return respond(400, { error: "Administrator accounts cannot be deactivated through student management." });
      }
      if (staffCheck.data) {
        return respond(400, { error: "Staff supervisor accounts cannot be deactivated through student management." });
      }
      if (!profileCheck.data) {
        return respond(404, { error: "Student profile not found." });
      }

      targetProfile = profileCheck.data;
      if (targetProfile.account_status === "deactivated") {
        return respond(400, { error: "This student account is already deactivated." });
      }

      targetUserId = targetProfile.id;
      reason = typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "Administrative Action";
      details = typeof body.details === "string" && body.details.trim()
        ? body.details.trim()
        : null;
      isSelfDeactivation = false;
      performerRole = "admin";
      deactivationAgreed = false;
      deactivationAgreedAt = null;

    } else {
      // ---------------------------------------------------------
      // PATH B: Student Self-Deactivation
      // ---------------------------------------------------------
      // Inactive admin check
      if (adminRecord && adminRecord.is_active === false) {
        return respond(403, { error: "Your administrator account has been disabled." });
      }

      // Staff accounts cannot self-deactivate through student deactivation
      const { data: staffRecord } = await adminClient
        .from("staff")
        .select("id")
        .eq("id", callerId)
        .maybeSingle();

      if (staffRecord) {
        return respond(403, { error: "Staff supervisor accounts cannot be deactivated through student self-deactivation." });
      }

      // Locate the authenticated student's profile
      let foundProfile = null;
      const { data: profileById, error: profIdError } = await adminClient
        .from("profiles")
        .select("id, full_name, email, account_status, auth_user_id")
        .eq("id", callerId)
        .maybeSingle();

      if (profIdError) {
        console.error("Error retrieving profile by id:", profIdError);
        return respond(500, { error: "Unable to verify student profile." });
      }

      if (profileById) {
        foundProfile = profileById;
      } else {
        const { data: profileByAuth, error: profAuthError } = await adminClient
          .from("profiles")
          .select("id, full_name, email, account_status, auth_user_id")
          .eq("auth_user_id", callerId)
          .maybeSingle();

        if (profAuthError) {
          console.error("Error retrieving profile by auth_user_id:", profAuthError);
          return respond(500, { error: "Unable to verify student profile." });
        }
        foundProfile = profileByAuth;
      }

      if (!foundProfile) {
        return respond(404, { error: "No student profile found associated with your account." });
      }

      // Enforce: Prevent student from targeting any other account
      if (typeof body.userId === "string" && body.userId.trim()) {
        const requestedId = body.userId.trim().toLowerCase();
        if (
          requestedId !== callerId.toLowerCase() &&
          requestedId !== foundProfile.id.toLowerCase()
        ) {
          return respond(403, { error: "Unauthorized. Students can only deactivate their own account." });
        }
      }

      targetProfile = foundProfile;
      targetUserId = foundProfile.id;

      if (targetProfile.account_status === "deactivated") {
        return respond(400, { error: "Your account is already deactivated." });
      }

      reason = typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "Student requested self-deactivation";
      details = typeof body.details === "string" && body.details.trim()
        ? body.details.trim()
        : typeof body.remarks === "string" && body.remarks.trim()
        ? body.remarks.trim()
        : null;

      isSelfDeactivation = true;
      performerRole = "student";
      deactivationAgreed = true;
      deactivationAgreedAt = deactivationTimestamp;
    }

    const previousStatus = targetProfile.account_status || "active";

    // 4. Update profiles table
    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({
        account_status: "deactivated",
        deactivation_reason: reason,
        deactivation_details: details,
        deactivated_at: deactivationTimestamp,
        deactivated_by: callerId,
        deactivation_agreed: deactivationAgreed,
        deactivation_agreed_at: deactivationAgreedAt,
      })
      .eq("id", targetUserId);

    if (profileUpdateError) {
      console.error("Failed to update profile status:", profileUpdateError);
      return respond(500, { error: `Database update failed: ${profileUpdateError.message}` });
    }

    // 5. Apply Supabase Auth ban (enforce access restriction on auth sessions)
    const { error: authBanError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: "876000h", // 100 years
    });

    if (authBanError) {
      console.error("Auth ban failed! Rolling back profile update to prevent inconsistency:", authBanError);
      await adminClient
        .from("profiles")
        .update({
          account_status: previousStatus,
          deactivation_reason: null,
          deactivation_details: null,
          deactivated_at: null,
          deactivated_by: null,
          deactivation_agreed: false,
          deactivation_agreed_at: null,
        })
        .eq("id", targetUserId);

      return respond(500, {
        error: `Failed to restrict student authentication: ${authBanError.message}. Changes were rolled back.`,
      });
    }

    // 6. Record in account_management_audit_logs
    const { error: auditError } = await adminClient
      .from("account_management_audit_logs")
      .insert({
        user_id: targetUserId,
        action: isSelfDeactivation ? "student_self_deactivation" : "deactivate",
        previous_status: previousStatus,
        new_status: "deactivated",
        performed_by: callerId,
        performer_role: performerRole,
        reason: reason,
        admin_remarks: details,
        metadata: {
          student_name: targetProfile.full_name,
          student_email: targetProfile.email || callerEmail,
          self_deactivated: isSelfDeactivation,
          performed_by_name: isAdmin ? adminRecord?.full_name : targetProfile.full_name,
          timestamp: deactivationTimestamp,
        },
      });

    if (auditError) {
      console.warn("Audit log creation returned a warning, but deactivation succeeded:", auditError);
    }

    return respond(200, {
      success: true,
      message: isSelfDeactivation
        ? "Your account has been successfully deactivated."
        : "Student account successfully deactivated.",
      account_status: "deactivated",
      userId: targetUserId,
      deactivated_at: deactivationTimestamp,
      self_deactivation: isSelfDeactivation,
    });
  } catch (error) {
    console.error("Unexpected error in deactivate-account Edge Function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return respond(500, { error: message });
  }
});
