/**
 * Field + contact follow-ups → Morning Mission / Desk queue signals.
 * due / overdue / soon open follow-ups, plus field places with no next step.
 */

import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import {
  addOsloDays,
  formatOsloDayLabel,
  osloDateKey,
} from "@/lib/field/field-dates";

export async function fetchFieldQueueSignals(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
}): Promise<MissionSignal[]> {
  const { supabase, userId } = input;
  const todayKey = osloDateKey();
  const soonKey = addOsloDays(todayKey, 2);
  const out: MissionSignal[] = [];

  const [{ data: followUps, error: fuErr }, { data: activities }, { data: places }] =
    await Promise.all([
      supabase
        .from("field_follow_ups")
        .select("id, entity_id, action, due_at, condition_type, status")
        .eq("user_id", userId)
        .eq("status", "open"),
      supabase
        .from("field_activities")
        .select("entity_id")
        .eq("user_id", userId),
      supabase
        .from("entities")
        .select("id, name, slug, metadata, type")
        .eq("user_id", userId)
        .eq("type", "company"),
    ]);

  if (fuErr) {
    console.warn("[field-signals] follow-ups failed:", fuErr.message);
    return [];
  }

  const hasActivity = new Set<string>();
  for (const a of activities ?? []) hasActivity.add(a.entity_id as string);

  const followByEntity = new Set<string>();
  for (const fu of followUps ?? []) followByEntity.add(fu.entity_id as string);

  const placeById = new Map<string, { id: string; name: string; slug: string }>();
  const placeIds = new Set<string>();
  for (const p of places ?? []) {
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    if (meta.field_place === true || hasActivity.has(p.id as string)) {
      placeIds.add(p.id as string);
      placeById.set(p.id as string, {
        id: p.id as string,
        name: p.name as string,
        slug: p.slug as string,
      });
    }
  }

  const entityIds = new Set<string>(
    (followUps ?? []).map((fu: { entity_id: string }) => String(fu.entity_id)),
  );
  const missingIds = [...entityIds].filter((id) => !placeById.has(id));
  if (missingIds.length) {
    const { data: ents } = await supabase
      .from("entities")
      .select("id, name, slug")
      .eq("user_id", userId)
      .in("id", missingIds);
    for (const e of ents ?? []) {
      placeById.set(e.id as string, {
        id: e.id as string,
        name: e.name as string,
        slug: e.slug as string,
      });
    }
  }

  for (const fu of followUps ?? []) {
    const dueKey = osloDateKey(new Date(fu.due_at as string));
    // Queue: overdue, today, or within 2 days
    if (dueKey > soonKey) continue;

    const ent = placeById.get(fu.entity_id as string);
    const name = ent?.name ?? "Kontakt";
    const overdue = dueKey < todayKey;
    const dueLabel = formatOsloDayLabel(fu.due_at as string, todayKey);
    const action = String(fu.action ?? "").trim() || "Følg opp";

    out.push({
      id: `field:followup:${fu.id}`,
      source: "field",
      subject: overdue
        ? `Forsinket · ${name}`
        : dueKey === todayKey
          ? `I dag · ${name}`
          : `${dueLabel} · ${name}`,
      from: "Oppfølging",
      snippet: action,
      occurred_at: fu.due_at as string,
      href: `/kontakter/${fu.entity_id}`,
      tags: ["follow_up", overdue ? "overdue" : "due"],
      meta: {
        follow_up_id: fu.id as string,
        entity_id: fu.entity_id as string,
        entity_name: name,
        due_at: fu.due_at as string,
        action,
      },
    });
  }

  let noPlanCount = 0;
  for (const id of placeIds) {
    if (followByEntity.has(id)) continue;
    if (noPlanCount >= 5) break;
    const ent = placeById.get(id);
    if (!ent) continue;
    noPlanCount += 1;
    out.push({
      id: `field:no_plan:${id}`,
      source: "field",
      subject: `Ingen neste steg · ${ent.name}`,
      from: "Field",
      snippet: "Sett oppfølging eller neste handling.",
      occurred_at: null,
      href: "/field",
      tags: ["no_plan", "field"],
      meta: {
        entity_id: id,
        entity_name: ent.name,
      },
    });
  }

  return out;
}
