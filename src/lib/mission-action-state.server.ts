// Server-only helpers for reading and mutating mission_action_states.
// Platform metadata only — never store fagdata (email body, Slack text, etc.).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  MissionActionState,
  MissionActionStatus,
} from "@/lib/mission-action-state";

export type { MissionActionState, MissionActionStatus } from "@/lib/mission-action-state";

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
