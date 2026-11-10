import { createClient } from "npm:@supabase/supabase-js@2";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifySvixSignature(
  rawBody: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const tsNum = Number(svixTimestamp);
  if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) {
    return false;
  }

  const secretPart = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = base64ToUint8Array(secretPart);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expectedSig = uint8ArrayToBase64(new Uint8Array(sigBuffer));

  const signatures = svixSignature.split(" ");
  for (const sigEntry of signatures) {
    const [, value] = sigEntry.split(",");
    if (value && constantTimeEquals(value, expectedSig)) {
      return true;
    }
  }
  return false;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server environment missing." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await request.text();

    if (webhookSecret) {
      const verified = await verifySvixSignature(rawBody, request.headers, webhookSecret);
      if (!verified) {
        return new Response(JSON.stringify({ error: "Invalid webhook signature." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const event = JSON.parse(rawBody || "{}") as {
      type?: string;
      created_at?: string;
      data?: {
        email_id?: string;
        bounce?: { message?: string };
      };
    };

    const eventType = typeof event.type === "string" ? event.type.toLowerCase() : "";
    const emailId = typeof event.data?.email_id === "string" ? event.data.email_id.trim() : "";

    if (!emailId) {
      return new Response(JSON.stringify({ ignored: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const nowIso = new Date().toISOString();

    if (eventType === "email.delivered") {
      await adminClient
        .from("student_email_logs")
        .update({
          status: "delivered",
          delivered_at: event.created_at || nowIso,
          provider_response: event,
          updated_at: nowIso,
        })
        .eq("provider_message_id", emailId);
    } else if (eventType === "email.bounced") {
      await adminClient
        .from("student_email_logs")
        .update({
          status: "bounced",
          bounced_at: event.created_at || nowIso,
          error_message: event.data?.bounce?.message || "Recipient mail server bounced email.",
          provider_response: event,
          updated_at: nowIso,
        })
        .eq("provider_message_id", emailId);
    } else if (eventType === "email.complained" || eventType === "email.failed") {
      await adminClient
        .from("student_email_logs")
        .update({
          status: "failed",
          error_message: `Webhook event: ${eventType}`,
          provider_response: event,
          updated_at: nowIso,
        })
        .eq("provider_message_id", emailId);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error processing Resend webhook:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Webhook error" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
