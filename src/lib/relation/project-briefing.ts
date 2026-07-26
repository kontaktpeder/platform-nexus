/** Project legacy Morning Mission buckets into relation-first briefing (C + A). */

import type { MorningMissionItem, MorningMissionPayload } from "@/lib/morning-mission.types";
import type { RelationBriefing, RelationCardModel, RelationSourceKind } from "@/lib/relation/types";

function inferSource(item: MorningMissionItem): RelationSourceKind | null {
  const raw = `${item.source_label ?? ""} ${item.id}`.toLowerCase();
  if (raw.includes("gmail") || raw.includes("mail") || raw.includes("e-post")) return "gmail";
  if (raw.includes("slack")) return "slack";
  if (raw.includes("felt") || raw.includes("field")) return "felt";
  if (raw.includes("finance") || raw.includes("faktura") || raw.includes("invoice")) return "finance";
  if (raw.includes("work")) return "work";
  if (raw.includes("ai")) return "ai";
  return item.source_label ? "system" : null;
}

function itemToCard(item: MorningMissionItem, status: RelationCardModel["status"]): RelationCardModel {
  const entityId = item.entity_id ?? null;
  return {
    id: item.id,
    entityId,
    entityType: item.entity_type ?? null,
    name: item.relation_name ?? item.title,
    subtitle: item.relation_subtitle ?? null,
    whyNow: item.explanation,
    nextAction: item.recommended_action,
    status: item.relation_status ?? status,
    ownerContext: item.owner_context ?? null,
    sourceKind: item.source_kind ?? inferSource(item),
    sourceLabel: item.source_label ?? null,
    imageUrl: item.image_url ?? null,
    href: item.href ?? (entityId ? `/kontakter/${entityId}` : null),
    priority: item.priority,
    briefItemId: item.id,
  };
}

/**
 * Bridge until AI brief returns `payload.relations`.
 * Start her = first high (else first) today item; rest split by bucket.
 */
export function projectPayloadToRelationBriefing(
  payload: MorningMissionPayload,
): RelationBriefing {
  if (payload.relations) {
    return {
      ...payload.relations,
      system: [],
      noiseCount: payload.relations.noiseCount ?? (payload.noise ?? []).length,
    };
  }

  const today = payload.today ?? [];
  const waiting = payload.waiting ?? [];
  const week = payload.this_week ?? [];

  const startCandidate =
    today.find((i) => i.priority === "high") ?? today[0] ?? waiting[0] ?? null;

  const startHere = startCandidate
    ? itemToCard(startCandidate, "waiting_on_me")
    : null;

  const used = new Set(startHere ? [startHere.id] : []);

  const needsFollowUp = [
    ...today.filter((i) => !used.has(i.id)).map((i) => itemToCard(i, "waiting_on_me")),
    ...waiting.filter((i) => !used.has(i.id)).map((i) => itemToCard(i, "waiting_on_them")),
  ];

  const upcoming = week
    .filter((i) => !used.has(i.id))
    .map((i) => itemToCard(i, "upcoming"));

  const unresolved: RelationCardModel[] = (payload.hygiene ?? [])
    .filter((h) => (h.senders?.length ?? 0) > 0 || /ukjent|unknown/i.test(h.label))
    .map((h, idx) => ({
      id: `unresolved-${idx}`,
      entityId: null,
      entityType: null,
      name: h.label,
      subtitle: h.senders?.slice(0, 2).join(", ") ?? null,
      whyNow: "Trenger avklaring før det knyttes til en kontakt.",
      nextAction: "Bekreft eller ignorer",
      status: "new_unconfirmed" as const,
      ownerContext: null,
      sourceKind: "ai" as const,
      sourceLabel: "Uavklart",
      imageUrl: null,
      href: "/review",
      priority: "low" as const,
      briefItemId: null,
    }));

  // Noise stays out of the relation list — it's not "people who need you".
  return {
    startHere,
    needsFollowUp,
    upcoming,
    unresolved,
    system: [],
    noiseCount: (payload.noise ?? []).length,
  };
}
