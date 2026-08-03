/**
 * Desk queue — raw signals, no AI ranking.
 * User completes / snoozes / removes; next items fill the visible slots.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MissionActionState } from "@/lib/mission-action-state";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import type { DeskQueueItem, DeskQueueResponse, DeskQueueSource } from "@/lib/desk-queue.types";

const POOL = 24;

function isHidden(signalId: string, states: MissionActionState[]): boolean {
  const now = Date.now();
  const keys = [signalId, `brief:${signalId}`];
  for (const key of keys) {
    const s = states.find((x) => x.action_key === key);
    if (!s) continue;
    if (s.status === "dismissed" || s.status === "handled_locally") return true;
    if (s.status === "snoozed" && s.snoozed_until) {
      if (new Date(s.snoozed_until).getTime() > now) return true;
    }
  }
  return false;
}

function sourceLabel(source: DeskQueueSource): string {
  switch (source) {
    case "gmail":
      return "Gmail";
    case "finance":
      return "Finance";
    case "work":
      return "Work";
    case "slack":
      return "Slack";
  }
}

function rank(signal: MissionSignal): number {
  if (signal.tags.includes("unpaid_invoice")) return 100;
  if (signal.tags.includes("invoice_action")) return 95;
  if (signal.source === "finance") return 90;
  if (signal.tags.includes("unread")) return 70;
  if (signal.source === "slack") return 55;
  if (signal.source === "work") return 50;
  return 40;
}

function toItem(signal: MissionSignal): DeskQueueItem {
  const source = signal.source as DeskQueueSource;
  return {
    id: signal.id,
    title: signal.subject.trim() || "(uten emne)",
    subtitle: [signal.from, signal.snippet].filter(Boolean).join(" · ").slice(0, 160) || null,
    source,
    sourceLabel: sourceLabel(source),
    href: signal.href,
    sourceIds: [signal.id],
    occurredAt: signal.occurred_at,
  };
}

export const getDeskQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeskQueueResponse> => {
    const { supabase, userId, claims } = context;
    const claimsRec = claims as Record<string, unknown>;
    const userEmail = (claimsRec.email as string | undefined) ?? null;
    const { gatherMorningSignals } = await import("@/lib/morning-mission/signal-gather.server");
    const { prefilterSignals } = await import("@/lib/morning-mission/signal-prefilter.server");
    const { listMissionActionStates } = await import("@/lib/mission-action-state.server");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: memberships } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId);
    const orgIds = (memberships ?? []).map((m) => m.org_id as string);

    let workspaces: Array<{
      orgId: string;
      workspaceId: string;
      orgSlug: string;
      orgName: string;
      wsName: string;
      moduleAlerts: import("@/lib/module-alerts.types").WorkspaceAlertsMap;
    }> = [];

    if (orgIds.length) {
      const { data: orgs } = await supabaseAdmin
        .from("organizations")
        .select("id, name, slug")
        .in("id", orgIds);
      const { data: wsRows } = await supabaseAdmin
        .from("workspaces")
        .select("id, name, slug, org_id")
        .in("org_id", orgIds);
      const orgById = new Map((orgs ?? []).map((o) => [o.id as string, o]));
      const { fetchWorkspaceModuleAlerts } = await import("@/lib/module-alerts.server");
      workspaces = await Promise.all(
        (wsRows ?? []).map(async (ws) => {
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
          };
        }),
      );
    }

    const [{ signals: allSignals }, actionStates] = await Promise.all([
      gatherMorningSignals({ workspaces, userId }),
      listMissionActionStates(supabase, userId),
    ]);

    const { forAi, noiseSignals } = prefilterSignals({
      signals: allSignals,
      userEmail,
      actionStates,
    });

    // Keep actionable signals; drop noise. No AI reordering.
    const open = [...forAi]
      .filter((s) => !isHidden(s.id, actionStates))
      .filter((s) => !noiseSignals.some((n) => n.id === s.id))
      .sort((a, b) => {
        const rd = rank(b) - rank(a);
        if (rd !== 0) return rd;
        const at = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
        const bt = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
        return bt - at;
      });

    return {
      items: open.slice(0, POOL).map(toItem),
      totalOpen: open.length,
      generatedAt: new Date().toISOString(),
    };
  });
