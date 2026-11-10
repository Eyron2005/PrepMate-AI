import { supabase } from "./supabase.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_ID_REGEX = /^\d+$/;
const HEX_ID_REGEX = /^[0-9a-f]{24,}$/i;
const PREFIXED_ID_REGEX = /^(?:user|usr|adm|admin|staff|id)[_-]?[0-9a-f]{4,}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROMAN_NUMERAL_REGEX = /^(ii|iii|iv|vi|vii|viii|ix)$/i;

const GENERIC_PLACEHOLDERS = new Set([
  "admin",
  "administrator",
  "super admin",
  "superadmin",
  "admin user",
  "admin account",
  "portal admin",
  "staff",
  "staff member",
  "user",
]);

const INVALID_LITERALS = new Set(["null", "undefined", "nan", "none", "n/a", "na", "unknown"]);

// Cache resolved display profiles strictly per authenticated user ID for smooth route transitions
const adminProfileCache = new Map();

function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Checks whether a candidate string is an empty/nullish literal, database ID, or email.
 */
export function isInvalidNameValue(value) {
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  if (INVALID_LITERALS.has(lower)) return true;
  if (UUID_REGEX.test(trimmed)) return true;
  if (NUMERIC_ID_REGEX.test(trimmed)) return true;
  if (HEX_ID_REGEX.test(trimmed)) return true;
  if (PREFIXED_ID_REGEX.test(trimmed)) return true;
  if (EMAIL_REGEX.test(trimmed)) return true;

  return false;
}

/**
 * Checks whether a cleaned name string is only a generic role placeholder rather than a person's name.
 */
export function isGenericRoleLabel(value) {
  if (typeof value !== "string") return false;
  return GENERIC_PLACEHOLDERS.has(value.trim().toLowerCase());
}

function formatNameSegment(segment) {
  if (!segment) return "";
  const chars = Array.from(segment);
  const firstChar = chars[0];
  const restStr = chars.slice(1).join("");

  const hasUpper = /\p{Lu}/u.test(segment);
  const hasLower = /\p{Ll}/u.test(segment);

  if (hasUpper && hasLower) {
    // Preserve intentional mixed case (e.g. "McDonald", "DeLaCruz", "Gaña")
    // while fixing inverted CapsLock typos (e.g. "eRON")
    const firstIsUpper = /\p{Lu}/u.test(firstChar);
    const restAllUpper = restStr.length > 0 && /^\p{Lu}+$/u.test(restStr);
    if (firstIsUpper && !restAllUpper) {
      return segment;
    }
  }

  return firstChar.toLocaleUpperCase() + restStr.toLocaleLowerCase();
}

function formatSingleWord(word, index) {
  if (!word) return "";

  if (index > 0 && ROMAN_NUMERAL_REGEX.test(word)) {
    return word.toLocaleUpperCase();
  }

  // Split by hyphens or apostrophes while preserving delimiters and handling Unicode characters
  return word
    .split(/([-'’])/)
    .map((part) => (part === "-" || part === "'" || part === "’" ? part : formatNameSegment(part)))
    .join("");
}

/**
 * Formats a person's full name using Unicode-safe proper capitalization.
 * Returns "" if the value is missing, invalid, or represents a database ID.
 */
export function formatAdminDisplayName(rawName) {
  if (isInvalidNameValue(rawName)) return "";
  const normalized = rawName.trim().replace(/\s+/g, " ");
  const words = normalized.split(" ");
  return words.map((word, index) => formatSingleWord(word, index)).join(" ");
}

/**
 * Generates an uppercase avatar initial from the administrator's first name.
 */
export function getAdminAvatarInitial(displayName) {
  if (typeof displayName !== "string" || !displayName.trim()) {
    return "A";
  }

  const firstWord = displayName.trim().split(/\s+/)[0] || "";
  const firstAlnum = firstWord.match(/[\p{L}\p{N}]/u)?.[0];
  return firstAlnum ? firstAlnum.toLocaleUpperCase() : "A";
}

export function extractMetadataFullName(user) {
  const meta = user?.user_metadata;
  if (!meta || typeof meta !== "object") return "";

  const firstLast = [meta.first_name, meta.middle_name, meta.last_name]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ");

  const candidates = [
    meta.full_name,
    meta.display_name,
    meta.name,
    firstLast,
  ];

  for (const candidate of candidates) {
    if (!isInvalidNameValue(candidate) && !isGenericRoleLabel(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (!isInvalidNameValue(candidate)) {
      return candidate;
    }
  }

  return "";
}

function formatEmailLocalPart(email) {
  if (typeof email !== "string" || !email.includes("@")) return "";
  const localPart = email.split("@")[0]?.trim() || "";
  if (!localPart || NUMERIC_ID_REGEX.test(localPart)) return "";

  const words = localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  if (!words || isGenericRoleLabel(words) || isInvalidNameValue(words)) {
    return "";
  }

  return formatAdminDisplayName(words);
}

/**
 * Selects the profile row that genuinely belongs to the authenticated user,
 * accounting for schemas where profiles link via auth_user_id, id, or exact email.
 */
export function selectMatchingProfileForUser(profileRows, userId, userEmail) {
  if (!Array.isArray(profileRows) || profileRows.length === 0 || !userId) {
    return null;
  }

  const normalizedEmail = typeof userEmail === "string" ? userEmail.trim().toLowerCase() : "";

  const byAuthUserId = profileRows.find((row) => row?.auth_user_id === userId);
  if (byAuthUserId) return byAuthUserId;

  const byProfileId = profileRows.find((row) => row?.id === userId);
  if (byProfileId) return byProfileId;

  if (normalizedEmail) {
    const byEmail = profileRows.find(
      (row) =>
        typeof row?.email === "string" &&
        row.email.trim().toLowerCase() === normalizedEmail &&
        (!row.auth_user_id || row.auth_user_id === userId)
    );
    if (byEmail) return byEmail;
  }

  return null;
}

function buildNameCandidate(rawValue) {
  const formatted = formatAdminDisplayName(rawValue);
  if (!formatted) return null;
  const wordCount = formatted.split(/\s+/).filter(Boolean).length;
  return {
    formatted,
    isGeneric: isGenericRoleLabel(formatted),
    wordCount,
  };
}

/**
 * Resolves the currently authenticated administrator's display name cleanly
 * across verified admin record, linked user profile, and auth session metadata.
 */
export function resolveAdminDisplayName({ adminRecord = null, profileRecord = null, user = null } = {}) {
  const userId = user?.id || null;
  const userEmail = user?.email || "";

  // Verify admin record corresponds to the authenticated user
  const safeAdminRecord =
    adminRecord && (!adminRecord.id || !userId || adminRecord.id === userId)
      ? adminRecord
      : null;

  // Verify profile record belongs to the authenticated user (never another user's profile)
  const safeProfileRecord = profileRecord
    ? selectMatchingProfileForUser([profileRecord], userId, userEmail)
    : null;

  const adminCandidate = buildNameCandidate(safeAdminRecord?.full_name);
  const profileCandidate = buildNameCandidate(safeProfileRecord?.full_name);
  const metaCandidate = buildNameCandidate(extractMetadataFullName(user));

  const specificCandidates = [adminCandidate, profileCandidate, metaCandidate].filter(
    (c) => c && !c.isGeneric
  );

  let chosenName;
  if (specificCandidates.length > 0) {
    // Prefer the authoritative admin record unless a verified profile or session metadata
    // provides a fuller multi-word name while the admin record only stores a single short token.
    const primary = specificCandidates[0];
    const fullerProfile =
      profileCandidate && !profileCandidate.isGeneric && primary.wordCount === 1 && profileCandidate.wordCount > 1
        ? profileCandidate
        : null;
    const fullerMeta =
      metaCandidate && !metaCandidate.isGeneric && primary.wordCount === 1 && metaCandidate.wordCount > 1
        ? metaCandidate
        : null;

    chosenName = (fullerProfile || fullerMeta || primary).formatted;
  } else {
    chosenName = formatEmailLocalPart(userEmail);
  }

  const displayName = chosenName || "Admin Account";
  return {
    displayName,
    initial: getAdminAvatarInitial(displayName),
    roleLabel: "ADMIN",
  };
}

/**
 * Synchronously reads a previously cached profile for the exact authenticated user ID.
 */
export function getCachedAdminProfile(userId, userEmail = "") {
  if (!userId) return null;
  const cached = adminProfileCache.get(userId);
  if (!cached) return null;

  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  if (normalizedEmail && cached.email && cached.email !== normalizedEmail) {
    adminProfileCache.delete(userId);
    return null;
  }

  return {
    displayName: cached.displayName,
    initial: cached.initial,
    roleLabel: "ADMIN",
  };
}

/**
 * Clears cached admin profile details (e.g., on sign out or account switch).
 */
export function clearAdminProfileCache(userId) {
  if (userId) {
    adminProfileCache.delete(userId);
  } else {
    adminProfileCache.clear();
  }
}

/**
 * Fetches and resolves the currently authenticated administrator's profile
 * from Supabase (`admins`, `profiles`, and the active Auth session).
 */
export async function fetchCurrentAdminProfile(session) {
  const user = session?.user;
  const userId = user?.id;
  const userEmail = (user?.email || "").trim();

  if (!userId) {
    clearAdminProfileCache();
    return {
      displayName: "Admin Account",
      initial: "A",
      roleLabel: "ADMIN",
    };
  }

  const isValidUuid = UUID_REGEX.test(userId);

  const [adminQueryResult, profileByUserQueryResult] = await Promise.allSettled([
    supabase
      .from("admins")
      .select("id, full_name, role")
      .eq("id", userId)
      .maybeSingle(),
    isValidUuid
      ? supabase
          .from("profiles")
          .select("id, auth_user_id, full_name, email")
          .or(`auth_user_id.eq.${userId},id.eq.${userId}`)
          .limit(3)
      : supabase
          .from("profiles")
          .select("id, auth_user_id, full_name, email")
          .eq("id", userId)
          .limit(2),
  ]);

  const adminRecord =
    adminQueryResult.status === "fulfilled" && !adminQueryResult.value.error
      ? adminQueryResult.value.data
      : null;

  const profileRowsByUser =
    profileByUserQueryResult.status === "fulfilled" && !profileByUserQueryResult.value.error
      ? profileByUserQueryResult.value.data || []
      : [];

  let profileRecord = selectMatchingProfileForUser(profileRowsByUser, userId, userEmail);

  // If no profile was linked via auth_user_id or id, safely check exact email fallback
  // without trusting rows owned by a different auth_user_id.
  if (!profileRecord && userEmail) {
    try {
      const { data: emailRows, error: emailError } = await supabase
        .from("profiles")
        .select("id, auth_user_id, full_name, email")
        .ilike("email", escapeLikePattern(userEmail))
        .limit(5);

      if (!emailError && emailRows?.length) {
        profileRecord = selectMatchingProfileForUser(emailRows, userId, userEmail);
      }
    } catch (err) {
      console.warn("Unable to check admin profile email fallback:", err);
    }
  }

  const resolved = resolveAdminDisplayName({
    adminRecord,
    profileRecord,
    user,
  });

  adminProfileCache.set(userId, {
    ...resolved,
    email: userEmail.toLowerCase(),
  });

  return resolved;
}
