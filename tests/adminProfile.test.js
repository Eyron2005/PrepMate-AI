import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAdminDisplayName,
  getAdminAvatarInitial,
  resolveAdminDisplayName,
  selectMatchingProfileForUser,
} from "../src/services/adminProfile.js";

test("formatAdminDisplayName formats names with proper capitalization and preserves Unicode characters", () => {
  assert.equal(formatAdminDisplayName("eron fred p. gaña"), "Eron Fred P. Gaña");
  assert.equal(formatAdminDisplayName("ERON FRED P. GAÑA"), "Eron Fred P. Gaña");
  assert.equal(formatAdminDisplayName("Eron Fred P. Gaña"), "Eron Fred P. Gaña");
  assert.equal(formatAdminDisplayName("eron"), "Eron");
  assert.equal(formatAdminDisplayName("TEST"), "Test");
  assert.equal(formatAdminDisplayName("  jane   marie   doe  "), "Jane Marie Doe");
  assert.equal(formatAdminDisplayName("anne-marie o'connor"), "Anne-Marie O'Connor");
  assert.equal(formatAdminDisplayName("john doe iii"), "John Doe III");
  assert.equal(formatAdminDisplayName("McDonald"), "McDonald");
});

test("formatAdminDisplayName rejects missing, nullish, UUID, numeric ID, and email values", () => {
  assert.equal(formatAdminDisplayName(""), "");
  assert.equal(formatAdminDisplayName("   "), "");
  assert.equal(formatAdminDisplayName(null), "");
  assert.equal(formatAdminDisplayName(undefined), "");
  assert.equal(formatAdminDisplayName("undefined"), "");
  assert.equal(formatAdminDisplayName("null"), "");
  assert.equal(formatAdminDisplayName("0c2de6be-c047-48a6-aa55-8b7a1c71882c"), "");
  assert.equal(formatAdminDisplayName("123456"), "");
  assert.equal(formatAdminDisplayName("admin@prepmate.site"), "");
});

test("getAdminAvatarInitial derives uppercase initial from administrator's first name", () => {
  assert.equal(getAdminAvatarInitial("Eron Fred P. Gaña"), "E");
  assert.equal(getAdminAvatarInitial("Test"), "T");
  assert.equal(getAdminAvatarInitial("álvaro gomez"), "Á");
  assert.equal(getAdminAvatarInitial(""), "A");
  assert.equal(getAdminAvatarInitial(null), "A");
});

test("selectMatchingProfileForUser prioritizes auth_user_id and prevents cross-user leakage", () => {
  const userId = "0c2de6be-c047-48a6-aa55-8b7a1c71882c";
  const otherUserId = "9247d3a8-f4a9-4b7c-881a-7abb361f864f";

  // Linked via auth_user_id where profile.id differs from auth.user.id
  const rows = [
    { id: "11111111-1111-1111-1111-111111111111", auth_user_id: otherUserId, full_name: "Wrong User", email: "other@example.com" },
    { id: "22222222-2222-2222-2222-222222222222", auth_user_id: userId, full_name: "Eron Fred P. Gaña", email: "eronfrd@gmail.com" },
  ];

  const match = selectMatchingProfileForUser(rows, userId, "eronfrd@gmail.com");
  assert.equal(match?.full_name, "Eron Fred P. Gaña");

  // Rejects row belonging to a different auth_user_id even if email were duplicated in test data
  const mismatchedRows = [
    { id: "33333333-3333-3333-3333-333333333333", auth_user_id: otherUserId, full_name: "Other User", email: "eronfrd@gmail.com" },
  ];
  assert.equal(selectMatchingProfileForUser(mismatchedRows, userId, "eronfrd@gmail.com"), null);
});

test("resolveAdminDisplayName resolves logged-in admin record, linked profile, and session metadata accurately", () => {
  const userA = {
    id: "0c2de6be-c047-48a6-aa55-8b7a1c71882c",
    email: "eronfrd@gmail.com",
    user_metadata: { full_name: "eron" },
  };

  // Reads from admins table when full name is stored there
  const fromAdminRecord = resolveAdminDisplayName({
    adminRecord: { id: userA.id, full_name: "Eron Fred P. Gaña" },
    user: userA,
  });
  assert.equal(fromAdminRecord.displayName, "Eron Fred P. Gaña");
  assert.equal(fromAdminRecord.initial, "E");
  assert.equal(fromAdminRecord.roleLabel, "ADMIN");

  // Prefers fuller multi-word name from verified profile when admin record holds single short token
  const fromFullerProfile = resolveAdminDisplayName({
    adminRecord: { id: userA.id, full_name: "eron" },
    profileRecord: { id: "profile-uuid-diff", auth_user_id: userA.id, full_name: "eron fred p. gaña", email: userA.email },
    user: userA,
  });
  assert.equal(fromFullerProfile.displayName, "Eron Fred P. Gaña");
  assert.equal(fromFullerProfile.initial, "E");
  assert.equal(fromFullerProfile.roleLabel, "ADMIN");

  // Switching to second admin account resolves that admin's name cleanly
  const userB = {
    id: "9247d3a8-f4a9-4b7c-881a-7abb361f864f",
    email: "test@gmail.com",
    user_metadata: {},
  };
  const secondAdmin = resolveAdminDisplayName({
    adminRecord: { id: userB.id, full_name: "TEST" },
    user: userB,
  });
  assert.equal(secondAdmin.displayName, "Test");
  assert.equal(secondAdmin.initial, "T");
  assert.equal(secondAdmin.roleLabel, "ADMIN");
});

test("resolveAdminDisplayName never leaks mismatched records, raw IDs, or nullish strings", () => {
  const currentUser = {
    id: "0c2de6be-c047-48a6-aa55-8b7a1c71882c",
    email: "jane.doe@prepmate.site",
    user_metadata: {},
  };

  // Mismatched adminRecord or profileRecord IDs are ignored safely
  const mismatched = resolveAdminDisplayName({
    adminRecord: { id: "99999999-9999-9999-9999-999999999999", full_name: "Someone Else" },
    profileRecord: { id: "88888888-8888-8888-8888-888888888888", auth_user_id: "99999999-9999-9999-9999-999999999999", full_name: "Other Profile" },
    user: currentUser,
  });
  assert.equal(mismatched.displayName, "Jane Doe");
  assert.equal(mismatched.initial, "J");
  assert.equal(mismatched.roleLabel, "ADMIN");

  // Completely missing info handles gracefully without undefined/null/IDs
  const emptyUser = {
    id: "0c2de6be-c047-48a6-aa55-8b7a1c71882c",
    email: "admin@prepmate.site",
    user_metadata: { full_name: "null" },
  };
  const graceful = resolveAdminDisplayName({
    adminRecord: { id: emptyUser.id, full_name: "0c2de6be-c047-48a6-aa55-8b7a1c71882c" },
    profileRecord: null,
    user: emptyUser,
  });
  assert.equal(graceful.displayName, "Admin Account");
  assert.equal(graceful.initial, "A");
  assert.equal(graceful.roleLabel, "ADMIN");
});
