import { supabase } from "./supabase.js";

export function getStudentInitials(name) {
  if (!name || typeof name !== "string") return "S";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function resolveStudentAvatarUrl(avatarUrl) {
  if (typeof avatarUrl !== "string") return "";
  const trimmed = avatarUrl.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
    return trimmed;
  }

  const normalizedPath = trimmed.replace(/^\/+/, "").replace(/^avatars\//i, "");
  const { data } = supabase.storage.from("avatars").getPublicUrl(normalizedPath);
  return data?.publicUrl || "";
}

/**
 * Builds an ID -> avatar_url lookup map indexing both profile.id and profile.auth_user_id.
 */
export function buildAvatarMapFromRows(rows = []) {
  const map = {};
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!row?.avatar_url) continue;
    if (row.id) map[row.id] = row.avatar_url;
    if (row.auth_user_id) map[row.auth_user_id] = row.avatar_url;
  }
  return map;
}

/**
 * Fetches a lookup map of profile ID / auth user ID -> avatar_url for candidate lists.
 */
export async function fetchStudentAvatarMap(userIds = []) {
  const uniqueIds = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const filterValues = uniqueIds.map((id) => `"${id}"`).join(",");
  let { data, error } = await supabase
    .from("profiles")
    .select("id, auth_user_id, avatar_url")
    .or(`id.in.(${filterValues}),auth_user_id.in.(${filterValues})`);

  if (error && /column .* does not exist|could not find .* column/i.test(error.message || "")) {
    ({ data, error } = await supabase
      .from("profiles")
      .select("id, avatar_url")
      .in("id", uniqueIds));
  }

  if (error || !Array.isArray(data)) return {};
  return buildAvatarMapFromRows(data);
}
