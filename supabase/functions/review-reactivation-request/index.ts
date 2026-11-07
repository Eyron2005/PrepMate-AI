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
      return respond(403, { error: "Administrator privileges are required to review reactivation requests." });
    }

    // 3. Parse and validate request body
    let body: { requestId?: string; action?: "approve" | "reject"; adminRemarks?: string };
    try {
      body = await request.json();
    } catch {
      return respond(400, { error: "The request body must be valid JSON." });
    }

    const { requestId, action, adminRemarks } = body;

    if (!requestId || typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) {
      return respond(400, { error: "A valid request ID is required." });
    }
    if (action !== "approve" && action !== "reject") {
      return respond(400, { error: "Action must be either 'approve' or 'reject'." });
    }
    if (action === "reject" && (!adminRemarks || !adminRemarks.trim())) {
      return respond(400, { error: "Administrative remarks are required when rejecting a reactivation request." });
    }

    // 4. Retrieve reactivation request
    const { data: reactivationRequest, error: reqFetchError } = await adminClient
      .from("account_reactivation_requests")
      .select("id, user_id, registered_email, status, reactivation_reason")
      .eq("id", requestId)
      .maybeSingle();

    if (reqFetchError) {
      console.error("Database error fetching request:", reqFetchError);
      return respond(500, { error: "Unable to retrieve reactivation request." });
    }
    if (!reactivationRequest) {
      return respond(404, { error: "Reactivation request not found." });
    }
    if (reactivationRequest.status !== "pending") {
      return respond(400, {
        error: `This request has already been reviewed (${reactivationRequest.status}).`,
        status: reactivationRequest.status,
      });
    }

    const targetUserId = reactivationRequest.user_id;
    const reviewTimestamp = new Date().toISOString();

    // 5. Handle Action: APPROVE
    if (action === "approve") {
      // 5a. Update request to approved
      const { error: reqUpdateError } = await adminClient
        .from("account_reactivation_requests")
        .update({
          status: "approved",
          reviewed_at: reviewTimestamp,
          reviewed_by: callerId,
          admin_remarks: adminRemarks ? adminRemarks.trim() : "Approved by administrator",
        })
        .eq("id", requestId);

      if (reqUpdateError) {
        console.error("Failed to update request to approved:", reqUpdateError);
        return respond(500, { error: `Failed to update request: ${reqUpdateError.message}` });
      }

      // 5b. Update profiles to active and clear deactivation metadata
      const { error: profileRestoreError } = await adminClient
        .from("profiles")
        .update({
          account_status: "active",
          deactivation_reason: null,
          deactivation_details: null,
          deactivated_at: null,
          deactivated_by: null,
        })
        .eq("id", targetUserId);

      if (profileRestoreError) {
        console.error("Failed to restore profile status:", profileRestoreError);
        // Rollback request update
        await adminClient
          .from("account_reactivation_requests")
          .update({ status: "pending", reviewed_at: null, reviewed_by: null, admin_remarks: null })
          .eq("id", requestId);
        return respond(500, { error: `Failed to reactivate profile: ${profileRestoreError.message}` });
      }

      // 5c. Remove Supabase Auth ban
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: "none",
      });

      if (unbanError) {
        console.error("Auth unban failed! Reverting profile status to keep consistency:", unbanError);
        // Rollback
        await adminClient
          .from("profiles")
          .update({ account_status: "deactivated" })
          .eq("id", targetUserId);
        await adminClient
          .from("account_reactivation_requests")
          .update({ status: "pending", reviewed_at: null, reviewed_by: null, admin_remarks: null })
          .eq("id", requestId);

        return respond(500, {
          error: `Failed to remove authentication restriction: ${unbanError.message}. Changes were rolled back.`,
        });
      }

      // 5d. Insert audit log
      await adminClient.from("account_management_audit_logs").insert({
        user_id: targetUserId,
        action: "approve_reactivation",
        previous_status: "deactivated",
        new_status: "active",
        performed_by: callerId,
        performer_role: "admin",
        reason: "Reactivation request approved",
        admin_remarks: adminRemarks ? adminRemarks.trim() : "Approved by administrator",
        metadata: {
          requestId,
          admin_name: adminRecord.full_name,
          timestamp: reviewTimestamp,
        },
      });

      return respond(200, {
        success: true,
        message: "Reactivation request approved successfully.",
        requestId,
        userId: targetUserId,
        account_status: "active",
      });
    }

    // 6. Handle Action: REJECT
    if (action === "reject") {
      const { error: reqUpdateError } = await adminClient
        .from("account_reactivation_requests")
        .update({
          status: "rejected",
          reviewed_at: reviewTimestamp,
          reviewed_by: callerId,
          admin_remarks: adminRemarks ? adminRemarks.trim() : "Request rejected by administrator",
        })
        .eq("id", requestId);

      if (reqUpdateError) {
        console.error("Failed to update request to rejected:", reqUpdateError);
        return respond(500, { error: `Failed to update request: ${reqUpdateError.message}` });
      }

      // Insert audit log
      await adminClient.from("account_management_audit_logs").insert({
        user_id: targetUserId,
        action: "reject_reactivation",
        previous_status: "deactivated",
        new_status: "deactivated",
        performed_by: callerId,
        performer_role: "admin",
        reason: "Reactivation request rejected",
        admin_remarks: adminRemarks.trim(),
        metadata: {
          requestId,
          student_reason: reactivationRequest.reactivation_reason,
          admin_name: adminRecord.full_name,
          timestamp: reviewTimestamp,
        },
      });

      return respond(200, {
        success: true,
        message: "Reactivation request rejected.",
        requestId,
        userId: targetUserId,
        account_status: "deactivated",
      });
    }
  } catch (error) {
    console.error("Unexpected error in review-reactivation-request:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return respond(500, { error: message });
  }
});
