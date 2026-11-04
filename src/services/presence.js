export const PRESENCE_TOPIC = "prepmate-admin-presence";

export function getPresenceConnectionCounts(presenceState) {
  return Object.fromEntries(
    Object.entries(presenceState).flatMap(([userId, connections]) =>
      connections.length > 0 ? [[userId, connections.length]] : [],
    ),
  );
}
