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
    // 1. Verify caller identity using JWT
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userResult, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userResult.user) {
      return respond(401, { error: "Your session is invalid or expired. Please sign in again." });
    }
    const callerId = userResult.user.id;

    // 2. Verify caller is an active administrator
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: adminRecord, error: adminLookupError } = await adminClient
      .from("admins")
      .select("id, is_active, full_name")
      .eq("id", callerId)
      .maybeSingle();

    if (adminLookupError) {
      console.error("Database error looking up admin privileges:", adminLookupError);
      return respond(500, { error: "Unable to verify administrator permissions." });
    }
    if (!adminRecord || adminRecord.is_active === false) {
      return respond(403, { error: "Administrator privileges are required to deactivate student accounts." });
    }

    // 3. Parse and validate request body
    let body: { userId?: string; reason?: string; details?: string };
    try {
      body = await request.json();
    } catch {
      return respond(400, { error: "The request body must be valid JSON." });
    }

    const { userId, reason, details } = body;

    if (!userId || typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return respond(400, { error: "A valid student user ID is required." });
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return respond(400, { error: "A deactivation reason is required." });
    }

    // 4. Security checks: prevent targeting self, other admins, or staff
    if (userId === callerId) {
      return respond(400, { error: "Administrators cannot deactivate their own account." });
    }

    const [adminCheck, staffCheck, profileCheck] = await Promise.all([
      adminClient.from("admins").select("id").eq("id", userId).maybeSingle(),
      adminClient.from("staff").select("id").eq("id", userId).maybeSingle(),
      adminClient.from("profiles").select("id, full_name, account_status").eq("id", userId).maybeSingle(),
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

    const studentProfile = profileCheck.data;
    if (studentProfile.account_status === "deactivated") {
      return respond(400, { error: "This student account is already deactivated." });
    }

    const previousStatus = studentProfile.account_status || "active";
    const deactivationTimestamp = new Date().toISOString();

    // 5. Update profiles table
    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({
        account_status: "deactivated",
        deactivation_reason: reason.trim(),
        deactivation_details: details ? details.trim() : null,
        deactivated_at: deactivationTimestamp,
        deactivated_by: callerId,
      })
      .eq("id", userId);

    if (profileUpdateError) {
      console.error("Failed to update student profile status:", profileUpdateError);
      return respond(500, { error: `Database update failed: ${profileUpdateError.message}` });
    }

    // 6. Apply Supabase Auth ban
    const { error: authBanError } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: "876000h", // 100 years
    });

    if (authBanError) {
      console.error("Auth ban failed! Rolling back profile update to prevent inconsistency:", authBanError);
      // Rollback database update
      await adminClient
        .from("profiles")
        .update({
          account_status: previousStatus,
          deactivation_reason: null,
          deactivation_details: null,
          deactivated_at: null,
          deactivated_by: null,
        })
        .eq("id", userId);

      return respond(500, {
        error: `Failed to restrict student authentication: ${authBanError.message}. The profile update was rolled back.`,
      });
    }

    // 7. Record account management audit log
    const { error: auditError } = await adminClient
      .from("account_management_audit_logs")
      .insert({
        user_id: userId,
        action: "deactivate",
        previous_status: previousStatus,
        new_status: "deactivated",
        performed_by: callerId,
        performer_role: "admin",
        reason: reason.trim(),
        admin_remarks: details ? details.trim() : null,
        metadata: {
          student_name: studentProfile.full_name,
          admin_name: adminRecord.full_name,
          timestamp: deactivationTimestamp,
        },
      });

    if (auditError) {
      console.warn("Audit log creation returned a warning, but deactivation succeeded:", auditError);
    }

    return respond(200, {
      success: true,
      message: "Student account successfully deactivated.",
      account_status: "deactivated",
      userId,
      deactivated_at: deactivationTimestamp,
    });
  } catch (error) {
    console.error("Unexpected error in deactivate-account Edge Function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return respond(500, { error: message });
  }
});
