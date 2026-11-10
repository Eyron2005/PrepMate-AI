import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAvatarMapFromRows,
  fetchStudentAvatarMap,
  getStudentInitials,
  resolveStudentAvatarUrl,
} from "../src/services/avatar.js";

test("getStudentInitials generates clean initials from student names with fallback", () => {
  assert.equal(getStudentInitials("Mark Joseph Balatbat"), "MB");
  assert.equal(getStudentInitials("Robert"), "RO");
  assert.equal(getStudentInitials(""), "S");
  assert.equal(getStudentInitials(null), "S");
});

test("resolveStudentAvatarUrl keeps HTTP URLs and resolves relative avatars bucket paths", () => {
  const fullUrl =
    "https://gfwlgojgpotnpmhtdrtz.supabase.co/storage/v1/object/public/avatars/384f68dd-beb3-4b5f-95d7-1ef6b700801a/avatar.jpg";
  assert.equal(resolveStudentAvatarUrl(fullUrl), fullUrl);

  const fromRelative = resolveStudentAvatarUrl("384f68dd-beb3-4b5f-95d7-1ef6b700801a/avatar.jpg");
  assert.equal(
    fromRelative,
    "https://gfwlgojgpotnpmhtdrtz.supabase.co/storage/v1/object/public/avatars/384f68dd-beb3-4b5f-95d7-1ef6b700801a/avatar.jpg"
  );

  const fromPrefixed = resolveStudentAvatarUrl("/avatars/384f68dd-beb3-4b5f-95d7-1ef6b700801a/avatar.jpg");
  assert.equal(
    fromPrefixed,
    "https://gfwlgojgpotnpmhtdrtz.supabase.co/storage/v1/object/public/avatars/384f68dd-beb3-4b5f-95d7-1ef6b700801a/avatar.jpg"
  );

  assert.equal(resolveStudentAvatarUrl(""), "");
  assert.equal(resolveStudentAvatarUrl(null), "");
});

test("buildAvatarMapFromRows indexes id and auth_user_id and skips missing avatar_url", async () => {
  const map = buildAvatarMapFromRows([
    { id: "p-1", auth_user_id: "u-1", avatar_url: "https://example.com/a.jpg" },
    { id: "p-2", auth_user_id: null, avatar_url: null },
  ]);
  assert.equal(map["p-1"], "https://example.com/a.jpg");
  assert.equal(map["u-1"], "https://example.com/a.jpg");
  assert.equal(map["p-2"], undefined);

  assert.deepEqual(await fetchStudentAvatarMap([]), {});
});
