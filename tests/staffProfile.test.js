import test from "node:test";
import assert from "node:assert/strict";
import { resolveStaffDisplayName } from "../src/services/staffProfile.js";

test("resolveStaffDisplayName resolves staff record full_name with proper capitalization", () => {
  const result = resolveStaffDisplayName({
    staffRecord: { id: "staff-1", full_name: "MARK JOSEPH BALATBAT", email: "mark@example.com" },
    user: { id: "staff-1", email: "mark@example.com" },
  });

  assert.equal(result.displayName, "Mark Joseph Balatbat");
  assert.equal(result.initial, "M");
  assert.equal(result.roleLabel, "STAFF MEMBER");
});

test("resolveStaffDisplayName preserves alphanumeric staff names like Staff1 and avoids generic email prefixes", () => {
  const staff1 = resolveStaffDisplayName({
    staffRecord: { id: "staff-2", full_name: "Staff1", email: "staff@gmail.com" },
    user: { id: "staff-2", email: "staff@gmail.com" },
  });
  assert.equal(staff1.displayName, "Staff1");
  assert.equal(staff1.initial, "S");

  const missingRecord = resolveStaffDisplayName({
    staffRecord: null,
    user: { id: "staff-3", email: "staff@gmail.com", user_metadata: {} },
  });
  assert.equal(missingRecord.displayName, "Staff Member");
  assert.equal(missingRecord.initial, "S");
});

test("resolveStaffDisplayName rejects mismatched staff records belonging to another user", () => {
  const result = resolveStaffDisplayName({
    staffRecord: { id: "other-id", full_name: "Other Supervisor" },
    user: { id: "my-id", email: "robert@spamok.com" },
  });

  assert.equal(result.displayName, "Robert");
  assert.equal(result.initial, "R");
});
