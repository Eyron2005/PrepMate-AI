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

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return respond(401, { error: "Sign in using the invitation link before accepting it." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("Required staff invitation acceptance environment variables are missing.");
    return respond(500, { error: "Staff invitation acceptance is not configured." });
  }

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userResult, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userResult.user) {
      return respond(401, { error: "Your session is invalid or expired. Open the invitation link again." });
    }

    const { data, error } = await createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }).rpc("accept_staff_invitation");

    if (error) {
      console.error("Unable to accept staff invitation:", error);
      return respond(400, { error: error.message });
    }
    if (data === "expired") {
      return respond(410, { error: "This staff invitation has expired. Ask an administrator to send a new invitation." });
    }
    if (data !== "accepted") {
      console.error("Staff invitation acceptance returned an unexpected result:", data);
      return respond(500, { error: "The staff invitation could not be confirmed." });
    }

    return respond(200, { accepted: true });
  } catch (error) {
    console.error("Unexpected staff invitation acceptance error:", error);
    return respond(500, {
      error: error instanceof Error ? error.message : "Unexpected invitation acceptance error.",
    });
  }
});
