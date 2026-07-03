// Server-only: idempotent seed of the three Knowledge context anchors.
// See docs/RELATIONSHIP_ENGINE.v0.md ("Anchors" section).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ANCHOR_DEFINITIONS } from "./anchors";
import { ANCHOR_SLUGS, type Entity, type EntityMetadata } from "./types";

type DB = SupabaseClient<Database>;

export type AnchorEntity = Entity & {
  signal_count: number;
  relationship_count: number;
};

async function resolveGoldOfSicilyOrg(
  supabase: DB,
  userId: string,
): Promise<{ orgSlug: string | null; orgId: string | null }> {
  const { data: memberships } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId);
  const ids = (memberships ?? []).map((m) => m.org_id as string);
  if (ids.length === 0) return { orgSlug: null, orgId: null };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: orgs } = await supabaseAdmin
    .from("organizations")
    .select("id, slug")
    .in("id", ids);
  const list = (orgs ?? []) as { id: string; slug: string }[];
  if (list.length === 0) return { orgSlug: null, orgId: null };

  const exact = list.find((o) => o.slug === "gold-of-sicily");
  if (exact) return { orgSlug: exact.slug, orgId: exact.id };
  const goldish = list
    .filter((o) => /^gold/i.test(o.slug) || /sicily/i.test(o.slug))
    .sort((a, b) => a.slug.length - b.slug.length);
  if (goldish[0]) return { orgSlug: goldish[0].slug, orgId: goldish[0].id };
  return { orgSlug: null, orgId: null };
}

export async function ensureAnchorEntities(
  supabase: DB,
  userId: string,
): Promise<{ anchors: Entity[]; created: number; updated: number }> {
  const { orgSlug, orgId } = await resolveGoldOfSicilyOrg(supabase, userId).catch(
    () => ({ orgSlug: null, orgId: null }),
  );

  let created = 0;
  let updated = 0;
  const anchors: Entity[] = [];

  for (const def of Object.values(ANCHOR_DEFINITIONS)) {
    const desiredMeta: EntityMetadata = { ...def.metadata };
    if (def.slug === "gold-of-sicily") {
      desiredMeta.platform_org_slug = orgSlug;
      if (orgId) desiredMeta.platform_org_id = orgId;
    }

    const { data: existing } = await supabase
      .from("entities")
      .select("*")
      .eq("user_id", userId)
      .eq("slug", def.slug)
      .maybeSingle();

    if (existing) {
      const existingMeta = (existing.metadata ?? {}) as EntityMetadata;
      const isAnchor = existingMeta.is_anchor === true;
      const patch: Record<string, unknown> = {
        owner_context: def.owner_context,
      };

      if (!isAnchor) {
        // Migration path: reclaim existing row (e.g. from demo seed) as anchor.
        patch.name = def.name;
        patch.type = def.type;
        patch.summary = def.summary;
        patch.importance = def.importance;
        patch.metadata = { ...existingMeta, ...desiredMeta, is_anchor: true };
      } else if (def.slug === "gold-of-sicily") {
        // Refresh platform_org linkage only; preserve user edits.
        patch.metadata = {
          ...existingMeta,
          platform_org_slug: orgSlug,
          platform_org_id: orgId ?? existingMeta.platform_org_id ?? null,
          is_anchor: true,
        };
      }

      const { data: row } = await supabase
        .from("entities")
        .update(patch as never)
        .eq("id", existing.id)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (row) anchors.push(row as unknown as Entity);
      updated += 1;
    } else {
      const { data: row, error } = await supabase
        .from("entities")
        .insert({
          user_id: userId,
          slug: def.slug,
          name: def.name,
          type: def.type,
          importance: def.importance,
          summary: def.summary,
          owner_context: def.owner_context,
          metadata: desiredMeta as never,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      if (row) anchors.push(row as unknown as Entity);
      created += 1;
    }
  }

  return { anchors, created, updated };
}

export async function listAnchorEntitiesWithCounts(
  supabase: DB,
  userId: string,
): Promise<AnchorEntity[]> {
  await ensureAnchorEntities(supabase, userId).catch((err) => {
    console.warn("[anchors] ensure failed", err);
  });

  const { data: rows } = await supabase
    .from("entities")
    .select("*")
    .eq("user_id", userId)
    .in("slug", ANCHOR_SLUGS as unknown as string[]);
  const anchors = (rows ?? []) as unknown as Entity[];
  if (anchors.length === 0) return [];

  const ids = anchors.map((a) => a.id);
  const [sigRes, relRes] = await Promise.all([
    supabase
      .from("entity_signals")
      .select("entity_id")
      .eq("user_id", userId)
      .in("entity_id", ids),
    supabase
      .from("entity_relationships")
      .select("from_entity_id,to_entity_id")
      .eq("user_id", userId)
      .or(
        `from_entity_id.in.(${ids.join(",")}),to_entity_id.in.(${ids.join(",")})`,
      ),
  ]);

  const sigCounts = new Map<string, number>();
  for (const r of (sigRes.data ?? []) as { entity_id: string }[]) {
    sigCounts.set(r.entity_id, (sigCounts.get(r.entity_id) ?? 0) + 1);
  }
  const relCounts = new Map<string, number>();
  for (const r of (relRes.data ?? []) as {
    from_entity_id: string;
    to_entity_id: string;
  }[]) {
    for (const id of [r.from_entity_id, r.to_entity_id]) {
      if (ids.includes(id)) relCounts.set(id, (relCounts.get(id) ?? 0) + 1);
    }
  }

  // Return in anchor definition order for stable UI.
  const bySlug = new Map(anchors.map((a) => [a.slug, a]));
  const ordered: AnchorEntity[] = [];
  for (const slug of ANCHOR_SLUGS) {
    const a = bySlug.get(slug);
    if (a) {
      ordered.push({
        ...a,
        signal_count: sigCounts.get(a.id) ?? 0,
        relationship_count: relCounts.get(a.id) ?? 0,
      });
    }
  }
  return ordered;
}
