// Server-only: upsert known_identities, signal_identities, and entity linking.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { NormalizedSignal } from "@/lib/ingest/normalize";
import { extractIdentitiesFromSignal } from "./extract";
import type { ExtractedIdentity, KnownIdentity } from "./types";

type DB = SupabaseClient<Database>;

type RawSignalRow = {
  id: string;
  source: string;
  external_id: string | null;
  occurred_at: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
};

export function rawSignalToExternalRef(row: RawSignalRow): string {
  if (row.source === "gmail" && row.external_id) return `gmail:${row.external_id}`;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (row.source === "slack") {
    const kind = meta.kind as string | undefined;
    const channelId = meta.channel_id as string | undefined;
    const ts = meta.ts as string | undefined;
    if (kind === "dm" && channelId) return `slack:dm:${channelId}`;
    if (kind === "mention" && channelId && ts) return `slack:mention:${channelId}:${ts}`;
    if (channelId && ts) return `slack:channel:${channelId}:${ts}`;
  }
  if (row.external_id) return `${row.source}:${row.external_id}`;
  return row.id;
}

function signalTypeFor(source: string, externalRef: string): string {
  if (source === "gmail") return "message.received";
  if (source === "slack") {
    if (externalRef.startsWith("slack:dm:")) return "dm.unread";
    if (externalRef.startsWith("slack:mention:")) return "mention.received";
    return "message.received";
  }
  return "message.received";
}

export async function upsertKnownIdentity(
  supabase: DB,
  userId: string,
  item: ExtractedIdentity,
  signalTimestamp: string | null,
): Promise<string | null> {
  const ts = signalTimestamp ?? new Date().toISOString();

  const { data: existing } = await supabase
    .from("known_identities")
    .select("id, seen_count, last_seen_at, display_name")
    .eq("user_id", userId)
    .eq("provider", item.provider)
    .eq("identity_type", item.identityType)
    .eq("external_key", item.externalKey)
    .maybeSingle();

  if (existing?.id) {
    const patch: Record<string, unknown> = {
      last_seen_at:
        existing.last_seen_at && ts
          ? new Date(
              Math.max(Date.parse(existing.last_seen_at as string), Date.parse(ts)),
            ).toISOString()
          : ts,
      seen_count: (existing.seen_count as number) + 1,
    };
    if (item.displayName && !existing.display_name) patch.display_name = item.displayName;
    if (item.email) patch.email = item.email;
    if (item.domain) patch.domain = item.domain;
    if (item.handle) patch.handle = item.handle;

    await supabase
      .from("known_identities")
      .update(patch as never)
      .eq("id", existing.id)
      .eq("user_id", userId);
    return existing.id as string;
  }

  const { data: inserted, error } = await supabase
    .from("known_identities")
    .insert({
      user_id: userId,
      provider: item.provider,
      identity_type: item.identityType,
      external_key: item.externalKey,
      display_name: item.displayName ?? null,
      handle: item.handle ?? null,
      email: item.email ?? null,
      domain: item.domain ?? null,
      first_seen_at: ts,
      last_seen_at: ts,
      seen_count: 1,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[identity] insert failed", error.message);
    return null;
  }
  return inserted?.id as string;
}

async function linkSignalIdentity(
  supabase: DB,
  signalId: string,
  identityId: string,
  role: ExtractedIdentity["role"],
  confidence: number | null | undefined,
): Promise<void> {
  await supabase.from("signal_identities").upsert(
    {
      signal_id: signalId,
      identity_id: identityId,
      identity_role: role,
      confidence: confidence ?? null,
    },
    { onConflict: "signal_id,identity_id,identity_role" },
  );
}

export async function linkRawSignalToEntity(
  supabase: DB,
  userId: string,
  row: RawSignalRow,
  entityId: string,
  linkSource: "auto" | "manual" = "auto",
): Promise<void> {
  const externalRef = rawSignalToExternalRef(row).slice(0, 300);
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const snippet =
    typeof meta.snippet === "string"
      ? meta.snippet.slice(0, 160)
      : row.summary
        ? row.summary.slice(0, 160)
        : null;

  await supabase.from("entity_signals").upsert(
    {
      user_id: userId,
      entity_id: entityId,
      source: row.source,
      signal_type: signalTypeFor(row.source, externalRef),
      external_ref: externalRef,
      raw_signal_id: row.id,
      occurred_at: row.occurred_at,
      snippet,
      link_source: linkSource,
    },
    { onConflict: "user_id,external_ref" },
  );
}

export async function processSignalIdentities(
  supabase: DB,
  userId: string,
  row: RawSignalRow,
): Promise<{ identityIds: string[]; linkedEntityId: string | null }> {
  const normalized: NormalizedSignal = {
    source: row.source as NormalizedSignal["source"],
    external_id: row.external_id ?? row.id,
    external_thread_id: null,
    raw_text: "",
    summary: row.summary,
    occurred_at: row.occurred_at,
    metadata: row.metadata ?? {},
  };

  const extracted = extractIdentitiesFromSignal(normalized);
  const identityIds: string[] = [];
  let linkedEntityId: string | null = null;

  for (const item of extracted) {
    const identityId = await upsertKnownIdentity(supabase, userId, item, row.occurred_at);
    if (!identityId) continue;
    identityIds.push(identityId);
    await linkSignalIdentity(supabase, row.id, identityId, item.role, item.confidence);

    const { data: identity } = await supabase
      .from("known_identities")
      .select("entity_id")
      .eq("id", identityId)
      .eq("user_id", userId)
      .maybeSingle();

    const entityId = identity?.entity_id as string | null;
    if (entityId && !linkedEntityId) {
      linkedEntityId = entityId;
      await linkRawSignalToEntity(supabase, userId, row, entityId, "auto");
    }
  }

  return { identityIds, linkedEntityId };
}

export async function processBatchSignalIdentities(
  supabase: DB,
  userId: string,
  rows: RawSignalRow[],
): Promise<void> {
  for (const row of rows) {
    try {
      await processSignalIdentities(supabase, userId, row);
    } catch (err) {
      console.warn("[identity] process signal failed", row.id, err);
    }
  }
}

export async function linkHistoricalSignalsForIdentity(
  supabase: DB,
  userId: string,
  identityId: string,
  entityId: string,
): Promise<number> {
  const { data: links } = await supabase
    .from("signal_identities")
    .select("signal_id")
    .eq("identity_id", identityId);

  const signalIds = (links ?? []).map((l) => l.signal_id as string);
  if (signalIds.length === 0) return 0;

  const { data: signals } = await supabase
    .from("raw_signals")
    .select("id, source, external_id, occurred_at, summary, metadata")
    .eq("user_id", userId)
    .in("id", signalIds);

  let linked = 0;
  for (const row of (signals ?? []) as RawSignalRow[]) {
    await linkRawSignalToEntity(supabase, userId, row, entityId, "auto");
    linked += 1;
  }
  return linked;
}

export async function setIdentityEntityLink(
  supabase: DB,
  userId: string,
  identityId: string,
  entityId: string,
): Promise<{ linkedSignalCount: number }> {
  const { error } = await supabase
    .from("known_identities")
    .update({ entity_id: entityId })
    .eq("id", identityId)
    .eq("user_id", userId);
  if (error) throw error;

  const linkedSignalCount = await linkHistoricalSignalsForIdentity(
    supabase,
    userId,
    identityId,
    entityId,
  );
  return { linkedSignalCount };
}

export type IdentityEntityLookup = {
  byEmail: Map<string, KnownIdentity>;
  bySlackUser: Map<string, KnownIdentity>;
  bySlackChannelId: Map<string, KnownIdentity>;
  bySlackChannelName: Map<string, KnownIdentity>;
};

export async function loadLinkedIdentityLookups(
  supabase: DB,
  userId: string,
): Promise<IdentityEntityLookup> {
  const { data: rows } = await supabase
    .from("known_identities")
    .select("*")
    .eq("user_id", userId)
    .not("entity_id", "is", null);

  const byEmail = new Map<string, KnownIdentity>();
  const bySlackUser = new Map<string, KnownIdentity>();
  const bySlackChannelId = new Map<string, KnownIdentity>();
  const bySlackChannelName = new Map<string, KnownIdentity>();

  for (const row of (rows ?? []) as KnownIdentity[]) {
    if (!row.entity_id) continue;
    if (row.identity_type === "email_address" && row.email) {
      byEmail.set(row.email.toLowerCase(), row);
    }
    if (row.identity_type === "slack_user") {
      bySlackUser.set(row.external_key, row);
    }
    if (row.identity_type === "slack_channel") {
      bySlackChannelId.set(row.external_key, row);
      const nameKey = (row.handle ?? row.display_name ?? "").toLowerCase();
      if (nameKey) bySlackChannelName.set(nameKey.replace(/^#+/, ""), row);
    }
  }

  return { byEmail, bySlackUser, bySlackChannelId, bySlackChannelName };
}

export const PROMOTION_MIN_SEEN_COUNT = 2;

export async function syncPromotionSuggestions(
  supabase: DB,
  userId: string,
): Promise<number> {
  const { data: candidates } = await supabase
    .from("known_identities")
    .select("*")
    .eq("user_id", userId)
    .is("entity_id", null)
    .is("ignored_at", null)
    .gte("seen_count", PROMOTION_MIN_SEEN_COUNT)
    .order("seen_count", { ascending: false })
    .limit(50);

  let upserted = 0;
  for (const ki of (candidates ?? []) as KnownIdentity[]) {
    const suggestionKey = `identity:${ki.id}`;
    const proposedType =
      ki.identity_type === "email_domain" || ki.identity_type === "slack_channel"
        ? "company"
        : "person";
    const proposedName =
      ki.display_name ??
      ki.email ??
      ki.domain ??
      ki.external_key;

    const { data: existing } = await supabase
      .from("entity_suggestions")
      .select("id, status")
      .eq("user_id", userId)
      .eq("suggestion_key", suggestionKey)
      .maybeSingle();

    if (existing && existing.status !== "pending") continue;

    const row = {
      user_id: userId,
      suggestion_key: suggestionKey,
      known_identity_id: ki.id,
      suggestion_reason: "frequent_contact",
      proposed_name: proposedName,
      proposed_type: proposedType,
      reason: `Sett ${ki.seen_count} ganger — klar for vurdering.`,
      confidence: ki.seen_count >= 5 ? "high" : ki.seen_count >= 3 ? "medium" : "low",
      example_count: ki.seen_count,
      status: "pending" as const,
      metadata: {
        identity_type: ki.identity_type,
        provider: ki.provider,
        external_key: ki.external_key,
        last_seen_at: ki.last_seen_at,
      },
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("entity_suggestions")
        .update({
          example_count: ki.seen_count,
          reason: row.reason,
          confidence: row.confidence,
          metadata: row.metadata as never,
        })
        .eq("id", existing.id)
        .eq("user_id", userId)
        .eq("status", "pending");
      if (!error) upserted += 1;
    } else {
      const { error } = await supabase.from("entity_suggestions").insert(row as never);
      if (!error) upserted += 1;
    }
  }
  return upserted;
}
