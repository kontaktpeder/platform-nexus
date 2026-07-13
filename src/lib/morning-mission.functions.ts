// Morning Mission v0 — generateMorningMission / getMorningMission / actOnMorningItem
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { MorningMissionPayload, MorningMissionResponse } from "@/lib/morning-mission.types";
import type { MissionActionState } from "@/lib/mission-action-state";
import { snoozeUntil } from "@/lib/mission-snooze";

type DB = SupabaseClient<Database>;

function todayOsloISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function briefItemKey(itemId: string): string {
  return `brief:${itemId}`;
}

function filterPayloadByStates(
  payload: MorningMissionPayload,
  states: MissionActionState[],
): MorningMissionPayload {
  const byKey = new Map(states.map((s) => [s.action_key, s]));
  const now = Date.now();

  const hide = (item: { id: string; source_ids: string[] }) => {
    const k = briefItemKey(item.id);
    const s = byKey.get(k);
    if (s?.status === "dismissed" || s?.status === "handled_locally") return true;
    if (s?.status === "snoozed" && s.snoozed_until) {
      return new Date(s.snoozed_until).getTime() > now;
    }
    for (const sid of item.source_ids) {
      const ss = byKey.get(sid);
      if (ss?.status === "dismissed" || ss?.status === "handled_locally") return true;
    }
    return false;
  };

  const filterItems = <T extends { id: string; source_ids: string[] }>(items: T[]) =>
    items.filter((i) => !hide(i));

  return {
    ...payload,
    today: filterItems(payload.today),
    this_week: filterItems(payload.this_week),
    waiting: filterItems(payload.waiting),
    closed: filterItems(payload.closed),
  };
}

async function loadWorkspacesForUser(supabase: DB, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: memberships } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId);
  const orgIds = (memberships ?? []).map((m) => m.org_id as string);
  if (!orgIds.length) return [];

  const { data: orgs } = await supabaseAdmin
    .from("organizations")
    .select("id, name, slug")
    .in("id", orgIds);
  const { data: workspaces } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, slug, org_id")
    .in("org_id", orgIds);

  const orgById = new Map((orgs ?? []).map((o) => [o.id as string, o]));
  const { fetchWorkspaceModuleAlerts } = await import("@/lib/module-alerts.server");

  return Promise.all(
    (workspaces ?? []).map(async (ws) => {
      const org = orgById.get(ws.org_id as string);
      const alertsRes = await fetchWorkspaceModuleAlerts({
        supabaseAdmin,
        orgId: ws.org_id as string,
        workspaceId: ws.id as string,
      }).catch(() => ({ alerts: {}, errors: {} }));
      return {
        orgId: ws.org_id as string,
        workspaceId: ws.id as string,
        orgSlug: (org?.slug as string) ?? "",
        orgName: (org?.name as string) ?? "",
        wsName: ws.name as string,
        moduleAlerts: alertsRes.alerts,
        moduleAlertErrors: alertsRes.errors,
      };
    }),
  );
}

async function buildMorningMission(
  supabase: DB,
  userId: string,
  userEmail: string | null,
  userName: string | null,
): Promise<{ payload: MorningMissionPayload; sourceSignalIds: string[] }> {
  const { gatherMorningSignals } = await import("@/lib/morning-mission/signal-gather.server");
  const { prefilterSignals } = await import("@/lib/morning-mission/signal-prefilter.server");
  const { generateMorningMissionAi } = await import(
    "@/lib/morning-mission/morning-mission-ai.server"
  );
  const { listMissionActionStates } = await import("@/lib/mission-action-state.server");
  const { listMissionHints } = await import("@/lib/mission-hints.server");

  const workspaces = await loadWorkspacesForUser(supabase, userId);
  const { signals: allSignals, slackStatus } = await gatherMorningSignals({ workspaces, userId });
  const actionStates = await listMissionActionStates(supabase, userId);
  const hints = await listMissionHints(supabase, userId);
  const { forAi } = prefilterSignals({ signals: allSignals, userEmail, actionStates, hints });
  const payload = await generateMorningMissionAi({
    signals: forAi,
    userName,
    userEmail,
    hints,
    slackStatus,
  });
  const sourceSignalIds = forAi.map((s) => s.id);
  return { payload: { ...payload, slack_status: slackStatus }, sourceSignalIds };
}

async function resolveUserEmail(supabase: DB, claims: Record<string, unknown>): Promise<string | null> {
  const fromClaims = (claims.email as string | undefined) ?? null;
  if (fromClaims) return fromClaims;
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

async function getCachedBrief(supabase: DB, userId: string, briefDate: string) {
  const { data } = await supabase
    .from("morning_mission_briefs")
    .select("payload, source_signal_ids, generated_at")
    .eq("user_id", userId)
    .eq("brief_date", briefDate)
    .maybeSingle();
  if (!data) return null;
  return {
    payload: data.payload as unknown as MorningMissionPayload,
    source_signal_ids: data.source_signal_ids as string[],
    generated_at: data.generated_at as string,
  };
}

export const getMorningMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ force: z.boolean().optional() }).optional().parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<MorningMissionResponse> => {
    const { supabase, userId, claims } = context;
    const briefDate = todayOsloISO();
    const claimsRec = claims as Record<string, unknown>;
    const userEmail = await resolveUserEmail(supabase, claimsRec);
    const userName =
      (claimsRec.given_name as string | undefined) ||
      (claimsRec.name as string | undefined) ||
      userEmail?.split("@")[0] ||
      null;

    const { listMissionActionStates } = await import("@/lib/mission-action-state.server");
    const { listMissionHints } = await import("@/lib/mission-hints.server");
    const actionStates = await listMissionActionStates(supabase, userId);
    const hints = await listMissionHints(supabase, userId);

    let cached = data?.force ? null : await getCachedBrief(supabase, userId, briefDate);
    const fromCache = !!cached;

    if (!cached) {
      const built = await buildMorningMission(supabase, userId, userEmail, userName);
      const { error } = await supabase.from("morning_mission_briefs").upsert(
        {
          user_id: userId,
          brief_date: briefDate,
          payload: built.payload as unknown as Record<string, unknown>,
          source_signal_ids: built.sourceSignalIds,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,brief_date" },
      );
      if (error) throw error;
      cached = {
        payload: built.payload,
        source_signal_ids: built.sourceSignalIds,
        generated_at: new Date().toISOString(),
      };
    }

    const { applyTrustRules } = await import("@/lib/morning-mission/morning-mission-trust.server");
    const { gatherMorningSignals } = await import("@/lib/morning-mission/signal-gather.server");
    const { prefilterSignals } = await import("@/lib/morning-mission/signal-prefilter.server");
    const workspaces = await loadWorkspacesForUser(supabase, userId);
    const { signals: allSignals, slackStatus } = await gatherMorningSignals({ workspaces, userId });
    const { forAi } = prefilterSignals({ signals: allSignals, userEmail, actionStates, hints });
    const trusted = applyTrustRules(cached.payload, forAi, userEmail);
    const filtered = filterPayloadByStates(trusted, actionStates);

    return {
      briefDate,
      generatedAt: cached.generated_at,
      payload: { ...filtered, slack_status: slackStatus },
      sourceSignalIds: cached.source_signal_ids,
      fromCache,
    };
  });

export const actOnMorningItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemId: z.string().min(1),
        action: z.enum(["done", "snoozed", "waiting", "ignored"]),
        snoozePreset: z.enum(["later_today", "tomorrow", "next_week"]).optional(),
        sourceIds: z.array(z.string()).optional(),
        hint: z
          .object({
            match_kind: z.enum([
              "from_email",
              "to_email",
              "subject_contains",
              "tag",
              "source_id",
            ]),
            match_value: z.string().min(1),
            hint_text: z.string().min(1),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { upsertMissionActionState } = await import("@/lib/mission-action-state.server");
    const { upsertMissionHint } = await import("@/lib/mission-hints.server");
    const key = briefItemKey(data.itemId);

    const statusMap = {
      done: "handled_locally" as const,
      ignored: "dismissed" as const,
      waiting: "waiting" as const,
      snoozed: "snoozed" as const,
    };

    const status = statusMap[data.action];

    await upsertMissionActionState(context.supabase, {
      userId: context.userId,
      actionKey: key,
      status,
      snoozedUntil: data.action === "snoozed" ? snoozeUntil(data.snoozePreset ?? "tomorrow") : null,
    });

    const dismissKeys = new Set<string>([key, ...(data.sourceIds ?? [])]);
    for (const sourceKey of dismissKeys) {
      if (sourceKey === key) continue;
      await upsertMissionActionState(context.supabase, {
        userId: context.userId,
        actionKey: sourceKey,
        status: data.action === "ignored" ? "dismissed" : status,
        snoozedUntil:
          data.action === "snoozed" ? snoozeUntil(data.snoozePreset ?? "tomorrow") : null,
      });
    }

    if (data.hint) {
      await upsertMissionHint(context.supabase, {
        userId: context.userId,
        hint: data.hint,
      });
      await context.supabase
        .from("morning_mission_briefs")
        .delete()
        .eq("user_id", context.userId)
        .eq("brief_date", todayOsloISO());
    }

    return { ok: true as const, learned: !!data.hint };
  });

export const undoMorningItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ itemId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { deleteMissionActionState } = await import("@/lib/mission-action-state.server");
    await deleteMissionActionState(context.supabase, {
      userId: context.userId,
      actionKey: briefItemKey(data.itemId),
    });
    return { ok: true as const };
  });
