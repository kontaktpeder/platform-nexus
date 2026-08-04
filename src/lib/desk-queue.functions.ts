/**
 * Desk queue — raw signals, no AI ranking.
 * User completes / snoozes / removes; next items fill the visible slots.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
    case "field":
      return "Field";
    case "manual":
      return "Manuelt";
    case "calendar":
      return "Kalender";
  }
}

function isDraftSignal(signal: MissionSignal): boolean {
  return signal.tags.includes("draft") || signal.meta?.is_draft === true;
}

function isAppointmentSignal(signal: MissionSignal): boolean {
  return signal.tags.includes("appointment") || signal.source === "calendar";
}

function appointmentTitle(signal: MissionSignal): string {
  if (signal.source === "calendar") {
    return signal.subject.trim() || "Kalender";
  }
  const text = `${signal.subject} ${signal.snippet}`;
  const m = text.match(/(?:klokken|kl\.?)\s*(\d{1,2})[:.](\d{2})/i);
  if (m) {
    const hh = m[1].padStart(2, "0");
    const mm = m[2];
    if (/\bi\s*morgen\b/i.test(text)) return `I morgen · ${hh}:${mm}`;
    return `Time · ${hh}:${mm}`;
  }
  if (/\bi\s*morgen\b/i.test(text)) return "I morgen · avtale";
  return "Timeavtale";
}

function rank(signal: MissionSignal): number {
  if (signal.tags.includes("unpaid_invoice")) return 100;
  if (signal.tags.includes("invoice_action")) return 95;
  if (signal.tags.includes("overdue")) return 94;
  if (isAppointmentSignal(signal)) return 92;
  if (signal.tags.includes("follow_up") || signal.tags.includes("due")) return 91;
  if (signal.source === "finance") return 90;
  if (signal.tags.includes("no_plan")) return 78;
  if (signal.source === "manual") return 75;
  if (isDraftSignal(signal)) return 72;
  if (signal.tags.includes("unread")) return 70;
  if (signal.source === "slack") return 55;
  if (signal.source === "work") return 50;
  return 40;
}

function toItem(signal: MissionSignal): DeskQueueItem {
  const source = signal.source as DeskQueueSource;
  const draft = isDraftSignal(signal);
  const appointment = isAppointmentSignal(signal);
  const subject = signal.subject.trim() || "(uten emne)";

  if (draft) {
    return {
      id: signal.id,
      kind: "draft",
      title: "Fortsett der du slapp",
      subtitle: [subject, signal.snippet].filter(Boolean).join(" · ").slice(0, 160) || null,
      source,
      sourceLabel: "Utkast",
      href: signal.href,
      sourceIds: [signal.id],
      occurredAt: signal.occurred_at,
    };
  }
  if (appointment) {
    return {
      id: signal.id,
      kind: "appointment",
      title: appointmentTitle(signal),
      subtitle:
        signal.source === "calendar"
          ? signal.snippet || null
          : [subject, signal.from].filter(Boolean).join(" · ").slice(0, 160) || null,
      source,
      sourceLabel: signal.source === "calendar" ? "Kalender" : "Avtale",
      href: signal.href,
      sourceIds: [signal.id],
      occurredAt: signal.occurred_at,
    };
  }
  if (signal.tags.includes("follow_up")) {
    return {
      id: signal.id,
      kind: "follow_up",
      title: subject,
      subtitle: signal.snippet || null,
      source: "field",
      sourceLabel: "Oppfølging",
      href: signal.href,
      sourceIds: [signal.id],
      occurredAt: signal.occurred_at,
    };
  }
  if (signal.tags.includes("no_plan")) {
    return {
      id: signal.id,
      kind: "no_plan",
      title: subject,
      subtitle: signal.snippet || null,
      source: "field",
      sourceLabel: "Field",
      href: signal.href,
      sourceIds: [signal.id],
      occurredAt: signal.occurred_at,
    };
  }
  if (signal.source === "manual") {
    return {
      id: signal.id,
      kind: "manual",
      title: subject,
      subtitle: signal.from !== "Manuelt" ? signal.from : signal.snippet || null,
      source: "manual",
      sourceLabel: "Manuelt",
      href: signal.href,
      sourceIds: [signal.id],
      occurredAt: signal.occurred_at,
    };
  }
  return {
    id: signal.id,
    kind: source === "gmail" ? "mail" : "signal",
    title: subject,
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
      gatherMorningSignals({ workspaces, userId, supabase }),
      listMissionActionStates(supabase, userId),
    ]);

    const { forAi, noiseSignals } = prefilterSignals({
      signals: allSignals,
      userEmail,
      actionStates,
    });

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

/** Quick manual intake for Desk queue (oral / WhatsApp / no API). */
export const createDeskManualSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(1).max(4000),
        channel: z.string().max(40).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { insertManualDeskSignal } = await import(
      "@/lib/morning-mission/manual-signals.server"
    );
    const row = await insertManualDeskSignal({
      supabase: context.supabase,
      userId: context.userId,
      text: data.text,
      channel: data.channel ?? "manual",
    });
    return { ok: true as const, id: row.id };
  });
