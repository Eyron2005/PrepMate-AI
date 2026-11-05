import { supabase } from "./supabase";

export async function clearProfileOnlineStatus(userId) {
  const { error } = await supabase
    .from("profiles")
    .update({ last_online: null })
    .or(`id.eq.${userId},auth_user_id.eq.${userId}`);

  if (error) throw error;
}
