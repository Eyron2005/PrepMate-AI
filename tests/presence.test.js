import assert from "node:assert/strict";
import test from "node:test";
import {
  getPresenceConnectionCounts,
  isPresenceRecentlyOnline,
  PRESENCE_CLOCK_SKEW_MS,
  ONLINE_THRESHOLD_MS,
} from "../src/services/presence.js";

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

test("online status expires after the activity window", () => {
  const now = Date.parse("2026-11-05T12:00:00.000Z");

  assert.equal(isPresenceRecentlyOnline(new Date(now - 1000).toISOString(), now), true);
  assert.equal(isPresenceRecentlyOnline(new Date(now + 1000).toISOString(), now), true);
  assert.equal(
    isPresenceRecentlyOnline(new Date(now + PRESENCE_CLOCK_SKEW_MS).toISOString(), now),
    false,
  );
  assert.equal(
    isPresenceRecentlyOnline(new Date(now - ONLINE_THRESHOLD_MS).toISOString(), now),
    false,
  );
  assert.equal(isPresenceRecentlyOnline(null, now), false);
});
