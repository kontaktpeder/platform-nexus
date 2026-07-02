// Server-only helpers for reading and mutating mission_action_states.
// Platform metadata only — never store fagdata (email body, Slack text, etc.).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type MissionActionStatus = "dismissed" | "snoozed" | "handled_locally";

export type MissionActionState = {
  action_key: string;
  status: MissionActionStatus;
  snoozed_until: string | null;
};

type DB = SupabaseClient<Database>;

export async function listMissionActionStates(
  client: DB,
  userId: string,
): Promise<MissionActionState[]> {
  const { data, error } = await client
    .from("mission_action_states")
    .select("action_key, status, snoozed_until")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as MissionActionState[];
}

export async function upsertMissionActionState(
  client: DB,
  input: {
    userId: string;
    actionKey: string;
    status: MissionActionStatus;
    snoozedUntil?: Date | null;
  },
): Promise<void> {
  const { error } = await client
    .from("mission_action_states")
    .upsert(
      {
        user_id: input.userId,
        action_key: input.actionKey,
        status: input.status,
        snoozed_until: input.snoozedUntil ? input.snoozedUntil.toISOString() : null,
      },
      { onConflict: "user_id,action_key" },
    );
  if (error) throw error;
}

export async function deleteMissionActionState(
  client: DB,
  input: { userId: string; actionKey: string },
): Promise<void> {
  const { error } = await client
    .from("mission_action_states")
    .delete()
    .eq("user_id", input.userId)
    .eq("action_key", input.actionKey);
  if (error) throw error;
}

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

