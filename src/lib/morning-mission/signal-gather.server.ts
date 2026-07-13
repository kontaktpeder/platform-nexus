// Gather all signals for Morning Mission v0.
import { fetchRecentGmailSignals } from "@/lib/inbox/gmail-recent.server";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import { gmailToSignal } from "@/lib/morning-mission/signal-prefilter.server";
import type { WorkspaceAlertsMap } from "@/lib/module-alerts.types";
import { resolveModuleOpenUrl } from "@/lib/module-connections";
import type { ModuleConnectionRow } from "@/lib/module-connections";
import { parseModuleInfoSnapshot } from "@/lib/module-registry";

export type MorningWorkspaceInput = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  workspaceId: string;
  wsName: string;
  moduleAlerts: WorkspaceAlertsMap;
};

function parseWidgetCount(display: string | undefined): number {
  if (!display) return 0;
  const m = display.replace(/\s/g, "").match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function unpaidInvoicesFromWidgets(input: {
  ws: MorningWorkspaceInput;
  widgetData: Record<string, { display?: string; status?: string } | undefined>;
  connections: ModuleConnectionRow[];
}): MissionSignal | null {
  const datum = input.widgetData["finance:unpaid_invoices"];
  const count = parseWidgetCount(datum?.display);
  if (count <= 0) return null;

  const financeConn = input.connections.find((c) => c.module_slug === "finance");
  const snapshot = financeConn
    ? parseModuleInfoSnapshot(financeConn.module_info_snapshot)
    : null;
  const home = financeConn ? resolveModuleOpenUrl(financeConn) : null;
  const invoicesHref =
    snapshot && financeConn
      ? `${home?.replace(/\/$/, "") ?? financeConn.external_base_url}/orgs/${financeConn.external_org_id}/invoices`
      : home;

  return {
    id: `finance:${input.ws.orgSlug}:unpaid_invoices`,
    source: "finance",
    subject: count === 1 ? "1 ubetalt faktura" : `${count} ubetalte fakturaer`,
    from: `Finance · ${input.ws.orgName}`,
    snippet: `${count} sendte faktura${count === 1 ? "" : "er"} uten registrert betaling.`,
    occurred_at: null,
    href: invoicesHref,
    tags: ["unpaid_invoice", "finance_widget", "warning"],
    meta: {
      count,
      org_slug: input.ws.orgSlug,
      org_name: input.ws.orgName,
      widget_display: datum?.display ?? null,
    },
  };
}

export function moduleAlertsToSignals(input: {
  orgName: string;
  orgSlug: string;
  wsName: string;
  moduleAlerts: WorkspaceAlertsMap;
}): MissionSignal[] {
  const out: MissionSignal[] = [];
  for (const [key, alert] of Object.entries(input.moduleAlerts)) {
    out.push({
      id: `module:${input.orgSlug}:${alert.moduleSlug}:${key}`,
      source: alert.moduleSlug === "work" ? "work" : "finance",
      subject: alert.title,
      from: `${alert.moduleName} · ${input.orgName}`,
      snippet: alert.description ?? "",
      occurred_at: null,
      href: alert.action_url ?? alert.connectionHomeUrl ?? null,
      tags: [alert.severity, "module_alert"],
      meta: {
        org_slug: input.orgSlug,
        ws_name: input.wsName,
        severity: alert.severity,
      },
    });
  }
  return out;
}

export async function gatherMorningSignals(input: {
  workspaces: MorningWorkspaceInput[];
}): Promise<MissionSignal[]> {
  const gmail = (await fetchRecentGmailSignals({ hours: 72, max: 40 })).map(gmailToSignal);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchWorkspaceWidgetData } = await import("@/lib/widget-data.server");

  const moduleSignals: MissionSignal[] = [];
  const financeWidgetSignals: MissionSignal[] = [];

  for (const ws of input.workspaces) {
    moduleSignals.push(
      ...moduleAlertsToSignals({
        orgName: ws.orgName,
        orgSlug: ws.orgSlug,
        wsName: ws.wsName,
        moduleAlerts: ws.moduleAlerts ?? {},
      }),
    );

    const { data: connections } = await supabaseAdmin
      .from("module_connections")
      .select(
        "id, org_id, workspace_id, module_id, external_org_id, external_base_url, status, module_slug, module_info_snapshot, resolved_org_home_url, external_org_name",
      )
      .eq("workspace_id", ws.workspaceId)
      .eq("org_id", ws.orgId)
      .eq("status", "connected");

    const widgetData = await fetchWorkspaceWidgetData({
      supabaseAdmin,
      orgId: ws.orgId,
      workspaceId: ws.workspaceId,
    }).catch(() => ({}));

    const unpaid = unpaidInvoicesFromWidgets({
      ws,
      widgetData,
      connections: (connections ?? []) as ModuleConnectionRow[],
    });
    if (unpaid) financeWidgetSignals.push(unpaid);
  }

  return [...gmail, ...moduleSignals, ...financeWidgetSignals];
}
