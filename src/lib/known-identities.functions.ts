// Server functions for the known_identities layer.
// See docs/KNOWN_IDENTITIES.v0.md

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EntityType } from "@/lib/knowledge/types";
import type { KnownIdentity } from "@/lib/knowledge/identity/types";

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
    return normalize(rows ?? []) as KnownIdentity[];
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
    const { supabase, userId } = context;
    const { data: identity, error: idErr } = await supabase
      .from("known_identities")
      .select("*")
      .eq("id", data.identityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (idErr) throw idErr;
    if (!identity) throw new Error("Identitet finnes ikke");
    if (identity.entity_id) throw new Error("Identitet er allerede koblet");

    const name =
      (data.name ?? identity.display_name ?? identity.email ?? identity.external_key)?.trim();
    if (!name) throw new Error("Navn mangler");

    const { slugifyEntityName } = await import("@/lib/knowledge/entity.server");
    const { setIdentityEntityLink } = await import(
      "@/lib/knowledge/identity/identity.server"
    );
    const slug = await slugifyEntityName(supabase, userId, name);
    const metadata: Record<string, unknown> = {};
    if (identity.email) metadata.email = identity.email;
    if (identity.domain) metadata.email_domain = identity.domain;
    if (identity.identity_type === "slack_user") {
      metadata.slack_user_id = identity.external_key;
    }
    if (identity.identity_type === "slack_channel") {
      metadata.slack_channel_id = identity.external_key;
    }

    const { data: entity, error: insErr } = await supabase
      .from("entities")
      .insert({
        user_id: userId,
        type: data.type,
        name,
        slug,
        importance: data.importance ?? 50,
        summary: null,
        metadata: metadata as never,
      })
      .select("*")
      .single();
    if (insErr) throw insErr;

    const linkResult = await setIdentityEntityLink(
      supabase,
      userId,
      data.identityId,
      entity.id as string,
    );

    await supabase
      .from("entity_suggestions")
      .update({ status: "accepted" })
      .eq("user_id", userId)
      .eq("known_identity_id", data.identityId)
      .eq("status", "pending");

    return normalize({ entity, linkedSignalCount: linkResult.linkedSignalCount });
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

export const syncIdentityPromotions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncPromotionSuggestions } = await import(
      "@/lib/knowledge/identity/identity.server"
    );
    const count = await syncPromotionSuggestions(context.supabase, context.userId);
    return { synced: count };
  });
