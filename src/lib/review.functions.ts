// Relationship Engine v0 — Pakke 4 (Review)
// Unified AI inbox: entity + relation suggestions.
// All writes go through here; suggestions stay inert until user approves.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EntityType, EntityRelationshipKind, OwnerContext } from "@/lib/knowledge/types";

export type ReviewSignalCtx = {
  id: string;
  source: string;
  summary: string | null;
  occurred_at: string | null;
  metadata: Record<string, unknown> | null;
} | null;

export type ReviewEntityItem = {
  kind: "entity";
  id: string;
  createdAt: string;
  proposedName: string;
  proposedType: EntityType;
  ownerContext: OwnerContext | null;
  confidence: "low" | "medium" | "high";
  reason: string;
  exampleCount: number;
  suggestionKey: string;
  metadata: Record<string, unknown>;
  signal: ReviewSignalCtx;
};

export type ReviewRelationItem = {
  kind: "relation";
  id: string;
  createdAt: string;
  relationType: EntityRelationshipKind;
  confidence: number | null;
  reason: string | null;
  from: { entityId: string | null; suggestionId: string | null; label: string };
  to: { entityId: string | null; suggestionId: string | null; label: string };
  fromResolved: boolean;
  toResolved: boolean;
  signal: ReviewSignalCtx;
};

export type ReviewItem = ReviewEntityItem | ReviewRelationItem;

export type ReviewFeed = {
  items: ReviewItem[];
  existingEntities: { id: string; name: string; type: EntityType }[];
  counts: { total: number; entities: number; relations: number; context: number };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize<T>(v: T): T { return JSON.parse(JSON.stringify(v ?? null)) as T; }

export const listReviewFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ context }): Promise<any> => {
    const { supabase, userId } = context;

    const [entRes, relRes, entListRes] = await Promise.all([
      supabase
        .from("entity_suggestions")
        .select("id, created_at, proposed_name, proposed_type, owner_context, confidence, reason, example_count, suggestion_key, metadata, raw_signal_id")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("relation_suggestions")
        .select("id, created_at, relation_type, confidence, reasoning, from_entity_id, to_entity_id, from_suggestion_id, to_suggestion_id, raw_signal_id")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("entities")
        .select("id, name, type")
        .eq("user_id", userId)
        .order("importance", { ascending: false })
        .limit(500),
    ]);

    const entRows = entRes.data ?? [];
    const relRows = relRes.data ?? [];
    const entityList = (entListRes.data ?? []) as { id: string; name: string; type: EntityType }[];
    const entityById = new Map(entityList.map((e) => [e.id, e]));
    const suggById = new Map(entRows.map((r) => [r.id as string, r]));

    // Fetch signals referenced by any row.
    const signalIds = Array.from(new Set([
      ...entRows.map((r) => r.raw_signal_id).filter((x): x is string => !!x),
      ...relRows.map((r) => r.raw_signal_id).filter((x): x is string => !!x),
    ]));
    let signalMap = new Map<string, ReviewSignalCtx>();
    if (signalIds.length) {
      const { data: sigs } = await supabase
        .from("raw_signals")
        .select("id, source, summary, occurred_at, metadata")
        .in("id", signalIds)
        .eq("user_id", userId);
      signalMap = new Map((sigs ?? []).map((s) => [
        s.id as string,
        {
          id: s.id as string,
          source: s.source as string,
          summary: s.summary as string | null,
          occurred_at: s.occurred_at as string | null,
          metadata: (s.metadata as Record<string, unknown> | null) ?? null,
        },
      ]));
    }

    const items: ReviewItem[] = [];

    for (const r of entRows) {
      items.push({
        kind: "entity",
        id: r.id as string,
        createdAt: r.created_at as string,
        proposedName: r.proposed_name as string,
        proposedType: r.proposed_type as EntityType,
        ownerContext: (r.owner_context as OwnerContext | null) ?? null,
        confidence: r.confidence as "low" | "medium" | "high",
        reason: r.reason as string,
        exampleCount: (r.example_count as number) ?? 0,
        suggestionKey: r.suggestion_key as string,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        signal: r.raw_signal_id ? signalMap.get(r.raw_signal_id as string) ?? null : null,
      });
    }

    const labelFor = (entityId: string | null, suggestionId: string | null): { label: string; resolved: boolean } => {
      if (entityId) {
        const e = entityById.get(entityId);
        return { label: e ? e.name : "(ukjent entitet)", resolved: true };
      }
      if (suggestionId) {
        const s = suggById.get(suggestionId);
        return { label: s ? `${s.proposed_name} (forslag)` : "(ukjent forslag)", resolved: false };
      }
      return { label: "(mangler)", resolved: false };
    };

    for (const r of relRows) {
      const from = labelFor(r.from_entity_id as string | null, r.from_suggestion_id as string | null);
      const to = labelFor(r.to_entity_id as string | null, r.to_suggestion_id as string | null);
      items.push({
        kind: "relation",
        id: r.id as string,
        createdAt: r.created_at as string,
        relationType: r.relation_type as EntityRelationshipKind,
        confidence: r.confidence as number | null,
        reason: r.reasoning as string | null,
        from: { entityId: r.from_entity_id as string | null, suggestionId: r.from_suggestion_id as string | null, label: from.label },
        to: { entityId: r.to_entity_id as string | null, suggestionId: r.to_suggestion_id as string | null, label: to.label },
        fromResolved: from.resolved,
        toResolved: to.resolved,
        signal: r.raw_signal_id ? signalMap.get(r.raw_signal_id as string) ?? null : null,
      });
    }

    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const counts = {
      total: items.length,
      entities: items.filter((i) => i.kind === "entity" && !(i as ReviewEntityItem).ownerContext).length,
      context: items.filter((i) => i.kind === "entity" && !!(i as ReviewEntityItem).ownerContext).length,
      relations: items.filter((i) => i.kind === "relation").length,
    };

    return normalize({ items, existingEntities: entityList, counts });
  });

export const getReviewCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ total: number }> => {
    const { supabase, userId } = context;
    const [a, b] = await Promise.all([
      supabase.from("entity_suggestions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending"),
      supabase.from("relation_suggestions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending"),
    ]);
    return { total: (a.count ?? 0) + (b.count ?? 0) };
  });

// ── Entity actions ────────────────────────────────────────────────────────

const OWNER_CONTEXT_VALUES = ["personal", "peder-enk", "gold-of-sicily", "unknown"] as const;

export const acceptEntitySuggestionV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      suggestionId: z.string().uuid(),
      ownerContext: z.enum(OWNER_CONTEXT_VALUES).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("entity_suggestions")
      .select("*")
      .eq("id", data.suggestionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Forslaget finnes ikke");
    if (row.status === "accepted") throw new Error("Allerede akseptert");

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const suggestedMetadata = (meta.suggested_metadata ?? {}) as Record<string, unknown>;
    const mergedMeta = { ...suggestedMetadata, ...meta };
    delete (mergedMeta as { suggested_metadata?: unknown }).suggested_metadata;
    delete (mergedMeta as { source_signal?: unknown }).source_signal;

    const ownerContext = data.ownerContext ?? (row.owner_context as OwnerContext | null) ?? null;
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
        owner_context: (ownerContext && ownerContext !== "unknown" ? ownerContext : null) as never,
        metadata: mergedMeta as never,
      })
      .select("id, name, slug, type, owner_context")
      .single();
    if (insErr) throw insErr;

    // Promote any pending relation_suggestions that reference this suggestion.
    await supabase
      .from("relation_suggestions")
      .update({ from_entity_id: entity.id, from_suggestion_id: null })
      .eq("user_id", userId)
      .eq("from_suggestion_id", row.id);
    await supabase
      .from("relation_suggestions")
      .update({ to_entity_id: entity.id, to_suggestion_id: null })
      .eq("user_id", userId)
      .eq("to_suggestion_id", row.id);

    await supabase
      .from("entity_suggestions")
      .update({ status: "accepted" })
      .eq("id", row.id)
      .eq("user_id", userId);

    return normalize({ entity });
  });

export const mergeEntitySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ suggestionId: z.string().uuid(), targetEntityId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Rewire relation suggestions that pointed to this suggestion.
    await supabase
      .from("relation_suggestions")
      .update({ from_entity_id: data.targetEntityId, from_suggestion_id: null })
      .eq("user_id", userId)
      .eq("from_suggestion_id", data.suggestionId);
    await supabase
      .from("relation_suggestions")
      .update({ to_entity_id: data.targetEntityId, to_suggestion_id: null })
      .eq("user_id", userId)
      .eq("to_suggestion_id", data.suggestionId);

    const { error } = await supabase
      .from("entity_suggestions")
      .update({
        status: "accepted",
        metadata: { merged_into_entity_id: data.targetEntityId } as never,
      })
      .eq("id", data.suggestionId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const rejectEntitySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ suggestionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("entity_suggestions")
      .update({ status: "ignored" })
      .eq("id", data.suggestionId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

// ── Relation actions ──────────────────────────────────────────────────────

export const acceptRelationSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ suggestionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("relation_suggestions")
      .select("*")
      .eq("id", data.suggestionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Forslaget finnes ikke");
    if (row.status !== "pending") throw new Error("Allerede behandlet");
    if (!row.from_entity_id || !row.to_entity_id) {
      throw new Error("Godkjenn tilhørende entitets-forslag først");
    }

    const { error: insErr } = await supabase
      .from("entity_relationships")
      .insert({
        user_id: userId,
        from_entity_id: row.from_entity_id as string,
        to_entity_id: row.to_entity_id as string,
        kind: row.relation_type as EntityRelationshipKind,
        source: "ai_review",
        status: "confirmed",
        confidence: (row.confidence as number | null) ?? null,
        last_signal_at: new Date().toISOString(),
        metadata: {
          from_suggestion_id: data.suggestionId,
          raw_signal_id: row.raw_signal_id ?? null,
          reason: row.reasoning ?? null,
        } as never,
      });
    if (insErr) throw insErr;

    await supabase
      .from("relation_suggestions")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("user_id", userId);

    return { ok: true };
  });

export const rejectRelationSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ suggestionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("relation_suggestions")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", data.suggestionId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });
