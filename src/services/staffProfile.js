import { supabase } from "./supabase.js";
import {
  extractMetadataFullName,
  formatAdminDisplayName,
  getAdminAvatarInitial,
  isGenericRoleLabel,
  isInvalidNameValue,
} from "./adminProfile.js";

const staffProfileCache = new Map();

function formatStaffEmailFallback(email) {
  if (typeof email !== "string" || !email.includes("@")) return "";
  const localPart = email.split("@")[0]?.trim() || "";
  if (!localPart || /^\d+$/.test(localPart)) return "";
  const words = localPart.replace(/[._-]+/g, " ").trim().replace(/\s+/g, " ");
  if (!words || isGenericRoleLabel(words) || isInvalidNameValue(words)) {
    return "";
  }
  return formatAdminDisplayName(words);
}

/**
 * Resolves the currently authenticated staff supervisor's display name cleanly
 * across verified `public.staff` record, session metadata, and non-generic email fallback.
 */
export function resolveStaffDisplayName({ staffRecord = null, user = null } = {}) {
  const userId = user?.id || null;
  const userEmail = user?.email || "";

  const safeStaffRecord =
    staffRecord && (!staffRecord.id || !userId || staffRecord.id === userId)
      ? staffRecord
      : null;

  const staffNameFormatted = formatAdminDisplayName(safeStaffRecord?.full_name);
  const metaNameFormatted = formatAdminDisplayName(extractMetadataFullName(user));

  const chosenName =
    (staffNameFormatted && !isGenericRoleLabel(staffNameFormatted) ? staffNameFormatted : "") ||
    (metaNameFormatted && !isGenericRoleLabel(metaNameFormatted) ? metaNameFormatted : "") ||
    formatStaffEmailFallback(safeStaffRecord?.email || userEmail) ||
    "Staff Member";

  return {
    displayName: chosenName,
    initial: getAdminAvatarInitial(chosenName) || "S",
    roleLabel: "STAFF MEMBER",
    position: safeStaffRecord?.position || "",
    department: safeStaffRecord?.department || "",
  };
}

export function getCachedStaffProfile(userId, userEmail = "") {
  if (!userId) return null;
  const cached = staffProfileCache.get(userId);
  if (!cached) return null;

  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  if (normalizedEmail && cached.email && cached.email !== normalizedEmail) {
    staffProfileCache.delete(userId);
    return null;
  }

  return {
    displayName: cached.displayName,
    initial: cached.initial,
    roleLabel: "STAFF MEMBER",
    position: cached.position || "",
    department: cached.department || "",
  };
}

export function clearStaffProfileCache(userId) {
  if (userId) {
    staffProfileCache.delete(userId);
  } else {
    staffProfileCache.clear();
  }
}

/**
 * Fetches and caches the currently authenticated staff member's profile from `public.staff`.
 */
export async function fetchCurrentStaffProfile(session) {
  const user = session?.user;
  const userId = user?.id;
  const userEmail = (user?.email || "").trim();

  if (!userId) {
    clearStaffProfileCache();
    return {
      displayName: "Staff Member",
      initial: "S",
      roleLabel: "STAFF MEMBER",
      position: "",
      department: "",
    };
  }

  let staffRecord = null;
  try {
    const { data, error } = await supabase
      .from("staff")
      .select("id, full_name, email, position, department")
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) {
      staffRecord = data;
    }
  } catch (err) {
    console.warn("Unable to query staff profile:", err);
  }

  const resolved = resolveStaffDisplayName({ staffRecord, user });
  staffProfileCache.set(userId, {
    ...resolved,
    email: userEmail.toLowerCase(),
  });

  return resolved;
}
