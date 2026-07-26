import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { osloWeekKey, osloWeekNumber } from "@/lib/oslo-week";
import {
  emptyWeeklyPlanPayload,
  normalizeWeeklyPlanPayload,
  type WeeklyPlan,
  type WeeklyPlanPayload,
} from "@/lib/weekly-plan.types";

type DB = SupabaseClient<Database>;

export function currentWeekLabel(date = new Date()): string {
  const key = osloWeekKey(date);
  const m = /^(\d{4})-W(\d+)$/.exec(key);
  if (m) return `Uke ${m[2]} · ${m[1]}`;
  return `Uke ${osloWeekNumber(date)}`;
}

export async function getWeeklyPlan(
  client: DB,
  userId: string,
  weekKey = osloWeekKey(),
): Promise<WeeklyPlan> {
  const { data, error } = await client
    .from("weekly_plans")
    .select("payload, updated_at, week_key")
    .eq("user_id", userId)
    .eq("week_key", weekKey)
    .maybeSingle();

  if (error) throw error;

  return {
    weekKey,
    weekLabel: currentWeekLabel(),
    payload: data?.payload
      ? normalizeWeeklyPlanPayload(data.payload)
      : emptyWeeklyPlanPayload(),
    updatedAt: (data?.updated_at as string | undefined) ?? null,
  };
}

export async function saveWeeklyPlan(
  client: DB,
  input: {
    userId: string;
    weekKey: string;
    payload: WeeklyPlanPayload;
  },
): Promise<WeeklyPlan> {
  const payload = normalizeWeeklyPlanPayload(input.payload);
  const { data, error } = await client
    .from("weekly_plans")
    .upsert(
      {
        user_id: input.userId,
        week_key: input.weekKey,
        payload: payload as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,week_key" },
    )
    .select("payload, updated_at, week_key")
    .single();

  if (error) throw error;

  return {
    weekKey: data.week_key as string,
    weekLabel: currentWeekLabel(),
    payload: normalizeWeeklyPlanPayload(data.payload),
    updatedAt: (data.updated_at as string) ?? null,
  };
}
