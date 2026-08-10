/**
 * Daily Vision Board / alignment — persist morning & evening check-ins.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { osloDayKey } from "@/lib/oslo-week";
import {
  emptyDailyAlignment,
  type DailyAlignment,
  type DailyAlignmentPatch,
} from "@/lib/daily-alignment.types";

type DB = SupabaseClient<Database>;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDayKey(dayKey: string): string {
  const k = dayKey.trim();
  if (!DAY_KEY_RE.test(k)) throw new Error("Ugyldig dato (forventet YYYY-MM-DD)");
  return k;
}

function mapRow(row: {
  day_key: string;
  identity_energy: string;
  north_star: string;
  service_focus: string;
  win_today: string;
  tomorrow_priorities: string;
  updated_at: string;
}): DailyAlignment {
  return {
    dayKey: row.day_key,
    identityEnergy: row.identity_energy ?? "",
    northStar: row.north_star ?? "",
    serviceFocus: row.service_focus ?? "",
    winToday: row.win_today ?? "",
    tomorrowPriorities: row.tomorrow_priorities ?? "",
    updatedAt: row.updated_at ?? null,
  };
}

function clip(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  return value.slice(0, max);
}

export async function getDailyAlignment(
  client: DB,
  userId: string,
  dayKey?: string,
): Promise<DailyAlignment> {
  const key = assertDayKey(dayKey ?? osloDayKey());
  const { data, error } = await client
    .from("daily_alignments")
    .select(
      "day_key, identity_energy, north_star, service_focus, win_today, tomorrow_priorities, updated_at",
    )
    .eq("user_id", userId)
    .eq("day_key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return emptyDailyAlignment(key);
  return mapRow(data);
}

export async function upsertDailyAlignment(
  client: DB,
  userId: string,
  dayKey: string,
  patch: DailyAlignmentPatch,
): Promise<DailyAlignment> {
  const key = assertDayKey(dayKey);
  const existing = await getDailyAlignment(client, userId, key);

  const next = {
    user_id: userId,
    day_key: key,
    identity_energy:
      clip(patch.identityEnergy, 4000) ?? existing.identityEnergy,
    north_star: clip(patch.northStar, 500) ?? existing.northStar,
    service_focus: clip(patch.serviceFocus, 4000) ?? existing.serviceFocus,
    win_today: clip(patch.winToday, 4000) ?? existing.winToday,
    tomorrow_priorities:
      clip(patch.tomorrowPriorities, 2000) ?? existing.tomorrowPriorities,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("daily_alignments")
    .upsert(next, { onConflict: "user_id,day_key" })
    .select(
      "day_key, identity_energy, north_star, service_focus, win_today, tomorrow_priorities, updated_at",
    )
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function listDailyAlignments(
  client: DB,
  userId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<DailyAlignment[]> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 90);
  let query = client
    .from("daily_alignments")
    .select(
      "day_key, identity_energy, north_star, service_focus, win_today, tomorrow_priorities, updated_at",
    )
    .eq("user_id", userId)
    .order("day_key", { ascending: false })
    .limit(limit);

  if (opts.before) {
    query = query.lt("day_key", assertDayKey(opts.before));
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Compact prompt block for Fortell (today only). */
export function buildDailyAlignmentPromptBlock(
  alignment: DailyAlignment | null,
): string | null {
  if (!alignment) return null;
  const north = alignment.northStar.trim();
  const identity = alignment.identityEnergy.trim();
  const service = alignment.serviceFocus.trim();
  if (!north && !identity && !service) return null;

  const lines = [`DAGENS ALIGNMENT (${alignment.dayKey}):`];
  if (north) lines.push(`Nordstjerne: ${north}`);
  if (identity) lines.push(`Identitet/energi: ${identity.slice(0, 400)}`);
  if (service) lines.push(`Tjenestefokus: ${service.slice(0, 400)}`);
  lines.push("Bruk dette som dagens fokus når du gir råd.");
  return lines.join("\n");
}

export async function loadDailyAlignmentPromptBlock(
  client: DB,
  userId: string,
): Promise<string | null> {
  try {
    const alignment = await getDailyAlignment(client, userId);
    return buildDailyAlignmentPromptBlock(alignment);
  } catch {
    return null;
  }
}
