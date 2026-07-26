// Server functions for the known_identities layer.
// See docs/KNOWN_IDENTITIES.v0.md

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EntityType } from "@/lib/knowledge/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(v: unknown): any {
  return JSON.parse(JSON.stringify(v ?? null));
}

export const listKnownIdentities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { linked?: boolean; limit?: number } | undefined) => input ?? {},
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const limit = Math.min(Math.max(data.limit ?? 100, 1), 500);
    let q = supabase
      .from("known_identities")
      .select("*")
      .eq("user_id", userId)
      .is("ignored_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(limit);

    if (data.linked === true) q = q.not("entity_id", "is", null);
    else if (data.linked === false) q = q.is("entity_id", null);

    const { data: rows, error } = await q;
    if (error) throw error;
    return normalize(rows ?? []);
  });

export const linkIdentityToEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { identityId: string; entityId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { setIdentityEntityLink } = await import(
      "@/lib/knowledge/identity/identity.server"
    );

    const { data: entity } = await supabase
      .from("entities")
      .select("id")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!entity) throw new Error("Entity finnes ikke");

    const result = await setIdentityEntityLink(
      supabase,
      userId,
      data.identityId,
      data.entityId,
    );

    await supabase
      .from("entity_suggestions")
      .update({ status: "accepted" })
      .eq("user_id", userId)
      .eq("known_identity_id", data.identityId)
      .eq("status", "pending");

    return normalize(result);
  });

export const promoteIdentityToEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      identityId: string;
      type: EntityType;
      name?: string;
      importance?: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { promoteKnownIdentityToEntity } = await import(
      "@/lib/knowledge/identity/identity.server"
    );
    const type =
      data.type === "person" || data.type === "company" ? data.type : "person";
    const result = await promoteKnownIdentityToEntity(
      context.supabase,
      context.userId,
      data.identityId,
      {
        type,
        name: data.name,
        importance: data.importance,
        source: "manual",
      },
    );

    const { data: entity } = await context.supabase
      .from("entities")
      .select("*")
      .eq("id", result.entityId)
      .eq("user_id", context.userId)
      .maybeSingle();

    return normalize({
      entity,
      linkedSignalCount: result.linkedSignalCount,
      created: result.created,
    });
  });

export const ignoreKnownIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { identityId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("known_identities")
      .update({ ignored_at: now })
      .eq("id", data.identityId)
      .eq("user_id", userId);
    if (error) throw error;

    await supabase
      .from("entity_suggestions")
      .update({ status: "ignored" })
      .eq("user_id", userId)
      .eq("known_identity_id", data.identityId)
      .eq("status", "pending");

    return { ok: true };
  });

/** «Dette stemmer ikke» — ignore linked identities and delete the entity. */
export const rejectWrongEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityId: string }) => input)
  .handler(async ({ data, context }) => {
    const { rejectWrongEntity: run } = await import(
      "@/lib/knowledge/identity/identity.server"
    );
    return run(context.supabase, context.userId, data.entityId);
  });

export const syncIdentityPromotions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncPromotionSuggestions, autoPromoteEligibleIdentities } =
      await import("@/lib/knowledge/identity/identity.server");
    const promoted = await autoPromoteEligibleIdentities(
      context.supabase,
      context.userId,
    );
    const synced = await syncPromotionSuggestions(
      context.supabase,
      context.userId,
    );
    return { synced, ...promoted };
  });

export const runAutoPromoteIdentities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { autoPromoteEligibleIdentities } = await import(
      "@/lib/knowledge/identity/identity.server"
    );
    return autoPromoteEligibleIdentities(context.supabase, context.userId);
  });
