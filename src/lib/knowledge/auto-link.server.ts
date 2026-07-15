// Server-only: auto-link Mission signals to Knowledge entities using
// deterministic rules from entity-matcher.ts. Manual links always win.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Entity } from "./types";
import type { EntityLink } from "@/lib/global-mission.functions";
import {
  matchEntityForSignal,
  normalizeChannelName,
  type MatchInput,
} from "./entity-matcher";
import { loadLinkedIdentityLookups } from "./identity/identity.server";

type DB = SupabaseClient<Database>;

export type MissionSignalDescriptor = MatchInput & {
  signalType: string;
  occurredAt?: string | null;
  snippet?: string | null;
};

function signalTypeFor(source: MatchInput["source"], externalRef: string): string {
  if (source === "gmail") return "message.received";
  if (source === "slack") {
    if (externalRef.startsWith("slack:dm:")) return "dm.unread";
    if (externalRef.startsWith("slack:mention:")) return "mention.received";
    return "message.received";
  }
  return "workspace.action";
}

function resolveViaKnownIdentity(
  s: MissionSignalDescriptor,
  lookups: Awaited<ReturnType<typeof loadLinkedIdentityLookups>>,
  entityById: Map<string, Entity>,
): EntityLink | null {
  if (s.source === "gmail" && s.senderEmail) {
    const ki = lookups.byEmail.get(s.senderEmail.toLowerCase());
    if (ki?.entity_id) {
      const e = entityById.get(ki.entity_id);
      if (e) {
        return {
          entityId: e.id,
          entityName: e.name,
          entitySlug: e.slug,
          linkSource: "auto",
        };
      }
    }
  }

  if (s.source === "slack" && s.channelName) {
    const ch = normalizeChannelName(s.channelName);
    const ki = ch ? lookups.bySlackChannelName.get(ch) : undefined;
    if (ki?.entity_id) {
      const e = entityById.get(ki.entity_id);
      if (e) {
        return {
          entityId: e.id,
          entityName: e.name,
          entitySlug: e.slug,
          linkSource: "auto",
        };
      }
    }
  }

  return null;
}

export async function autoLinkMissionSignals(
  supabase: DB,
  userId: string,
  signals: MissionSignalDescriptor[],
): Promise<Record<string, EntityLink>> {
  const map: Record<string, EntityLink> = {};
  if (signals.length === 0) return map;

  // 1. Fetch existing signal rows for these external_refs (manual + prior auto).
  const refs = Array.from(new Set(signals.map((s) => s.externalRef)));
  const { data: existingRows } = await supabase
    .from("entity_signals")
    .select("external_ref, entity_id, link_source")
    .eq("user_id", userId)
    .in("external_ref", refs);
  const existing = new Map<
    string,
    { entity_id: string; link_source: string }
  >();
  for (const row of existingRows ?? []) {
    existing.set(row.external_ref as string, {
      entity_id: row.entity_id as string,
      link_source: (row.link_source as string) ?? "manual",
    });
  }

  // 2. Load user entities once.
  const { data: entRows } = await supabase
    .from("entities")
    .select("*")
    .eq("user_id", userId);
  const entities = (entRows ?? []) as Entity[];
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const identityLookups = await loadLinkedIdentityLookups(supabase, userId);

  // 3. Seed map with existing links (manual + auto).
  for (const [ref, row] of existing) {
    const e = entityById.get(row.entity_id);
    if (!e) continue;
    map[ref] = {
      entityId: e.id,
      entityName: e.name,
      entitySlug: e.slug,
      linkSource: row.link_source === "auto" ? "auto" : "manual",
    };
  }

  // 4. Auto-link unmatched signals.
  const toUpsert: Array<{
    user_id: string;
    entity_id: string;
    source: string;
    signal_type: string;
    external_ref: string;
    occurred_at: string | null;
    snippet: string | null;
    link_source: "auto";
  }> = [];

  for (const s of signals) {
    if (existing.has(s.externalRef)) continue; // never overwrite

    const viaIdentity = resolveViaKnownIdentity(s, identityLookups, entityById);
    if (viaIdentity) {
      map[s.externalRef] = viaIdentity;
      toUpsert.push({
        user_id: userId,
        entity_id: viaIdentity.entityId,
        source: s.source,
        signal_type: s.signalType || signalTypeFor(s.source, s.externalRef),
        external_ref: s.externalRef.slice(0, 300),
        occurred_at: s.occurredAt ?? null,
        snippet: s.snippet ? s.snippet.slice(0, 160) : null,
        link_source: "auto",
      });
      continue;
    }

    const result = matchEntityForSignal(s, entities);
    if (!result.entity) continue;
    const e = entityById.get(result.entity.entityId);
    if (!e) continue;
    map[s.externalRef] = {
      entityId: e.id,
      entityName: e.name,
      entitySlug: e.slug,
      linkSource: "auto",
    };
    toUpsert.push({
      user_id: userId,
      entity_id: e.id,
      source: s.source,
      signal_type: s.signalType || signalTypeFor(s.source, s.externalRef),
      external_ref: s.externalRef.slice(0, 300),
      occurred_at: s.occurredAt ?? null,
      snippet: s.snippet ? s.snippet.slice(0, 160) : null,
      link_source: "auto",
    });
  }

  if (toUpsert.length > 0) {
    // Best-effort persist. Do not fail the request if this errors.
    try {
      await supabase
        .from("entity_signals")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(toUpsert as any, { onConflict: "user_id,external_ref" });
    } catch (err) {
      console.error("[auto-link] upsert failed:", err);
    }
  }

  return map;
}
