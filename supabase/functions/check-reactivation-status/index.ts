import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Required Supabase Edge Function environment variables are missing.");
    return respond(500, { error: "Edge function environment is not configured." });
  }

  try {
    let email: string | undefined;
    let requestId: string | undefined;

    if (request.method === "POST") {
      try {
        const body = await request.json();
        email = body.email;
        requestId = body.requestId;
      } catch {
        return respond(400, { error: "The request body must be valid JSON." });
      }
    } else if (request.method === "GET") {
      const url = new URL(request.url);
      email = url.searchParams.get("email") || undefined;
      requestId = url.searchParams.get("requestId") || undefined;
    } else {
      return respond(405, { error: "Method not allowed." });
    }

    if (!email && !requestId) {
      return respond(400, { error: "Please provide either an email or requestId to check." });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let query = adminClient
      .from("account_reactivation_requests")
      .select("id, user_id, registered_email, status, submitted_at, reviewed_at, admin_remarks")
      .order("submitted_at", { ascending: false })
      .limit(1);

    if (requestId) {
      query = query.eq("id", requestId);
    } else if (email) {
      query = query.ilike("registered_email", email.trim().toLowerCase());
    }

    const { data: requests, error: requestError } = await query;
    if (requestError) {
      console.error("Database query error:", requestError);
      return respond(500, { error: "Unable to retrieve request status." });
    }

    const latestRequest = requests?.[0];

    // If user_id is found, also check actual profile account_status
    let accountStatus = "unknown";
    if (latestRequest?.user_id) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("account_status")
        .eq("id", latestRequest.user_id)
        .maybeSingle();

      if (profile) {
        accountStatus = profile.account_status || "active";
      }
    }

    return respond(200, {
      hasRequest: Boolean(latestRequest),
      accountStatus,
      request: latestRequest || null,
      message: !latestRequest
        ? "No reactivation request found."
        : latestRequest.status === "pending"
        ? "Your request is currently pending review by an administrator."
        : latestRequest.status === "approved"
        ? "Your reactivation request has been approved. You may now log in."
        : `Your reactivation request was rejected: ${latestRequest.admin_remarks || "Contact administrator for details."}`,
    });
  } catch (error) {
    console.error("Unexpected error in check-reactivation-status:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return respond(500, { error: message });
  }
});
