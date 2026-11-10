import test from "node:test";
import assert from "node:assert/strict";
import { isAssignedStudentProfile } from "../src/services/staffAssignments.js";

test("isAssignedStudentProfile matches either profile.id or profile.auth_user_id strictly", () => {
  const assignedIds = ["student-1", "student-2"];

  assert.equal(
    isAssignedStudentProfile({ id: "student-1", auth_user_id: null }, assignedIds),
    true
  );
  assert.equal(
    isAssignedStudentProfile({ id: "profile-x", auth_user_id: "student-2" }, assignedIds),
    true
  );
  assert.equal(
    isAssignedStudentProfile({ id: "student-3", auth_user_id: null }, assignedIds),
    false
  );
  assert.equal(isAssignedStudentProfile({ id: "student-1" }, []), false);
  assert.equal(isAssignedStudentProfile(null, assignedIds), false);
});
