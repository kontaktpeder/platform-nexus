// Knowledge ServerFns — CRUD for entities, relationships, and signals.
// All ops go through requireSupabaseAuth (RLS as the signed-in user).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  Entity,
  EntityGraph,
  EntityRelationship,
  EntityRelationshipKind,
  EntitySignal,
  EntityType,
} from "@/lib/knowledge/types";
import { RELATIONSHIP_KINDS, ENTITY_TYPES } from "@/lib/knowledge/types";

function assertEntityType(v: unknown): EntityType {
  if (typeof v === "string" && (ENTITY_TYPES as string[]).includes(v)) return v as EntityType;
  throw new Error("Invalid entity type");
}

function assertRelKind(v: unknown): EntityRelationshipKind {
  if (typeof v === "string" && (RELATIONSHIP_KINDS as string[]).includes(v))
    return v as EntityRelationshipKind;
  throw new Error("Invalid relationship kind");
}

function assertString(v: unknown, field: string, max = 200): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim().slice(0, max);
}

// TSS serialization validator rejects `unknown` / `Record<string, unknown>`
// fields (metadata jsonb). Payload is real JSON — round-trip and cast to any.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(v: unknown): any {
  return JSON.parse(JSON.stringify(v ?? null));
}

// ─── Entities ───────────────────────────────────────────────────────────────

export const listEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { type?: EntityType } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("entities").select("*").eq("user_id", userId).order("name");
    if (data.type) q = q.eq("type", data.type);
    const { data: rows, error } = await q;
    if (error) throw error;
    return normalize(rows ?? []);
  });

export const getEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; slug?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.id && !data.slug) throw new Error("id or slug required");
    let q = supabase.from("entities").select("*").eq("user_id", userId).limit(1);
    if (data.id) q = q.eq("id", data.id);
    else if (data.slug) q = q.eq("slug", data.slug);
    const { data: row, error } = await q.maybeSingle();
    if (error) throw error;
    return normalize(row);
  });

export const createEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      type: EntityType;
      name: string;
      importance?: number;
      summary?: string | null;
      metadata?: Record<string, unknown>;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const type = assertEntityType(data.type);
    const name = assertString(data.name, "name", 200);
    const importance = clamp(data.importance ?? 50, 0, 100);
    const summary = data.summary ? String(data.summary).slice(0, 500) : null;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;

    const { slugifyEntityName } = await import("@/lib/knowledge/entity.server");
    const slug = await slugifyEntityName(supabase, userId, name);

    const { data: row, error } = await supabase
      .from("entities")
      .insert({
        user_id: userId,
        type,
        name,
        slug,
        importance,
        summary,
        metadata: metadata as never,
      })
      .select("*")
      .single();
    if (error) throw error;
    return normalize(row);
  });

export const updateEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      name?: string;
      summary?: string | null;
      importance?: number;
      metadata?: Record<string, unknown>;
      lastSeenAt?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.id) throw new Error("id required");
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = assertString(data.name, "name", 200);
    if (data.summary !== undefined)
      patch.summary = data.summary ? String(data.summary).slice(0, 500) : null;
    if (data.importance !== undefined) patch.importance = clamp(data.importance, 0, 100);
    if (data.metadata !== undefined) patch.metadata = data.metadata;
    if (data.lastSeenAt !== undefined) patch.last_seen_at = data.lastSeenAt;

    const { data: row, error } = await supabase
      .from("entities")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw error;
    return normalize(row);
  });

export const deleteEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("entities")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

// ─── Relationships ──────────────────────────────────────────────────────────

export const listRelationships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("entity_relationships").select("*").eq("user_id", userId);
    if (data.entityId) {
      q = q.or(`from_entity_id.eq.${data.entityId},to_entity_id.eq.${data.entityId}`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return normalize(rows ?? []);
  });

export const createRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      fromEntityId: string;
      toEntityId: string;
      kind: EntityRelationshipKind;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.fromEntityId || !data.toEntityId) throw new Error("entities required");
    if (data.fromEntityId === data.toEntityId) throw new Error("self relationship");
    const kind = assertRelKind(data.kind);
    const { data: row, error } = await supabase
      .from("entity_relationships")
      .upsert(
        {
          user_id: userId,
          from_entity_id: data.fromEntityId,
          to_entity_id: data.toEntityId,
          kind,
        },
        { onConflict: "user_id,from_entity_id,to_entity_id,kind" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return normalize(row);
  });

export const deleteRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("entity_relationships")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

// ─── Signals ────────────────────────────────────────────────────────────────

export const linkSignalToEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      entityId: string;
      source: string;
      signalType: string;
      externalRef: string;
      occurredAt?: string | null;
      snippet?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const source = assertString(data.source, "source", 40);
    const signalType = assertString(data.signalType, "signalType", 60);
    const externalRef = assertString(data.externalRef, "externalRef", 300);
    const snippet = data.snippet ? String(data.snippet).slice(0, 160) : null;
    const { data: row, error } = await supabase
      .from("entity_signals")
      .upsert(
        {
          user_id: userId,
          entity_id: data.entityId,
          source,
          signal_type: signalType,
          external_ref: externalRef,
          occurred_at: data.occurredAt ?? null,
          snippet,
        },
        { onConflict: "user_id,external_ref" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return normalize(row);
  });

export const unlinkSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { externalRef: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("entity_signals")
      .delete()
      .eq("user_id", userId)
      .eq("external_ref", data.externalRef);
    if (error) throw error;
    return { ok: true };
  });

export const listSignalsForEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityId: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const limit = Math.min(Math.max(data.limit ?? 50, 1), 200);
    const { data: rows, error } = await supabase
      .from("entity_signals")
      .select("*")
      .eq("user_id", userId)
      .eq("entity_id", data.entityId)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return normalize(rows ?? []);
  });

// ─── Graph (BFS depth ≤ 2, ≤ 50 nodes) ──────────────────────────────────────

export const getEntityGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rootEntityId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const MAX_NODES = 50;

    let root: Entity | null = null;
    let seedIds: string[] = [];

    if (data.rootEntityId) {
      const { data: rootRow } = await supabase
        .from("entities")
        .select("*")
        .eq("user_id", userId)
        .eq("id", data.rootEntityId)
        .maybeSingle();
      root = (rootRow ?? null) as Entity | null;
      if (!root) return normalize({ root: null, entities: [], relationships: [], signals: [] });
      seedIds = [root.id];
    } else {
      const { data: rows } = await supabase
        .from("entities")
        .select("id")
        .eq("user_id", userId)
        .order("importance", { ascending: false })
        .limit(MAX_NODES);
      seedIds = (rows ?? []).map((r) => r.id as string);
    }

    const visited = new Set<string>(seedIds);
    let frontier = [...seedIds];
    const allRels: EntityRelationship[] = [];

    for (let depth = 0; depth < 2 && visited.size < MAX_NODES && frontier.length > 0; depth += 1) {
      const { data: rels } = await supabase
        .from("entity_relationships")
        .select("*")
        .eq("user_id", userId)
        .or(
          `from_entity_id.in.(${frontier.join(",")}),to_entity_id.in.(${frontier.join(",")})`,
        );
      const next: string[] = [];
      for (const r of (rels ?? []) as EntityRelationship[]) {
        allRels.push(r);
        for (const nid of [r.from_entity_id, r.to_entity_id]) {
          if (!visited.has(nid) && visited.size < MAX_NODES) {
            visited.add(nid);
            next.push(nid);
          }
        }
      }
      frontier = next;
    }

    const ids = Array.from(visited).slice(0, MAX_NODES);
    const [{ data: entities }, { data: signals }] = await Promise.all([
      supabase.from("entities").select("*").eq("user_id", userId).in("id", ids),
      supabase
        .from("entity_signals")
        .select("*")
        .eq("user_id", userId)
        .in("entity_id", ids)
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .limit(200),
    ]);

    return normalize({
      root,
      entities: (entities ?? []) as Entity[],
      relationships: allRels,
      signals: (signals ?? []) as EntitySignal[],
    });
  });

// ─── Dev seed ───────────────────────────────────────────────────────────────

export const seedKnowledgeDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("entities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) > 0) return { seeded: false };

    const { slugifyEntityName } = await import("@/lib/knowledge/entity.server");

    async function make(
      type: EntityType,
      name: string,
      importance: number,
      summary: string | null,
      metadata: Record<string, unknown> = {},
    ) {
      const slug = await slugifyEntityName(supabase, userId, name);
      const { data, error } = await supabase
        .from("entities")
        .insert({ user_id: userId, type, name, slug, importance, summary, metadata: metadata as never })
        .select("*")
        .single();
      if (error) throw error;
      return data as Entity;
    }

    const gos = await make("project", "Gold of Sicily", 75, null, {
      platform_org_slug: "gold-of-sicily-as",
    });
    const nordahl = await make(
      "company",
      "Nordahl Events",
      80,
      "Customer — proposal sent, waiting on reply.",
    );
    const dennis = await make("person", "Dennis", 70, null);

    await supabase.from("entity_relationships").insert([
      { user_id: userId, from_entity_id: nordahl.id, to_entity_id: gos.id, kind: "customer_of" },
      { user_id: userId, from_entity_id: dennis.id, to_entity_id: gos.id, kind: "works_on" },
      { user_id: userId, from_entity_id: dennis.id, to_entity_id: nordahl.id, kind: "related_to" },
    ]);

    return { seeded: true };
  });

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
