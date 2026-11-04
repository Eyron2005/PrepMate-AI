import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const authTabId = typeof window === "undefined"
  ? "server"
  : window.sessionStorage.getItem("prepmate-auth-tab-id") || window.crypto.randomUUID();

if (typeof window !== "undefined" && !window.sessionStorage.getItem("prepmate-auth-tab-id")) {
  window.sessionStorage.setItem("prepmate-auth-tab-id", authTabId);
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      storageKey: `prepmate-auth-${authTabId}`,
      persistSession: true,
      autoRefreshToken: true,
      storage: typeof window === "undefined" ? undefined : window.sessionStorage,
    },
  },
);