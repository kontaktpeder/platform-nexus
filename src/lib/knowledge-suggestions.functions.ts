// Knowledge v2 — server functions for AI-assisted entity suggestions.
// See docs/KNOWLEDGE.v2.md.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Entity, EntityType } from "@/lib/knowledge/types";
import type {
  ClusterKind,
  SuggestionCluster,
} from "@/lib/knowledge/suggestion-clusters";

export type EntitySuggestion = {
  id: string;
  suggestion_key: string;
  proposed_name: string;
  proposed_type: EntityType;
  reason: string;
  confidence: "low" | "medium" | "high";
  example_count: number;
  status: "pending" | "ignored" | "snoozed" | "accepted";
  snoozed_until: string | null;
  metadata: {
    cluster_kind?: ClusterKind;
    example_refs?: string[];
    suggested_metadata?: Record<string, unknown>;
    hints?: SuggestionCluster["hints"];
    [k: string]: unknown;
  };
  created_at: string;
  updated_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(v: unknown): any {
  return JSON.parse(JSON.stringify(v ?? null));
}

// ─── Scan: build clusters, call AI, upsert pending suggestions ─────────────

export const suggestKnowledgeEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { buildMissionSignalDescriptors } = await import(
      "@/lib/mission-signals.server"
    );
    const { clusterUnlinkedSignals } = await import(
      "@/lib/knowledge/suggestion-clusters"
    );
    const { generateSuggestionsForClusters } = await import(
      "@/lib/knowledge/suggestion-ai.server"
    );

    // 1. Descriptors + entities + existing signal refs (all of the user's).
    const [descriptors, entRes, sigRes, suggRes] = await Promise.all([
      buildMissionSignalDescriptors(supabase, userId),
      supabase.from("entities").select("*").eq("user_id", userId),
      supabase
        .from("entity_signals")
        .select("external_ref")
        .eq("user_id", userId),
      supabase
        .from("entity_suggestions")
        .select("suggestion_key, status, snoozed_until")
        .eq("user_id", userId),
    ]);

    const entities = (entRes.data ?? []) as Entity[];
    const linkedRefs = new Set<string>(
      (sigRes.data ?? []).map((r) => r.external_ref as string),
    );
    const ignoredKeys = new Set<string>();
    const snoozedKeys = new Set<string>();
    const acceptedKeys = new Set<string>();
    const now = Date.now();
    for (const row of suggRes.data ?? []) {
      const key = row.suggestion_key as string;
      const status = row.status as string;
      const until = row.snoozed_until
        ? Date.parse(row.snoozed_until as string)
        : 0;
      if (status === "ignored") ignoredKeys.add(key);
      else if (status === "accepted") acceptedKeys.add(key);
      else if (status === "snoozed" && until > now) snoozedKeys.add(key);
    }

    const skipKeys = new Set<string>([...ignoredKeys, ...snoozedKeys, ...acceptedKeys]);

    // 2. Cluster.
    const clusters = clusterUnlinkedSignals(descriptors, entities, {
      linkedRefs,
      ignoredKeys: skipKeys,
      snoozedKeys: new Set(),
    });

    // 3. AI (with deterministic fallback).
    const aiSuggestions = await generateSuggestionsForClusters(clusters, entities);

    // 4. Upsert pending suggestions.
    if (aiSuggestions.length > 0) {
      const clusterByKey = new Map(clusters.map((c) => [c.suggestionKey, c]));
      const rows = aiSuggestions.map((s) => {
        const c = clusterByKey.get(s.suggestionKey);
        return {
          user_id: userId,
          suggestion_key: s.suggestionKey,
          proposed_name: s.proposedName,
          proposed_type: s.proposedType,
          reason: s.reason,
          confidence: s.confidence,
          example_count: c?.exampleCount ?? 0,
          status: "pending" as const,
          snoozed_until: null,
          metadata: {
            cluster_kind: c?.clusterKind,
            example_refs: c?.exampleRefs ?? [],
            suggested_metadata: s.suggestedMetadata,
            hints: c?.hints ?? {},
          },
        };
      });
      try {
        await supabase
          .from("entity_suggestions")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(rows as any, { onConflict: "user_id,suggestion_key" });
      } catch (err) {
        console.warn("[knowledge-suggestions] upsert failed", err);
      }
    }

    // 5. Return current pending list.
    const { data: pending } = await supabase
      .from("entity_suggestions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("confidence", { ascending: false })
      .order("example_count", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return normalize(pending ?? []) as any;
  });

export const listEntitySuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: "pending" | "ignored" | "snoozed" | "accepted" } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("entity_suggestions").select("*").eq("user_id", userId);
    if (data.status) q = q.eq("status", data.status);
    q = q.order("confidence", { ascending: false }).order("example_count", { ascending: false });
    const { data: rows } = await q;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return normalize(rows ?? []) as any;
  });

export const acceptEntitySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { suggestionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("entity_suggestions")
      .select("*")
      .eq("user_id", userId)
      .eq("id", data.suggestionId)
      .maybeSingle();
    if (!row) throw new Error("Forslaget finnes ikke");
    if (row.status === "accepted") throw new Error("Allerede akseptert");

    const meta = (row.metadata ?? {}) as EntitySuggestion["metadata"];
    const suggestedMetadata = (meta.suggested_metadata ?? {}) as Record<string, unknown>;
    const exampleRefs = (meta.example_refs ?? []) as string[];

    const { slugifyEntityName } = await import("@/lib/knowledge/entity.server");
    const slug = await slugifyEntityName(supabase, userId, row.proposed_name as string);

    const { data: entity, error: insErr } = await supabase
      .from("entities")
      .insert({
        user_id: userId,
        type: row.proposed_type,
        name: row.proposed_name as string,
        slug,
        importance: 50,
        summary: null,
        metadata: suggestedMetadata as never,
      })
      .select("*")
      .single();
    if (insErr) throw insErr;

    // Link the example signals via a fresh auto-link pass over descriptors.
    let linkedCount = 0;
    try {
      const { buildMissionSignalDescriptors } = await import(
        "@/lib/mission-signals.server"
      );
      const { autoLinkMissionSignals } = await import(
        "@/lib/knowledge/auto-link.server"
      );
      const descriptors = await buildMissionSignalDescriptors(supabase, userId);
      const refSet = new Set(exampleRefs);
      const scoped = descriptors.filter((d) => refSet.has(d.externalRef));
      const linkMap = await autoLinkMissionSignals(supabase, userId, scoped);
      linkedCount = Object.values(linkMap).filter(
        (l) => l.entityId === (entity.id as string),
      ).length;
    } catch (err) {
      console.warn("[accept-suggestion] link pass failed", err);
    }

    await supabase
      .from("entity_suggestions")
      .update({ status: "accepted" })
      .eq("id", row.id)
      .eq("user_id", userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return normalize({ entity, linkedCount }) as any;
  });

export const ignoreEntitySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { suggestionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("entity_suggestions")
      .update({ status: "ignored", snoozed_until: null })
      .eq("id", data.suggestionId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const snoozeEntitySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { suggestionId: string; preset?: "week" | "month" }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const days = data.preset === "month" ? 30 : 7;
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("entity_suggestions")
      .update({ status: "snoozed", snoozed_until: until })
      .eq("id", data.suggestionId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true, snoozedUntil: until };
  });
