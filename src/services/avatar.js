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
