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
    return respond(401, { error: "A valid sign-in is required." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Required Supabase Edge Function environment variables are missing.");
    return respond(500, { error: "Staff account creation is not configured." });
  }

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userResult, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userResult.user) {
      return respond(401, { error: "Your session is invalid or expired. Please sign in again." });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: adminRecord, error: adminError } = await adminClient
      .from("admins")
      .select("id, is_active")
      .eq("id", userResult.user.id)
      .maybeSingle();

    if (adminError) {
      console.error("Unable to verify administrator access:", adminError);
      return respond(500, { error: "Unable to verify administrator access." });
    }
    if (!adminRecord || adminRecord.is_active === false) {
      return respond(403, { error: "Administrator access is required to create staff accounts." });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return respond(400, { error: "The request body must be valid JSON." });
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return respond(400, { error: "The request body must be a JSON object." });
    }

    const values = payload as Record<string, unknown>;
    const fullName = typeof values.full_name === "string" ? values.full_name.trim() : "";
    const email = typeof values.email === "string" ? values.email.trim().toLowerCase() : "";
    const department = typeof values.department === "string" ? values.department.trim() : "";
    const position = typeof values.position === "string" ? values.position.trim() : "";

    if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(400, { error: "A full name and valid email address are required." });
    }

    const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { data: { full_name: fullName } },
    );
    if (inviteError || !invitation.user) {
      console.error("Unable to invite staff account:", inviteError);
      return respond(400, { error: inviteError?.message || "Unable to create the staff account." });
    }

    const { data: staff, error: staffError } = await adminClient
      .from("staff")
      .insert({
        id: invitation.user.id,
        full_name: fullName,
        email,
        department: department || null,
        position: position || null,
      })
      .select()
      .single();

    if (staffError) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(invitation.user.id);
      if (cleanupError) {
        console.error("Unable to clean up the invited account after staff insert failed:", cleanupError);
        return respond(500, {
          error: `Unable to save the staff profile, and the invited account could not be removed: ${staffError.message}; ${cleanupError.message}`,
        });
      }
      return respond(500, { error: `Unable to save the staff profile: ${staffError.message}` });
    }

    return respond(201, { staff });
  } catch (error) {
    console.error("Unexpected staff account creation error:", error);
    return respond(500, {
      error: error instanceof Error ? error.message : "Unexpected staff account creation error.",
    });
  }
});
