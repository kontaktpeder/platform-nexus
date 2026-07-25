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

/** Auto-promote after this many observations (same bar as suggestions). */
export const AUTO_PROMOTE_MIN_SEEN_COUNT = PROMOTION_MIN_SEEN_COUNT;

const NOISY_LOCAL_RE =
  /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|mailerdaemon|notifications?|newsletter|news|updates?|bounce|postmaster|daemon)$/i;

function isNoisyEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const local = email.split("@")[0] ?? "";
  if (NOISY_LOCAL_RE.test(local)) return true;
  if (local.includes("noreply") || local.includes("no-reply")) return true;
  return false;
}

function proposedTypeForIdentity(ki: KnownIdentity): "person" | "company" {
  if (ki.identity_type === "email_domain" || ki.identity_type === "slack_channel") {
    return "company";
  }
  return "person";
}

function proposedNameForIdentity(ki: KnownIdentity): string | null {
  const name =
    ki.display_name ?? ki.email ?? ki.domain ?? ki.external_key;
  const trimmed = name?.trim() ?? "";
  return trimmed || null;
}

function shouldAutoPromoteIdentity(ki: KnownIdentity): boolean {
  if (ki.entity_id || ki.ignored_at) return false;
  if (ki.seen_count < AUTO_PROMOTE_MIN_SEEN_COUNT) return false;
  // Skip noisy channels and system mailboxes.
  if (ki.identity_type === "slack_channel") return false;
  if (ki.identity_type === "slack_user" && !ki.display_name) return false;
  if (ki.identity_type === "email_address" && isNoisyEmail(ki.email ?? ki.external_key)) {
    return false;
  }
  if (ki.identity_type === "external_account") return false;
  return !!proposedNameForIdentity(ki);
}

async function findExistingEntityForIdentity(
  supabase: DB,
  userId: string,
  ki: KnownIdentity,
): Promise<{ id: string; owner_context: string | null } | null> {
  if (ki.identity_type === "email_address" && ki.email) {
    const { data } = await supabase
      .from("entities")
      .select("id, owner_context, metadata")
      .eq("user_id", userId)
      .contains("metadata", { email: ki.email } as never)
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      return { id: data.id as string, owner_context: (data.owner_context as string) ?? null };
    }
  }

  const domain = ki.domain ?? (ki.identity_type === "email_domain" ? ki.external_key : null);
  if (domain) {
    const { data: byDomain } = await supabase
      .from("entities")
      .select("id, owner_context, metadata, type")
      .eq("user_id", userId)
      .eq("type", "company")
      .contains("metadata", { email_domain: domain } as never)
      .limit(1)
      .maybeSingle();
    if (byDomain?.id) {
      return {
        id: byDomain.id as string,
        owner_context: (byDomain.owner_context as string) ?? null,
      };
    }
  }

  return null;
}

async function findCompanyForDomain(
  supabase: DB,
  userId: string,
  domain: string,
): Promise<{ id: string; owner_context: string | null } | null> {
  const { data } = await supabase
    .from("entities")
    .select("id, owner_context")
    .eq("user_id", userId)
    .eq("type", "company")
    .contains("metadata", { email_domain: domain } as never)
    .limit(1)
    .maybeSingle();
  if (data?.id) {
    return { id: data.id as string, owner_context: (data.owner_context as string) ?? null };
  }
  return null;
}

export type PromoteIdentityResult = {
  entityId: string;
  created: boolean;
  linkedSignalCount: number;
  name: string;
};

/** Create or link an entity for a known identity. Shared by manual + auto promote. */
export async function promoteKnownIdentityToEntity(
  supabase: DB,
  userId: string,
  identityId: string,
  opts?: {
    type?: "person" | "company";
    name?: string;
    importance?: number;
    source?: "manual" | "auto";
  },
): Promise<PromoteIdentityResult> {
  const { data: identity, error: idErr } = await supabase
    .from("known_identities")
    .select("*")
    .eq("id", identityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (idErr) throw idErr;
  if (!identity) throw new Error("Identitet finnes ikke");
  if (identity.entity_id) {
    return {
      entityId: identity.entity_id as string,
      created: false,
      linkedSignalCount: 0,
      name: "",
    };
  }

  const ki = identity as KnownIdentity;
  const type = opts?.type ?? proposedTypeForIdentity(ki);
  const name = (opts?.name ?? proposedNameForIdentity(ki))?.trim();
  if (!name) throw new Error("Navn mangler");

  // Prefer linking to an existing entity when email/domain already matches.
  const existing = await findExistingEntityForIdentity(supabase, userId, ki);
  if (existing) {
    const linkResult = await setIdentityEntityLink(
      supabase,
      userId,
      identityId,
      existing.id,
    );
    await supabase
      .from("entity_suggestions")
      .update({ status: "accepted" })
      .eq("user_id", userId)
      .eq("known_identity_id", identityId)
      .eq("status", "pending");
    return {
      entityId: existing.id,
      created: false,
      linkedSignalCount: linkResult.linkedSignalCount,
      name,
    };
  }

  const { slugifyEntityName } = await import("@/lib/knowledge/entity.server");
  const slug = await slugifyEntityName(supabase, userId, name);
  const metadata: Record<string, unknown> = {
    created_via: opts?.source === "auto" ? "identity_auto" : "identity_manual",
  };
  if (ki.email) metadata.email = ki.email;
  if (ki.domain) metadata.email_domain = ki.domain;
  if (ki.identity_type === "slack_user") {
    metadata.slack_user_id = ki.external_key;
  }
  if (ki.identity_type === "slack_channel") {
    metadata.slack_channel_id = ki.external_key;
  }

  let ownerContext: string | null = null;
  if (type === "person" && ki.domain) {
    const company = await findCompanyForDomain(supabase, userId, ki.domain);
    if (company?.owner_context) ownerContext = company.owner_context;
  }

  const { data: entity, error: insErr } = await supabase
    .from("entities")
    .insert({
      user_id: userId,
      type,
      name,
      slug,
      importance: opts?.importance ?? (opts?.source === "auto" ? 45 : 50),
      summary: null,
      owner_context: (ownerContext ?? "unknown") as never,
      metadata: metadata as never,
      last_seen_at: ki.last_seen_at ?? new Date().toISOString(),
    })
    .select("id, name")
    .single();
  if (insErr) throw insErr;

  const entityId = entity.id as string;
  const linkResult = await setIdentityEntityLink(
    supabase,
    userId,
    identityId,
    entityId,
  );

  // Person → company link when domain company already exists.
  if (type === "person" && ki.domain) {
    const company = await findCompanyForDomain(supabase, userId, ki.domain);
    if (company) {
      const { error: relErr } = await supabase.from("entity_relationships").upsert(
        {
          user_id: userId,
          from_entity_id: entityId,
          to_entity_id: company.id,
          kind: "member_of",
        } as never,
        { onConflict: "user_id,from_entity_id,to_entity_id,kind" },
      );
      if (relErr) {
        console.warn("[identity] member_of link failed", relErr.message);
      }
      if (company.owner_context && company.owner_context !== "unknown") {
        await supabase
          .from("entities")
          .update({ owner_context: company.owner_context as never })
          .eq("id", entityId)
          .eq("user_id", userId);
      }
    }
  }

  await supabase
    .from("entity_suggestions")
    .update({ status: "accepted" })
    .eq("user_id", userId)
    .eq("known_identity_id", identityId)
    .eq("status", "pending");

  return {
    entityId,
    created: true,
    linkedSignalCount: linkResult.linkedSignalCount,
    name: entity.name as string,
  };
}

export type AutoPromoteResult = {
  promoted: number;
  linked: number;
  skipped: number;
  errors: string[];
};

/** Auto-create/link entities for frequent contacts. Idempotent. */
export async function autoPromoteEligibleIdentities(
  supabase: DB,
  userId: string,
): Promise<AutoPromoteResult> {
  const result: AutoPromoteResult = { promoted: 0, linked: 0, skipped: 0, errors: [] };

  const { data: candidates, error } = await supabase
    .from("known_identities")
    .select("*")
    .eq("user_id", userId)
    .is("entity_id", null)
    .is("ignored_at", null)
    .gte("seen_count", AUTO_PROMOTE_MIN_SEEN_COUNT)
    .order("seen_count", { ascending: false })
    .limit(40);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  // Promote companies (domains) first so person→company links can attach.
  const rows = ((candidates ?? []) as KnownIdentity[]).filter(shouldAutoPromoteIdentity);
  rows.sort((a, b) => {
    const aCo = a.identity_type === "email_domain" ? 0 : 1;
    const bCo = b.identity_type === "email_domain" ? 0 : 1;
    if (aCo !== bCo) return aCo - bCo;
    return b.seen_count - a.seen_count;
  });

  for (const ki of rows) {
    try {
      const res = await promoteKnownIdentityToEntity(supabase, userId, ki.id, {
        source: "auto",
      });
      if (res.created) result.promoted += 1;
      else result.linked += 1;
    } catch (err) {
      result.skipped += 1;
      result.errors.push(
        `${ki.external_key}: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }

  return result;
}

/** Mark identity as wrong and remove the auto-created entity so it won't come back. */
export async function rejectWrongEntity(
  supabase: DB,
  userId: string,
  entityId: string,
): Promise<{ ok: true; ignoredIdentities: number }> {
  const { data: entity, error } = await supabase
    .from("entities")
    .select("id, metadata")
    .eq("id", entityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!entity) throw new Error("Entity finnes ikke");

  const { data: identities } = await supabase
    .from("known_identities")
    .select("id")
    .eq("user_id", userId)
    .eq("entity_id", entityId);

  const now = new Date().toISOString();
  const ids = (identities ?? []).map((i) => i.id as string);
  if (ids.length) {
    await supabase
      .from("known_identities")
      .update({ ignored_at: now, entity_id: null })
      .eq("user_id", userId)
      .in("id", ids);

    await supabase
      .from("entity_suggestions")
      .update({ status: "ignored" })
      .eq("user_id", userId)
      .in("known_identity_id", ids)
      .eq("status", "pending");
  }

  const { error: delErr } = await supabase
    .from("entities")
    .delete()
    .eq("id", entityId)
    .eq("user_id", userId);
  if (delErr) throw delErr;

  return { ok: true, ignoredIdentities: ids.length };
}

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
    // Auto-eligible identities are promoted elsewhere — skip pending inbox noise.
    if (shouldAutoPromoteIdentity(ki)) continue;

    const suggestionKey = `identity:${ki.id}`;
    const proposedType = proposedTypeForIdentity(ki);
    const proposedName = proposedNameForIdentity(ki);
    if (!proposedName) continue;

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
