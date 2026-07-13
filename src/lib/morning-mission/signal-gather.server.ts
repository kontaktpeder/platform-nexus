// Gather all signals for Morning Mission v0.
import { fetchRecentGmailSignals } from "@/lib/inbox/gmail-recent.server";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import { gmailToSignal } from "@/lib/morning-mission/signal-prefilter.server";
import type { WorkspaceAlertsMap } from "@/lib/module-alerts.types";

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
  workspaces: Array<{
    orgSlug: string;
    orgName: string;
    wsName: string;
    moduleAlerts: WorkspaceAlertsMap;
  }>;
}): Promise<MissionSignal[]> {
  const gmail = (await fetchRecentGmailSignals({ hours: 72, max: 40 })).map(gmailToSignal);

  const moduleSignals = input.workspaces.flatMap((ws) =>
    moduleAlertsToSignals({
      orgName: ws.orgName,
      orgSlug: ws.orgSlug,
      wsName: ws.wsName,
      moduleAlerts: ws.moduleAlerts ?? {},
    }),
  );

  return [...gmail, ...moduleSignals];
}
