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
  const configuredRedirect = Deno.env.get("STAFF_INVITATION_REDIRECT_URL");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Required Supabase Edge Function environment variables are missing.");
    return respond(500, { error: "Staff invitations are not configured." });
  }

  let redirectTo = configuredRedirect;
  if (!redirectTo) {
    const requestOrigin = request.headers.get("Origin");
    if (!requestOrigin) {
      return respond(400, { error: "The staff invitation requires a configured redirect URL or browser origin." });
    }

    try {
      const originUrl = new URL(requestOrigin);
      const isLocalDevelopment =
        originUrl.protocol === "http:" &&
        (originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1");
      if (
        (originUrl.protocol !== "https:" && !isLocalDevelopment) ||
        originUrl.username ||
        originUrl.password ||
        originUrl.pathname !== "/" ||
        originUrl.search ||
        originUrl.hash
      ) {
        return respond(400, { error: "The staff invitation browser origin is invalid." });
      }
      originUrl.pathname = "/accept-staff-invitation";
      redirectTo = originUrl.toString();
    } catch {
      return respond(400, { error: "The staff invitation browser origin is invalid." });
    }
  }

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(redirectTo);
  } catch {
    console.error("STAFF_INVITATION_REDIRECT_URL is not a valid URL.");
    return respond(500, { error: "Staff invitation redirect URL is not configured correctly." });
  }
  const isLocalDevelopment =
    redirectUrl.protocol === "http:" &&
    (redirectUrl.hostname === "localhost" || redirectUrl.hostname === "127.0.0.1");
  if (
    (redirectUrl.protocol !== "https:" && !isLocalDevelopment) ||
    redirectUrl.username ||
    redirectUrl.password ||
    redirectUrl.pathname.replace(/\/+$/, "") !== "/accept-staff-invitation"
  ) {
    console.error("STAFF_INVITATION_REDIRECT_URL must be a secure URL for the acceptance route.");
    return respond(500, { error: "Staff invitation redirect URL must use HTTPS and target the acceptance page." });
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

    if (
      !fullName ||
      fullName.length > 200 ||
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return respond(400, { error: "A full name and valid email address are required." });
    }

    const { error: expireError } = await adminClient
      .from("staff_invitations")
      .update({ status: "expired" })
      .ilike("invited_email", email)
      .eq("status", "pending")
      .lte("expires_at", new Date().toISOString());
    if (expireError) {
      console.error("Unable to expire an outdated staff invitation:", expireError);
      return respond(500, { error: "Unable to check for a pending staff invitation." });
    }

    const { data: pendingInvitations, error: pendingLookupError } = await adminClient
      .from("staff_invitations")
      .select("id")
      .ilike("invited_email", email)
      .eq("status", "pending")
      .limit(1);
    if (pendingLookupError) {
      console.error("Unable to check for a pending staff invitation:", pendingLookupError);
      return respond(500, { error: "Unable to check for a pending staff invitation." });
    }
    if (pendingInvitations?.length) {
      return respond(409, { error: "A pending staff invitation already exists for this email." });
    }

    const { data: existingStaff, error: staffLookupError } = await adminClient
      .from("staff")
      .select("id")
      .ilike("email", email)
      .limit(1);
    if (staffLookupError) {
      console.error("Unable to check for an existing staff profile:", staffLookupError);
      return respond(500, { error: "Unable to check for an existing staff profile." });
    }
    if (existingStaff?.length) {
      return respond(409, { error: "A staff profile with this email already exists." });
    }

    const { data: existingAuthUser, error: authUserLookupError } = await adminClient
      .rpc("staff_invitation_auth_user_exists", { p_email: email });
    if (authUserLookupError) {
      console.error("Unable to check for an existing Auth account:", authUserLookupError);
      return respond(500, { error: "Unable to check for an existing account." });
    }
    if (existingAuthUser) {
      return respond(409, {
        error: "An account with this email already exists. The configured Supabase invitation template cannot send staff invitations to existing accounts, so no invitation was created.",
      });
    }

    const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name: fullName,
          position: position || null,
          department: department || null,
        },
        redirectTo: redirectUrl.toString(),
      },
    );
    if (inviteError || !invitation.user) {
      console.error("Unable to send Supabase staff invitation:", inviteError);
      return respond(400, { error: inviteError?.message || "Unable to send the staff invitation." });
    }

    const { data: staffId, error: staffError } = await adminClient.rpc("create_staff_invitation", {
      p_user_id: invitation.user.id,
      p_invited_by: userResult.user.id,
      p_email: email,
      p_full_name: fullName,
      p_department: department,
      p_position: position,
    });

    if (staffError || !staffId) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(invitation.user.id);
      if (cleanupError) {
        console.error("Unable to clean up the invited account after staff insert failed:", cleanupError);
        return respond(500, {
          error: "Unable to save the pending staff invitation, and the invited account could not be removed. Contact an administrator.",
        });
      }
      console.error("Unable to save the pending staff invitation:", staffError);
      return respond(500, { error: "Unable to save the pending staff invitation." });
    }

    const { data: staff, error: profileLookupError } = await adminClient
      .from("staff")
      .select("*")
      .eq("id", staffId)
      .single();
    if (profileLookupError) {
      console.error("Unable to load the pending staff profile:", profileLookupError);
      return respond(500, {
        error: "The invitation was sent, but the pending staff profile could not be loaded.",
      });
    }

    return respond(201, { staff });
  } catch (error) {
    console.error("Unexpected staff account creation error:", error);
    return respond(500, {
      error: "Unexpected staff invitation error.",
    });
  }
});
