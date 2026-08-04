import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { osloWeekKey } from "@/lib/oslo-week";
import {
  currentWeekLabel,
  emptyWeeklyPlanPayload,
  normalizeWeeklyPlanPayload,
  type WeeklyPlan,
  type WeeklyPlanOrgOption,
  type WeeklyPlanPayload,
  type WeeklyPlanScope,
  type WeeklyPlanScopeSelection,
} from "@/lib/weekly-plan.types";

type DB = SupabaseClient<Database>;

export { currentWeekLabel };

function normalizeSelection(input: {
  scope?: WeeklyPlanScope;
  organizationId?: string | null;
}): WeeklyPlanScopeSelection {
  if (input.scope === "org" && input.organizationId) {
    return { scope: "org", organizationId: input.organizationId };
  }
  return { scope: "personal", organizationId: null };
}

export async function listWeeklyPlanOrgs(
  client: DB,
  userId: string,
): Promise<WeeklyPlanOrgOption[]> {
  const { data: memberships, error: memErr } = await client
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId);
  if (memErr) throw memErr;
  const orgIds = (memberships ?? []).map((m) => m.org_id as string);
  if (orgIds.length === 0) return [];

  const { data: orgs, error } = await client
    .from("organizations")
    .select("id, name, slug")
    .in("id", orgIds)
    .order("name");
  if (error) throw error;
  return (orgs ?? []).map((o) => ({
    id: o.id as string,
    name: o.name as string,
    slug: o.slug as string,
  }));
}

async function assertOrgMembership(
  client: DB,
  userId: string,
  organizationId: string,
): Promise<{ id: string; name: string }> {
  const { data: mem, error: memErr } = await client
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("org_id", organizationId)
    .maybeSingle();
  if (memErr) throw memErr;
  if (!mem) throw new Error("Du er ikke medlem av denne organisasjonen");

  const { data: org, error } = await client
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!org) throw new Error("Organisasjon ikke funnet");
  return { id: org.id as string, name: org.name as string };
}

export async function getWeeklyPlan(
  client: DB,
  userId: string,
  input: {
    weekKey?: string;
    scope?: WeeklyPlanScope;
    organizationId?: string | null;
  } = {},
): Promise<WeeklyPlan> {
  const weekKey = input.weekKey ?? osloWeekKey();
  const sel = normalizeSelection({
    scope: input.scope,
    organizationId: input.organizationId,
  });

  let organizationName: string | null = null;
  if (sel.scope === "org") {
    const org = await assertOrgMembership(client, userId, sel.organizationId);
    organizationName = org.name;
  }

  let query = client
    .from("weekly_plans")
    .select("payload, updated_at, week_key, scope, organization_id")
    .eq("user_id", userId)
    .eq("week_key", weekKey)
    .eq("scope", sel.scope);

  query =
    sel.scope === "personal"
      ? query.is("organization_id", null)
      : query.eq("organization_id", sel.organizationId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;

  return {
    weekKey,
    weekLabel: currentWeekLabel(),
    scope: sel.scope,
    organizationId: sel.organizationId,
    organizationName,
    payload: data?.payload
      ? normalizeWeeklyPlanPayload(data.payload)
      : emptyWeeklyPlanPayload(),
    updatedAt: (data?.updated_at as string | undefined) ?? null,
  };
}

export async function saveWeeklyPlan(
  client: DB,
  input: {
    userId: string;
    weekKey: string;
    payload: WeeklyPlanPayload;
    scope?: WeeklyPlanScope;
    organizationId?: string | null;
  },
): Promise<WeeklyPlan> {
  const payload = normalizeWeeklyPlanPayload(input.payload);
  const sel = normalizeSelection({
    scope: input.scope,
    organizationId: input.organizationId,
  });

  let organizationName: string | null = null;
  if (sel.scope === "org") {
    const org = await assertOrgMembership(client, input.userId, sel.organizationId);
    organizationName = org.name;
  }

  let find = client
    .from("weekly_plans")
    .select("id")
    .eq("user_id", input.userId)
    .eq("week_key", input.weekKey)
    .eq("scope", sel.scope);
  find =
    sel.scope === "personal"
      ? find.is("organization_id", null)
      : find.eq("organization_id", sel.organizationId);

  const { data: existing, error: findErr } = await find.maybeSingle();
  if (findErr) throw findErr;

  const row = {
    user_id: input.userId,
    week_key: input.weekKey,
    scope: sel.scope,
    organization_id: sel.organizationId,
    payload: payload as unknown as Json,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = existing?.id
    ? await client
        .from("weekly_plans")
        .update(row)
        .eq("id", existing.id as string)
        .select("payload, updated_at, week_key, scope, organization_id")
        .single()
    : await client
        .from("weekly_plans")
        .insert(row)
        .select("payload, updated_at, week_key, scope, organization_id")
        .single();

  if (error) throw error;

  return {
    weekKey: data.week_key as string,
    weekLabel: currentWeekLabel(),
    scope: (data.scope as WeeklyPlanScope) || sel.scope,
    organizationId: (data.organization_id as string | null) ?? sel.organizationId,
    organizationName,
    payload: normalizeWeeklyPlanPayload(data.payload),
    updatedAt: (data.updated_at as string) ?? null,
  };
}
