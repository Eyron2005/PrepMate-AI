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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Required Supabase Edge Function environment variables are missing.");
    return respond(500, { error: "Edge function environment is not configured." });
  }

  try {
    let body: { email?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return respond(400, { error: "The request body must be valid JSON." });
    }

    const { email, reason } = body;

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return respond(400, { error: "A valid email address is required." });
    }
    if (!reason || typeof reason !== "string" || !reason.trim() || reason.trim().length < 10) {
      return respond(400, { error: "Please provide a detailed reactivation explanation (at least 10 characters)." });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Look up user by email in auth.users using Admin API
    const cleanEmail = email.trim().toLowerCase();
    const { data: usersData, error: userSearchError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 10,
    });

    if (userSearchError) {
      console.error("Error searching for user in Auth:", userSearchError);
      return respond(500, { error: "Unable to verify registered account." });
    }

    const targetUser = usersData.users.find(
      (u) => u.email?.toLowerCase() === cleanEmail,
    );

    if (!targetUser) {
      return respond(404, { error: "No registered PrepMate account found with this email address." });
    }

    const userId = targetUser.id;

    // 2. Check profile status in public.profiles
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name, account_status")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("Error retrieving student profile:", profileError);
      return respond(500, { error: "Unable to verify student profile status." });
    }
    if (!profile) {
      return respond(404, { error: "No student profile record associated with this account." });
    }

    if (profile.account_status !== "deactivated") {
      return respond(400, {
        error: "This account is currently active. Reactivation is not required.",
        account_status: profile.account_status || "active",
      });
    }

    // 3. Prevent duplicate pending reactivation requests
    const { data: existingPending, error: pendingCheckError } = await adminClient
      .from("account_reactivation_requests")
      .select("id, submitted_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingCheckError) {
      console.error("Error checking pending reactivation requests:", pendingCheckError);
      return respond(500, { error: "Unable to check pending request status." });
    }

    if (existingPending) {
      return respond(409, {
        error: "A reactivation request is already pending review for this account. Please wait for an administrator to review it.",
        submitted_at: existingPending.submitted_at,
        requestId: existingPending.id,
      });
    }

    // 4. Insert new reactivation request
    const { data: newRequest, error: insertError } = await adminClient
      .from("account_reactivation_requests")
      .insert({
        user_id: userId,
        registered_email: cleanEmail,
        reactivation_reason: reason.trim(),
        status: "pending",
        submitted_at: new Date().toISOString(),
        email_verified_at: targetUser.email_confirmed_at || null,
      })
      .select("id, status, submitted_at")
      .single();

    if (insertError) {
      console.error("Error submitting reactivation request:", insertError);
      return respond(500, { error: `Failed to submit reactivation request: ${insertError.message}` });
    }

    return respond(201, {
      success: true,
      message: "Reactivation request submitted successfully. An administrator will review your request.",
      requestId: newRequest.id,
      status: newRequest.status,
      submitted_at: newRequest.submitted_at,
    });
  } catch (error) {
    console.error("Unexpected error in submit-reactivation-request:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return respond(500, { error: message });
  }
});
