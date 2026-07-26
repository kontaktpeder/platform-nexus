/** Attach person/company entities to Morning Mission items (Direction C). */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { MorningMissionItem, MorningMissionPayload } from "@/lib/morning-mission.types";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import {
  extractEmailAddress,
  extractEmailDomain,
  normalizeName,
} from "@/lib/knowledge/entity-matcher";
import { loadLinkedIdentityLookups } from "@/lib/knowledge/identity/identity.server";
import {
  ANCHOR_SLUG_SET,
  OWNER_CONTEXT_LABEL,
  type OwnerContext,
} from "@/lib/knowledge/types";
import { normalizeOwnerContext } from "@/lib/customers.functions";
import type { RelationSourceKind, RelationStatus } from "@/lib/relation/types";
import { projectPayloadToRelationBriefing } from "@/lib/relation/project-briefing";

type DB = SupabaseClient<Database>;

type ResolvedEntity = {
  id: string;
  name: string;
  type: "person" | "company";
  ownerContext: OwnerContext;
  summary: string | null;
};

function sourceKindFor(signal: MissionSignal | undefined, label: string | null | undefined): RelationSourceKind | null {
  if (signal?.source === "gmail") return "gmail";
  if (signal?.source === "slack") return "slack";
  if (signal?.source === "finance") return "finance";
  if (signal?.source === "work") return "work";
  const raw = (label ?? "").toLowerCase();
  if (raw.includes("gmail") || raw.includes("mail")) return "gmail";
  if (raw.includes("slack")) return "slack";
  if (raw.includes("finance") || raw.includes("faktura")) return "finance";
  if (raw.includes("work")) return "work";
  if (raw.includes("felt") || raw.includes("field")) return "felt";
  return signal ? "system" : null;
}

function statusForBucket(
  bucket: "today" | "this_week" | "waiting" | "closed",
): RelationStatus {
  if (bucket === "waiting") return "waiting_on_them";
  if (bucket === "this_week") return "upcoming";
  if (bucket === "closed") return "quiet";
  return "waiting_on_me";
}

function displayNameFromFrom(from: string): string {
  const before = from.split("<")[0]?.trim().replace(/^"|"$/g, "");
  if (before && !before.includes("@")) return before;
  const email = extractEmailAddress(from);
  if (email) return email.split("@")[0] ?? from;
  return from;
}

export async function loadRelationEntityIndex(
  supabase: DB,
  userId: string,
): Promise<{
  byId: Map<string, ResolvedEntity>;
  byEmail: Map<string, ResolvedEntity>;
  byDomain: Map<string, ResolvedEntity>;
  byName: Map<string, ResolvedEntity>;
  catalog: Array<{ id: string; name: string; type: "person" | "company"; owner_context: OwnerContext }>;
}> {
  const [{ data: entRows }, lookups] = await Promise.all([
    supabase
      .from("entities")
      .select("id, name, slug, summary, type, owner_context, metadata")
      .eq("user_id", userId)
      .in("type", ["person", "company"]),
    loadLinkedIdentityLookups(supabase, userId),
  ]);

  const byId = new Map<string, ResolvedEntity>();
  const byDomain = new Map<string, ResolvedEntity>();
  const byName = new Map<string, ResolvedEntity>();
  const catalog: Array<{
    id: string;
    name: string;
    type: "person" | "company";
    owner_context: OwnerContext;
  }> = [];

  for (const row of entRows ?? []) {
    if (ANCHOR_SLUG_SET.has(row.slug)) continue;
    if (row.type !== "person" && row.type !== "company") continue;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const ownerContext = normalizeOwnerContext(row.owner_context ?? "unknown");
    const resolved: ResolvedEntity = {
      id: row.id,
      name: row.name,
      type: row.type,
      ownerContext,
      summary: row.summary,
    };
    byId.set(row.id, resolved);
    byName.set(normalizeName(row.name), resolved);
    const domain =
      typeof meta.email_domain === "string" ? meta.email_domain.toLowerCase() : null;
    if (domain && row.type === "company") byDomain.set(domain, resolved);
    catalog.push({
      id: row.id,
      name: row.name,
      type: row.type,
      owner_context: ownerContext,
    });
  }

  const byEmail = new Map<string, ResolvedEntity>();
  for (const [email, ki] of lookups.byEmail) {
    if (!ki.entity_id) continue;
    const e = byId.get(ki.entity_id);
    if (e) byEmail.set(email.toLowerCase(), e);
  }

  catalog.sort((a, b) => a.name.localeCompare(b.name, "nb"));
  return { byId, byEmail, byDomain, byName, catalog: catalog.slice(0, 80) };
}

function resolveFromSignal(
  signal: MissionSignal,
  index: Awaited<ReturnType<typeof loadRelationEntityIndex>>,
): ResolvedEntity | null {
  const email =
    (typeof signal.meta?.from_email === "string" && signal.meta.from_email) ||
    extractEmailAddress(signal.from);
  if (email) {
    const byMail = index.byEmail.get(email.toLowerCase());
    if (byMail) return byMail;
    const domain = extractEmailDomain(email);
    if (domain) {
      const byDom = index.byDomain.get(domain);
      if (byDom) return byDom;
    }
  }

  const customerName =
    typeof signal.meta?.customer_name === "string" ? signal.meta.customer_name : null;
  if (customerName) {
    const hit = index.byName.get(normalizeName(customerName));
    if (hit) return hit;
  }

  // Slack / subject name heuristic — exact normalized title match only
  const fromName = displayNameFromFrom(signal.from);
  const byFrom = index.byName.get(normalizeName(fromName));
  if (byFrom) return byFrom;

  return null;
}

function enrichItem(
  item: MorningMissionItem,
  bucket: "today" | "this_week" | "waiting" | "closed",
  signals: MissionSignal[],
  index: Awaited<ReturnType<typeof loadRelationEntityIndex>>,
): MorningMissionItem {
  const linkedSignals = item.source_ids
    .map((id) => signals.find((s) => s.id === id))
    .filter(Boolean) as MissionSignal[];

  let resolved: ResolvedEntity | null = null;

  if (item.entity_id && index.byId.has(item.entity_id)) {
    resolved = index.byId.get(item.entity_id)!;
  } else {
    for (const s of linkedSignals) {
      resolved = resolveFromSignal(s, index);
      if (resolved) break;
    }
  }

  const primary = linkedSignals[0];
  const sourceKind = item.source_kind ?? sourceKindFor(primary, item.source_label);
  const relationStatus = item.relation_status ?? statusForBucket(bucket);

  if (!resolved) {
    // Still set status/source for relation cards; keep title as name proxy.
    return {
      ...item,
      relation_status: relationStatus,
      source_kind: sourceKind,
      relation_name: item.relation_name ?? item.title,
    };
  }

  const subtitleParts = [
    resolved.type === "person" ? "Person" : "Selskap",
    resolved.ownerContext !== "unknown" ? OWNER_CONTEXT_LABEL[resolved.ownerContext] : null,
    resolved.summary,
  ].filter(Boolean);

  return {
    ...item,
    entity_id: resolved.id,
    entity_type: resolved.type,
    relation_name: item.relation_name?.trim() || resolved.name,
    relation_subtitle: item.relation_subtitle ?? (subtitleParts.join(" · ") || null),
    relation_status: relationStatus,
    owner_context: item.owner_context ?? resolved.ownerContext,
    source_kind: sourceKind,
    href: item.href ?? `/kontakter/${resolved.id}`,
  };
}

/** Enrich items with entity links + build `payload.relations`. */
export function attachRelationsToPayload(
  payload: MorningMissionPayload,
  signals: MissionSignal[],
  index: Awaited<ReturnType<typeof loadRelationEntityIndex>>,
): MorningMissionPayload {
  const enriched: MorningMissionPayload = {
    ...payload,
    today: payload.today.map((i) => enrichItem(i, "today", signals, index)),
    this_week: payload.this_week.map((i) => enrichItem(i, "this_week", signals, index)),
    waiting: payload.waiting.map((i) => enrichItem(i, "waiting", signals, index)),
    closed: payload.closed.map((i) => enrichItem(i, "closed", signals, index)),
  };
  // Always rebuild from enriched items (ignore stale relations).
  const { relations: _drop, ...rest } = enriched;
  return {
    ...rest,
    relations: projectPayloadToRelationBriefing(rest),
  };
}

/** Rebuild relations after filtering dismissed items (no signal re-resolve). */
export function rebuildRelationsOnPayload(payload: MorningMissionPayload): MorningMissionPayload {
  const { relations: _drop, ...rest } = payload;
  return {
    ...rest,
    relations: projectPayloadToRelationBriefing(rest),
  };
}
