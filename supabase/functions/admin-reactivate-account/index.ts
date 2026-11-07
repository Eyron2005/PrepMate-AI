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
      return respond(403, { error: "Administrator privileges are required to reactivate student accounts." });
    }

    // 3. Parse and validate request body
    let body: { userId?: string; adminRemarks?: string };
    try {
      body = await request.json();
    } catch {
      return respond(400, { error: "The request body must be valid JSON." });
    }

    const { userId, adminRemarks } = body;

    if (!userId || typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return respond(400, { error: "A valid student user ID is required." });
    }

    // 4. Verify target account eligibility and status
    const [adminCheck, staffCheck, profileCheck] = await Promise.all([
      adminClient.from("admins").select("id").eq("id", userId).maybeSingle(),
      adminClient.from("staff").select("id").eq("id", userId).maybeSingle(),
      adminClient.from("profiles").select("id, full_name, account_status, deactivation_reason, deactivation_details, deactivated_at").eq("id", userId).maybeSingle(),
    ]);

    if (adminCheck.data) {
      return respond(400, { error: "Administrator accounts cannot be modified through student reactivation." });
    }
    if (staffCheck.data) {
      return respond(400, { error: "Staff accounts cannot be modified through student reactivation." });
    }
    if (!profileCheck.data) {
      return respond(404, { error: "Student profile not found." });
    }

    const studentProfile = profileCheck.data;
    if (studentProfile.account_status !== "deactivated") {
      return respond(400, { error: "This student account is already active." });
    }

    const previousDeactivation = {
      deactivation_reason: studentProfile.deactivation_reason,
      deactivation_details: studentProfile.deactivation_details,
      deactivated_at: studentProfile.deactivated_at,
    };

    const reactivationTimestamp = new Date().toISOString();
    const trimmedRemarks = adminRemarks ? adminRemarks.trim() : "";

    // 5. Update profiles table to active and clear deactivation fields
    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({
        account_status: "active",
        deactivation_reason: null,
        deactivation_details: null,
        deactivated_at: null,
        deactivated_by: null,
      })
      .eq("id", userId);

    if (profileUpdateError) {
      console.error("Failed to restore student profile status:", profileUpdateError);
      return respond(500, { error: `Database update failed: ${profileUpdateError.message}` });
    }

    // 6. Lift Supabase Auth ban (restore login capability)
    const { error: authUnbanError } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });

    if (authUnbanError) {
      console.error("Auth ban removal failed. Rolling back profile update:", authUnbanError);
      // Safe rollback to ensure consistent state
      await adminClient
        .from("profiles")
        .update({
          account_status: "deactivated",
          deactivation_reason: previousDeactivation.deactivation_reason,
          deactivation_details: previousDeactivation.deactivation_details,
          deactivated_at: previousDeactivation.deactivated_at,
        })
        .eq("id", userId);

      return respond(500, {
        error: `Failed to restore authentication access: ${authUnbanError.message}. Changes were rolled back.`,
      });
    }

    // 7. Handle existing reactivation requests (if any pending)
    let resolvedRequestId: string | null = null;
    const { data: pendingRequests, error: pendingReqError } = await adminClient
      .from("account_reactivation_requests")
      .select("id, status")
      .eq("user_id", userId)
      .eq("status", "pending");

    if (!pendingReqError && pendingRequests && pendingRequests.length > 0) {
      const remarkText = trimmedRemarks
        ? `Directly reactivated by administrator: ${trimmedRemarks}`
        : "Directly reactivated by administrator";

      for (const req of pendingRequests) {
        await adminClient
          .from("account_reactivation_requests")
          .update({
            status: "approved",
            reviewed_at: reactivationTimestamp,
            reviewed_by: callerId,
            admin_remarks: remarkText,
          })
          .eq("id", req.id);
        resolvedRequestId = req.id;
      }
    }

    // 8. Record audit log entry
    const auditRemarks = trimmedRemarks || "Direct administrator reactivation without student request";
    const { error: auditError } = await adminClient
      .from("account_management_audit_logs")
      .insert({
        user_id: userId,
        action: "admin_direct_reactivation",
        previous_status: "deactivated",
        new_status: "active",
        performed_by: callerId,
        performer_role: "admin",
        reason: "Direct administrator reactivation",
        admin_remarks: auditRemarks,
        metadata: {
          admin_name: adminRecord.full_name,
          timestamp: reactivationTimestamp,
          resolved_pending_request_id: resolvedRequestId,
          previous_deactivation_reason: previousDeactivation.deactivation_reason,
        },
      });

    if (auditError) {
      console.warn("Failed to record audit log for direct reactivation:", auditError);
      // We do not fail the reactivation itself if audit insert has a warning, but log it
    }

    return respond(200, {
      success: true,
      message: "Student account successfully reactivated.",
      userId,
      account_status: "active",
      resolvedPendingRequest: resolvedRequestId !== null,
    });
  } catch (error) {
    console.error("Unhandled error in admin-reactivate-account:", error);
    return respond(500, {
      error: error instanceof Error ? error.message : "An unexpected server error occurred.",
    });
  }
});
