// Client-safe types and pure helpers for mission action states.
// DB access lives in mission-action-state.server.ts.

export type MissionActionStatus = "dismissed" | "snoozed" | "handled_locally";

export type MissionActionState = {
  action_key: string;
  status: MissionActionStatus;
  snoozed_until: string | null;
};

export function filterVisibleActions<T extends { key: string }>(
  actions: T[],
  states: MissionActionState[],
  now: Date = new Date(),
): T[] {
  const byKey = new Map(states.map((s) => [s.action_key, s]));
  return actions.filter((a) => {
    const s = byKey.get(a.key);
    if (!s) return true;
    if (s.status === "dismissed" || s.status === "handled_locally") return false;
    if (s.status === "snoozed") {
      if (!s.snoozed_until) return false;
      return new Date(s.snoozed_until).getTime() <= now.getTime();
    }
    return true;
  });
}
