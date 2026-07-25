// Field visits ServerFns — place board, log activity, follow-ups.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ANCHOR_SLUG_SET, type OwnerContext } from "@/lib/knowledge/types";
import {
  FIELD_RESULTS,
  FOLLOW_UP_PRESETS,
  defaultConditionForResult,
  defaultPresetForResult,
  type FieldActivity,
  type FieldBoard,
  type FieldBoardSection,
  type FieldFollowUp,
  type FieldPlaceCard,
  type FieldResult,
  type FollowUpCondition,
  type FollowUpPreset,
  FIELD_RESULT_LABEL,
} from "@/lib/field/field.types";
import {
  addOsloDays,
  formatOsloDayLabel,
  osloDateKey,
  osloNoonIso,
} from "@/lib/field/field-dates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(v: unknown): any {
  return JSON.parse(JSON.stringify(v ?? null));
}

function assertResult(v: unknown): FieldResult {
  if (typeof v === "string" && (FIELD_RESULTS as readonly string[]).includes(v)) {
    return v as FieldResult;
  }
  throw new Error("Ugyldig resultat");
}

function assertPreset(v: unknown): FollowUpPreset {
  if (typeof v === "string" && (FOLLOW_UP_PRESETS as readonly string[]).includes(v)) {
    return v as FollowUpPreset;
  }
  throw new Error("Ugyldig oppfølgingsvalg");
}

function resolveDueAt(
  preset: FollowUpPreset,
  pickDate: string | null | undefined,
  todayKey = osloDateKey(),
): string | null {
  if (preset === "none") return null;
  if (preset === "pick_date") {
    if (!pickDate || !/^\d{4}-\d{2}-\d{2}$/.test(pickDate)) {
      throw new Error("Velg en dato for oppfølging");
    }
    return osloNoonIso(pickDate);
  }
  const offset: Record<Exclude<FollowUpPreset, "none" | "pick_date">, number> = {
    today: 0,
    tomorrow: 1,
    in_2_days: 2,
    in_3_days: 3,
    next_week: 7,
  };
  return osloNoonIso(addOsloDays(todayKey, offset[preset]));
}

function sectionForCard(
  followUp: FieldPlaceCard["followUp"],
  todayKey: string,
): FieldBoardSection {
  if (!followUp) return "no_plan";
  const dueKey = osloDateKey(new Date(followUp.dueAt));
  if (dueKey <= todayKey) return "due";
  if (followUp.conditionType === "if_no_reply" || followUp.conditionType === "if_no_new_activity") {
    return "waiting";
  }
  return "upcoming";
}

function sortCards(a: FieldPlaceCard, b: FieldPlaceCard): number {
  const aDue = a.followUp?.dueAt ?? "9999";
  const bDue = b.followUp?.dueAt ?? "9999";
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  return a.name.localeCompare(b.name, "nb");
}

export const getFieldBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FieldBoard> => {
    const { supabase, userId } = context;
    const todayKey = osloDateKey();

    const [placesRes, activitiesRes, followUpsRes] = await Promise.all([
      supabase
        .from("entities")
        .select("id, name, slug, metadata, last_seen_at, type")
        .eq("user_id", userId)
        .eq("type", "company")
        .order("name"),
      supabase
        .from("field_activities")
        .select("id, entity_id, result, note, next_action, occurred_at, created_at")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("field_follow_ups")
        .select(
          "id, entity_id, action, due_at, condition_type, related_activity_id, status, created_at, updated_at",
        )
        .eq("user_id", userId)
        .eq("status", "open"),
    ]);

    if (placesRes.error) throw placesRes.error;
    if (activitiesRes.error) throw activitiesRes.error;
    if (followUpsRes.error) throw followUpsRes.error;

    const places = (placesRes.data ?? []).filter((p) => {
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      // Include explicit field places, or any company that already has field activity/follow-up.
      return meta.field_place === true;
    });

    const latestByEntity = new Map<string, FieldActivity>();
    for (const row of activitiesRes.data ?? []) {
      if (latestByEntity.has(row.entity_id)) continue;
      latestByEntity.set(row.entity_id, {
        id: row.id,
        entity_id: row.entity_id,
        result: row.result as FieldResult,
        note: row.note,
        next_action: row.next_action,
        occurred_at: row.occurred_at,
        created_at: row.created_at,
      });
    }

    const followByEntity = new Map<string, FieldFollowUp>();
    for (const row of followUpsRes.data ?? []) {
      // One open follow-up per place — keep earliest due if duplicates.
      const existing = followByEntity.get(row.entity_id);
      if (existing && existing.due_at <= row.due_at) continue;
      followByEntity.set(row.entity_id, {
        id: row.id,
        entity_id: row.entity_id,
        action: row.action,
        due_at: row.due_at,
        condition_type: row.condition_type as FollowUpCondition,
        related_activity_id: row.related_activity_id,
        status: row.status as FieldFollowUp["status"],
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    // Also surface companies that have field data but missing field_place flag
    const placeIds = new Set(places.map((p) => p.id));
    const extraIds = new Set<string>();
    for (const id of latestByEntity.keys()) if (!placeIds.has(id)) extraIds.add(id);
    for (const id of followByEntity.keys()) if (!placeIds.has(id)) extraIds.add(id);

    let allPlaces = places;
    if (extraIds.size) {
      const { data: extra } = await supabase
        .from("entities")
        .select("id, name, slug, metadata, last_seen_at, type")
        .eq("user_id", userId)
        .in("id", Array.from(extraIds));
      allPlaces = [...places, ...(extra ?? [])];
    }

    const sections: Record<FieldBoardSection, FieldPlaceCard[]> = {
      due: [],
      upcoming: [],
      waiting: [],
      no_plan: [],
    };

    for (const place of allPlaces) {
      const latest = latestByEntity.get(place.id) ?? null;
      const fu = followByEntity.get(place.id) ?? null;
      const followUp = fu
        ? {
            id: fu.id,
            dueAt: fu.due_at,
            action: fu.action,
            conditionType: fu.condition_type,
          }
        : null;

      const situation = latest
        ? FIELD_RESULT_LABEL[latest.result] +
          (latest.note ? ` · ${latest.note}` : "")
        : null;

      const card: FieldPlaceCard = {
        entityId: place.id,
        name: place.name,
        slug: place.slug,
        section: sectionForCard(followUp, todayKey),
        situation,
        lastActivityAt: latest?.occurred_at ?? place.last_seen_at,
        lastResult: latest?.result ?? null,
        nextAction: followUp?.action ?? latest?.next_action ?? null,
        followUp,
        dueLabel: followUp ? formatOsloDayLabel(followUp.dueAt, todayKey) : null,
      };
      // Recompute section after building (same)
      card.section = sectionForCard(followUp, todayKey);
      sections[card.section].push(card);
    }

    for (const key of Object.keys(sections) as FieldBoardSection[]) {
      sections[key].sort(sortCards);
    }

    const counts = {
      due: sections.due.length,
      upcoming: sections.upcoming.length,
      waiting: sections.waiting.length,
      no_plan: sections.no_plan.length,
      total:
        sections.due.length +
        sections.upcoming.length +
        sections.waiting.length +
        sections.no_plan.length,
    };

    return normalize({ sections, counts, todayKey });
  });

export const createFieldPlace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      note?: string | null;
      ownerContext?: OwnerContext;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const name = String(data.name ?? "").trim().slice(0, 200);
    if (!name) throw new Error("Navn mangler");

    const { slugifyEntityName } = await import("@/lib/knowledge/entity.server");
    const slug = await slugifyEntityName(supabase, userId, name);
    if (ANCHOR_SLUG_SET.has(slug)) {
      throw new Error("Navnet er reservert.");
    }

    const summary = data.note ? String(data.note).trim().slice(0, 500) : null;
    // Field places default to Gold of Sicily (sales) unless caller specifies.
    const ownerContext =
      data.ownerContext && data.ownerContext !== "unknown"
        ? data.ownerContext
        : "gold-of-sicily";

    const { data: row, error } = await supabase
      .from("entities")
      .insert({
        user_id: userId,
        type: "company",
        name,
        slug,
        importance: 60,
        summary,
        owner_context: ownerContext as never,
        metadata: {
          field_place: true,
          platform_org_slug: ownerContext,
        } as never,
        last_seen_at: new Date().toISOString(),
      })
      .select("id, name, slug, owner_context")
      .single();
    if (error) throw error;
    return normalize(row);
  });

export const logFieldActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      entityId: string;
      result: FieldResult;
      note?: string | null;
      nextAction?: string | null;
      followUpPreset?: FollowUpPreset;
      followUpDate?: string | null;
      conditionType?: FollowUpCondition;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.entityId) throw new Error("entityId mangler");
    const result = assertResult(data.result);
    const note = data.note ? String(data.note).trim().slice(0, 500) : null;
    const nextAction = data.nextAction
      ? String(data.nextAction).trim().slice(0, 300)
      : null;

    const preset = assertPreset(data.followUpPreset ?? defaultPresetForResult(result));
    const condition =
      data.conditionType ??
      (preset === "none" ? "always" : defaultConditionForResult(result));
    const dueAt = resolveDueAt(preset, data.followUpDate);

    const { data: entity, error: entErr } = await supabase
      .from("entities")
      .select("id, metadata, summary")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (entErr) throw entErr;
    if (!entity) throw new Error("Sted ikke funnet");

    const now = new Date().toISOString();
    const { data: activity, error: actErr } = await supabase
      .from("field_activities")
      .insert({
        user_id: userId,
        entity_id: data.entityId,
        result,
        note,
        next_action: nextAction,
        occurred_at: now,
      })
      .select("id, entity_id, result, note, next_action, occurred_at, created_at")
      .single();
    if (actErr) throw actErr;

    // Cancel previous open follow-ups for this place.
    await supabase
      .from("field_follow_ups")
      .update({ status: "cancelled" })
      .eq("user_id", userId)
      .eq("entity_id", data.entityId)
      .eq("status", "open");

    let followUp: FieldFollowUp | null = null;
    if (dueAt) {
      const actionText =
        nextAction ||
        (result === "mail_sent" || result === "waiting_reply"
          ? "Følg opp hvis ingen svar"
          : result === "demo_booked"
            ? "Gjennomfør demo"
            : "Følg opp");
      const { data: fu, error: fuErr } = await supabase
        .from("field_follow_ups")
        .insert({
          user_id: userId,
          entity_id: data.entityId,
          action: actionText.slice(0, 300),
          due_at: dueAt,
          condition_type: condition,
          related_activity_id: activity.id,
          status: "open",
        })
        .select(
          "id, entity_id, action, due_at, condition_type, related_activity_id, status, created_at, updated_at",
        )
        .single();
      if (fuErr) throw fuErr;
      followUp = fu as FieldFollowUp;
    }

    const meta = {
      ...((entity.metadata ?? {}) as Record<string, unknown>),
      field_place: true,
      field_last_result: result,
    };
    const situationSummary = [
      FIELD_RESULT_LABEL[result],
      note,
    ]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 500);

    await supabase
      .from("entities")
      .update({
        last_seen_at: now,
        summary: situationSummary || entity.summary,
        metadata: meta as never,
      })
      .eq("id", data.entityId)
      .eq("user_id", userId);

    // Also link a short entity_signal for timeline continuity (best-effort).
    const externalRef = `field:activity:${activity.id}`;
    await supabase.from("entity_signals").upsert(
      {
        user_id: userId,
        entity_id: data.entityId,
        source: "field",
        signal_type: "visit",
        external_ref: externalRef,
        occurred_at: now,
        snippet: situationSummary.slice(0, 160),
        link_source: "manual",
      },
      { onConflict: "user_id,external_ref" },
    );

    return normalize({ activity, followUp });
  });

export const snoozeFieldFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { followUpId: string; preset: FollowUpPreset; pickDate?: string | null }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const preset = assertPreset(data.preset);
    if (preset === "none") throw new Error("Bruk avslutt for å fjerne oppfølging");
    const dueAt = resolveDueAt(preset, data.pickDate);
    if (!dueAt) throw new Error("Dato mangler");

    const { data: row, error } = await supabase
      .from("field_follow_ups")
      .update({ due_at: dueAt, status: "open" })
      .eq("id", data.followUpId)
      .eq("user_id", userId)
      .select(
        "id, entity_id, action, due_at, condition_type, related_activity_id, status, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    return normalize(row);
  });

export const completeFieldFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { followUpId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("field_follow_ups")
      .update({ status: "done" })
      .eq("id", data.followUpId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const cancelFieldFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { followUpId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("field_follow_ups")
      .update({ status: "cancelled" })
      .eq("id", data.followUpId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/** One-shot import of venue names from the old Notes list. */
const NOTE_PLACE_SEED = [
  "Hytta",
  "Radio",
  "Thorvalds",
  "Schous kjelleren",
  "Niue",
  "Syng",
  "Parkteateret",
  "Guilty Pleasure",
  "Chair",
  "Andy's Pub Karl Johan",
  "Proud Mary",
  "Brygg",
  "Scottman",
  "Cafesør",
  "Lannisters",
];

export const seedFieldPlacesFromNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { slugifyEntityName } = await import("@/lib/knowledge/entity.server");

    const { data: existing } = await supabase
      .from("entities")
      .select("id, name, metadata, owner_context")
      .eq("user_id", userId)
      .eq("type", "company");

    const byName = new Map(
      (existing ?? []).map((e) => [e.name.trim().toLowerCase(), e]),
    );

    let created = 0;
    let tagged = 0;

    for (const name of NOTE_PLACE_SEED) {
      const key = name.toLowerCase();
      const found = byName.get(key);
      if (found) {
        const prev = (found.metadata ?? {}) as Record<string, unknown>;
        const meta = {
          ...prev,
          field_place: true,
          platform_org_slug: prev.platform_org_slug ?? "gold-of-sicily",
        };
        const patch: Record<string, unknown> = { metadata: meta };
        if (!found.owner_context || found.owner_context === "unknown") {
          patch.owner_context = "gold-of-sicily";
        }
        await supabase
          .from("entities")
          .update(patch as never)
          .eq("id", found.id)
          .eq("user_id", userId);
        tagged += 1;
        continue;
      }

      const slug = await slugifyEntityName(supabase, userId, name);
      if (ANCHOR_SLUG_SET.has(slug)) continue;
      const { error } = await supabase.from("entities").insert({
        user_id: userId,
        type: "company",
        name,
        slug,
        importance: 55,
        owner_context: "gold-of-sicily" as never,
        metadata: {
          field_place: true,
          platform_org_slug: "gold-of-sicily",
        } as never,
      });
      if (!error) created += 1;
    }

    return { created, tagged, total: NOTE_PLACE_SEED.length };
  });

export const listFieldActivityForPlace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityId: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const limit = Math.min(Math.max(data.limit ?? 20, 1), 50);
    const { data: rows, error } = await supabase
      .from("field_activities")
      .select("id, entity_id, result, note, next_action, occurred_at, created_at")
      .eq("user_id", userId)
      .eq("entity_id", data.entityId)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return normalize(rows ?? []);
  });
