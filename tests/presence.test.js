import assert from "node:assert/strict";
import test from "node:test";
import { getPresenceConnectionCounts } from "../src/services/presence.js";

test("presence counts connections per authenticated user, not per connection", () => {
  const connectionCounts = getPresenceConnectionCounts({
    "admin-user-id": [{ connection_id: "tab-a" }, { connection_id: "tab-b" }],
    "staff-user-id": [{ connection_id: "tab-c" }],
  });

  assert.deepEqual(connectionCounts, {
    "admin-user-id": 2,
    "staff-user-id": 1,
  });
});

test("a user with no remaining connections is not present", () => {
  assert.deepEqual(
    getPresenceConnectionCounts({
      "admin-user-id": [],
      "staff-user-id": [{ connection_id: "tab-c" }],
    }),
    { "staff-user-id": 1 },
  );
});
