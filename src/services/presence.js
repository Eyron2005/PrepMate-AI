export const PRESENCE_TOPIC = "prepmate-admin-presence";
export const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
export const PRESENCE_CLOCK_SKEW_MS = 60 * 1000;

export function getPresenceConnectionCounts(presenceState) {
  return Object.fromEntries(
    Object.entries(presenceState).flatMap(([userId, connections]) =>
      connections.length > 0 ? [[userId, connections.length]] : [],
    ),
  );
}

export function isPresenceRecentlyOnline(lastOnlineAt, now = Date.now()) {
  if (!lastOnlineAt) return false;

  const timestamp = new Date(lastOnlineAt).getTime();
  const age = now - timestamp;
  return Number.isFinite(timestamp)
    && age > -PRESENCE_CLOCK_SKEW_MS
    && age < ONLINE_THRESHOLD_MS;
}
