import type {
  ConnectionHubItem,
  ConnectionHubResponse,
  HubPlatformId,
  HubStatus,
} from "@/lib/connection-hub.types";
import { HUB_STATUS_LABELS } from "@/lib/connection-hub.types";
import type { ModuleConnectionRow } from "@/lib/module-connections";
import { isConnectableModule } from "@/lib/module-connections";
import {
  buildConnectionMatrix,
  detectConnectionGaps,
} from "@/lib/connection-hub-insights.server";

type WorkspaceRow = { id: string; name: string; slug: string };
type ModuleRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
};
type EnabledRow = { workspace_id: string; module_id: string; enabled: boolean };

function moduleStatus(
  platform: HubPlatformId,
  enabled: boolean,
  connection: ModuleConnectionRow | null,
  hasInvoicesKey: boolean,
): { status: HubStatus; detail: string | null } {
  if (!enabled) {
    return { status: "disabled", detail: "Modulen er ikke slått på for denne arbeidsflaten." };
  }
  if (!connection) {
    return {
      status: "not_configured",
      detail: "Mangler organisasjons-ID, URL og API-nøkkel.",
    };
  }
  if (connection.status === "connected") {
    if (platform === "finance" && !hasInvoicesKey) {
      return {
        status: "partial",
        detail: "Koblet, men faktura-nøkkel for Mission mangler (invoices:read).",
      };
    }
    return {
      status: "connected",
      detail: connection.external_org_name
        ? `Koblet til ${connection.external_org_name}`
        : "Verifisert og koblet.",
    };
  }
  if (connection.status === "error") {
    return {
      status: "error",
      detail: connection.error_message ?? "Verifisering feilet.",
    };
  }
  if (connection.status === "disconnected") {
    return { status: "not_configured", detail: "Frakoblet — må kobles på nytt." };
  }
  return { status: "not_configured", detail: "Venter på verifisering." };
}

function buildWorkspaceItem(input: {
  platform: HubPlatformId;
  moduleName: string;
  orgSlug: string;
  ws: WorkspaceRow;
  enabled: boolean;
  connection: ModuleConnectionRow | null;
  hasInvoicesKey: boolean;
}): ConnectionHubItem {
  const { status, detail } = moduleStatus(
    input.platform,
    input.enabled,
    input.connection,
    input.hasInvoicesKey,
  );
  return {
    platform: input.platform,
    name: input.moduleName,
    scope: "workspace",
    status,
    statusLabel: HUB_STATUS_LABELS[status],
    detail,
    externalOrgName: input.connection?.external_org_name ?? null,
    externalOrgId: input.connection?.external_org_id ?? null,
    platformOrgName: null,
    lastVerifiedAt: input.connection?.last_verified_at ?? null,
    errorMessage: input.connection?.error_message ?? null,
    configureHref: `/o/${input.orgSlug}/w/${input.ws.slug}/modules`,
    workspaceId: input.ws.id,
    workspaceName: input.ws.name,
    workspaceSlug: input.ws.slug,
  };
}

function deploymentGmail(orgSlug: string): ConnectionHubItem {
  const ok = !!process.env.GOOGLE_MAIL_API_KEY && !!process.env.LOVABLE_API_KEY;
  return {
    platform: "gmail",
    name: "Gmail",
    scope: "deployment",
    status: ok ? "connected" : "unavailable",
    statusLabel: HUB_STATUS_LABELS[ok ? "connected" : "unavailable"],
    detail: ok
      ? "Gmail er koblet via Lovable Cloud (gjelder alle organisasjoner)."
      : "GOOGLE_MAIL_API_KEY mangler i Lovable Cloud.",
    externalOrgName: null,
    externalOrgId: null,
    platformOrgName: null,
    lastVerifiedAt: null,
    errorMessage: null,
    configureHref: `/o/${orgSlug}/connections`,
    workspaceId: null,
    workspaceName: null,
    workspaceSlug: null,
  };
}

function deploymentSlack(orgSlug: string, channelRuleCount: number): ConnectionHubItem {
  const envOk = !!process.env.SLACK_API_KEY && !!process.env.LOVABLE_API_KEY;
  if (!envOk) {
    return {
      platform: "slack",
      name: "Slack",
      scope: "deployment",
      status: "unavailable",
      statusLabel: HUB_STATUS_LABELS.unavailable,
      detail: "SLACK_API_KEY mangler i Lovable Cloud.",
      externalOrgName: null,
      externalOrgId: null,
      platformOrgName: null,
      lastVerifiedAt: null,
      errorMessage: null,
      configureHref: `/o/${orgSlug}/connections`,
      workspaceId: null,
      workspaceName: null,
      workspaceSlug: null,
    };
  }
  const status: HubStatus = channelRuleCount > 0 ? "connected" : "partial";
  return {
    platform: "slack",
    name: "Slack",
    scope: "deployment",
    status,
    statusLabel: HUB_STATUS_LABELS[status],
    detail:
      channelRuleCount > 0
        ? `Slack er koblet. ${channelRuleCount} kanal${channelRuleCount === 1 ? "" : "er"} konfigurert for denne org.`
        : "Slack er koblet globalt, men ingen kanaler er satt opp for denne organisasjonen.",
    externalOrgName: null,
    externalOrgId: null,
    platformOrgName: null,
    lastVerifiedAt: null,
    errorMessage: null,
    configureHref: `/o/${orgSlug}/slack-channels`,
    workspaceId: null,
    workspaceName: null,
    workspaceSlug: null,
  };
}

export async function buildOrgConnectionHub(input: {
  org: { id: string; name: string; slug: string };
  workspaces: WorkspaceRow[];
  modules: ModuleRow[];
  enabled: EnabledRow[];
  connections: ModuleConnectionRow[];
  invoicesKeyByConnectionId: Map<string, boolean>;
  slackChannelRuleCount: number;
}): Promise<ConnectionHubResponse> {
  const connectable = input.modules.filter((m) => isConnectableModule(m.status as "available"));
  const enabledSet = new Set(
    input.enabled.filter((e) => e.enabled).map((e) => `${e.workspace_id}:${e.module_id}`),
  );
  const connectionsByWsModule = new Map<string, ModuleConnectionRow>();
  for (const c of input.connections) {
    connectionsByWsModule.set(`${c.workspace_id}:${c.module_id}`, c);
  }

  const workspaces = input.workspaces.map((ws) => {
    const items: ConnectionHubItem[] = [];
    for (const mod of connectable) {
      const platform = mod.slug as HubPlatformId;
      if (platform !== "finance" && platform !== "work") continue;
      const key = `${ws.id}:${mod.id}`;
      const conn = connectionsByWsModule.get(key) ?? null;
      items.push(
        buildWorkspaceItem({
          platform,
          moduleName: mod.name,
          orgSlug: input.org.slug,
          ws,
          enabled: enabledSet.has(key),
          connection: conn,
          hasInvoicesKey: conn
            ? (input.invoicesKeyByConnectionId.get(conn.id) ?? false)
            : false,
        }),
      );
    }
    return { id: ws.id, name: ws.name, slug: ws.slug, items };
  });

  const deployment: ConnectionHubItem[] = [
    deploymentGmail(input.org.slug),
    deploymentSlack(input.org.slug, input.slackChannelRuleCount),
  ];

  const allItems = [...deployment, ...workspaces.flatMap((w) => w.items)];
  const actionable = allItems.filter((i) => i.status !== "disabled");
  const summary = {
    connected: actionable.filter((i) => i.status === "connected").length,
    total: actionable.length,
    missing: actionable.filter((i) => i.status === "not_configured").length,
    errors: actionable.filter(
      (i) => i.status === "error" || i.status === "unavailable" || i.status === "partial",
    ).length,
  };

  const externalMap = new Map<
    string,
    {
      platform: HubPlatformId;
      externalOrgId: string;
      externalOrgName: string | null;
      linkedWorkspaces: string[];
    }
  >();
  for (const ws of workspaces) {
    for (const item of ws.items) {
      if (!item.externalOrgId || item.status === "disabled") continue;
      const key = `${item.platform}:${item.externalOrgId}`;
      const existing = externalMap.get(key);
      const wsLabel = item.workspaceName ?? item.workspaceSlug ?? "?";
      if (existing) {
        existing.linkedWorkspaces.push(wsLabel);
      } else {
        externalMap.set(key, {
          platform: item.platform,
          externalOrgId: item.externalOrgId,
          externalOrgName: item.externalOrgName,
          linkedWorkspaces: [wsLabel],
        });
      }
    }
  }

  const matrix = buildConnectionMatrix({
    orgSlug: input.org.slug,
    deployment,
    workspaces,
  });
  const gaps = detectConnectionGaps({
    org: input.org,
    deployment,
    workspaces,
  });

  return {
    org: input.org,
    summary,
    deployment,
    workspaces,
    externalOrgs: Array.from(externalMap.values()),
    matrix,
    gaps,
  };
}
