import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { MissionHint, MissionHintInput } from "@/lib/mission-hints.types";

type DB = SupabaseClient<Database>;

export async function listMissionHints(client: DB, userId: string): Promise<MissionHint[]> {
  const { data, error } = await client
    .from("mission_hints")
    .select("match_kind, match_value, hint_text")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as MissionHint[];
}

export async function upsertMissionHint(
  client: DB,
  input: { userId: string; hint: MissionHintInput },
): Promise<void> {
  const { error } = await client.from("mission_hints").upsert(
    {
      user_id: input.userId,
      match_kind: input.hint.match_kind,
      match_value: input.hint.match_value.toLowerCase().trim(),
      hint_text: input.hint.hint_text.trim(),
    },
    { onConflict: "user_id,match_kind,match_value" },
  );
  if (error) throw error;
}
