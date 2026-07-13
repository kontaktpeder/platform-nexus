import type {
  ConnectionGap,
  ConnectionHubItem,
  ConnectionMatrixCell,
  ConnectionMatrixRow,
  HubPlatformId,
  HubStatus,
} from "@/lib/connection-hub.types";
import { HUB_STATUS_LABELS, PLATFORM_META } from "@/lib/connection-hub.types";

const PLATFORMS: HubPlatformId[] = ["finance", "work", "gmail", "slack"];

function cellFromItem(item: ConnectionHubItem | undefined): ConnectionMatrixCell | null {
  if (!item) return null;
  return {
    status: item.status,
    statusLabel: item.statusLabel,
    externalOrgName: item.externalOrgName,
    externalOrgId: item.externalOrgId,
  };
}

import {
  orgNamesAlign,
} from "@/lib/connection-hub-names.server";

export function buildConnectionMatrix(input: {
  orgSlug: string;
  deployment: ConnectionHubItem[];
  workspaces: Array<{
    name: string;
    slug: string;
    items: ConnectionHubItem[];
  }>;
}): ConnectionMatrixRow[] {
  const depByPlatform = new Map(input.deployment.map((d) => [d.platform, d]));
  const gmail = depByPlatform.get("gmail");
  const slack = depByPlatform.get("slack");

  const deploymentRow: ConnectionMatrixRow = {
    label: "Alle organisasjoner (delt)",
    kind: "deployment",
    workspaceSlug: null,
    configureHref: `/o/${input.orgSlug}/connections`,
    cells: {
      finance: null,
      work: null,
      gmail: cellFromItem(gmail),
      slack: cellFromItem(slack),
    },
  };

  const workspaceRows: ConnectionMatrixRow[] = input.workspaces.map((ws) => {
    const byPlatform = new Map(ws.items.map((i) => [i.platform, i]));
    return {
      label: ws.name,
      kind: "workspace",
      workspaceSlug: ws.slug,
      configureHref: `/o/${input.orgSlug}/w/${ws.slug}/modules`,
      cells: {
        finance: cellFromItem(byPlatform.get("finance")),
        work: cellFromItem(byPlatform.get("work")),
        gmail: cellFromItem(gmail),
        slack: cellFromItem(slack),
      },
    };
  });

  return [deploymentRow, ...workspaceRows];
}

export function detectConnectionGaps(input: {
  org: { name: string; slug: string };
  deployment: ConnectionHubItem[];
  workspaces: Array<{ name: string; slug: string; items: ConnectionHubItem[] }>;
}): ConnectionGap[] {
  const gaps: ConnectionGap[] = [];
  const orgSlug = input.org.slug;

  for (const dep of input.deployment) {
    if (dep.status === "unavailable") {
      gaps.push({
        severity: "error",
        title: `${PLATFORM_META[dep.platform].name} er ikke tilgjengelig`,
        description: dep.detail ?? "Mangler API-nøkkel i Lovable Cloud.",
        actionHref: `/o/${orgSlug}/connections`,
        platform: dep.platform,
      });
    } else if (dep.status === "partial") {
      gaps.push({
        severity: "warning",
        title: `${PLATFORM_META[dep.platform].name} er delvis konfigurert`,
        description: dep.detail ?? "Trenger mer oppsett.",
        actionHref: dep.configureHref,
        platform: dep.platform,
      });
    }
  }

  let anyExternalLinked = false;

  for (const ws of input.workspaces) {
    const finance = ws.items.find((i) => i.platform === "finance");
    const work = ws.items.find((i) => i.platform === "work");
    const modulesHref = `/o/${orgSlug}/w/${ws.slug}/modules`;

    if (finance && finance.status !== "disabled" && finance.status !== "connected") {
      gaps.push({
        severity: finance.status === "error" ? "error" : "warning",
        title: `Finance mangler i ${ws.name}`,
        description: finance.detail ?? "Modulen er på, men ikke koblet til en Finance-organisasjon.",
        actionHref: modulesHref,
        platform: "finance",
      });
    }

    if (work && work.status !== "disabled" && work.status !== "connected") {
      gaps.push({
        severity: work.status === "error" ? "error" : "warning",
        title: `Work mangler i ${ws.name}`,
        description: work.detail ?? "Modulen er på, men ikke koblet til en Work-organisasjon.",
        actionHref: modulesHref,
        platform: "work",
      });
    }

    if (finance?.status === "connected") anyExternalLinked = true;
    if (work?.status === "connected") anyExternalLinked = true;

    if (finance?.status === "partial") {
      gaps.push({
        severity: "warning",
        title: `Finance delvis koblet i ${ws.name}`,
        description:
          finance.detail ??
          "Verify-nøkkelen mangler invoices:read — oppdater nøkkelen og test på nytt.",
        actionHref: modulesHref,
        platform: "finance",
      });
    }

    if (
      finance?.status === "connected" &&
      work?.status === "connected" &&
      finance.externalOrgId &&
      work.externalOrgId &&
      finance.externalOrgId !== work.externalOrgId
    ) {
      gaps.push({
        severity: "error",
        title: `Finance og Work peker på ulike org i ${ws.name}`,
        description: `Finance → ${finance.externalOrgName ?? finance.externalOrgId}. Work → ${work.externalOrgName ?? work.externalOrgId}. De bør normalt være samme organisasjon.`,
        actionHref: modulesHref,
        platform: null,
      });
    }

    const linkedToSameExternalOrg =
      finance?.status === "connected" &&
      work?.status === "connected" &&
      !!finance.externalOrgId &&
      finance.externalOrgId === work.externalOrgId;

    if (finance?.status === "connected" && finance.externalOrgName && !linkedToSameExternalOrg) {
      if (!orgNamesAlign(input.org, finance.externalOrgName)) {
        gaps.push({
          severity: "info",
          title: `Finance-org navn avviker fra Platform-org`,
          description: `Platform: «${input.org.name}». Finance: «${finance.externalOrgName}» i ${ws.name}. Sjekk at du koblet riktig organisasjon, eller trykk Test på nytt under Moduler.`,
          actionHref: modulesHref,
          platform: "finance",
        });
      }
    }

    if (work?.status === "connected" && work.externalOrgName && !linkedToSameExternalOrg) {
      if (!orgNamesAlign(input.org, work.externalOrgName)) {
        gaps.push({
          severity: "info",
          title: `Work-org navn avviker fra Platform-org`,
          description: `Platform: «${input.org.name}». Work: «${work.externalOrgName}» i ${ws.name}. Sjekk at du koblet riktig organisasjon, eller trykk Test på nytt under Moduler.`,
          actionHref: modulesHref,
          platform: "work",
        });
      }
    }
  }

  const financeOrgIds = new Set<string>();
  for (const ws of input.workspaces) {
    const f = ws.items.find((i) => i.platform === "finance" && i.externalOrgId);
    if (f?.externalOrgId) financeOrgIds.add(f.externalOrgId);
  }
  if (financeOrgIds.size > 1) {
    gaps.push({
      severity: "warning",
      title: "Ulike Finance-organisasjoner på tvers av arbeidsflater",
      description: `${financeOrgIds.size} forskjellige Finance org-ID-er er koblet. Er dette bevisst?`,
      actionHref: `/o/${orgSlug}/connections`,
      platform: "finance",
    });
  }

  const workOrgIds = new Set<string>();
  for (const ws of input.workspaces) {
    const w = ws.items.find((i) => i.platform === "work" && i.externalOrgId);
    if (w?.externalOrgId) workOrgIds.add(w.externalOrgId);
  }
  if (workOrgIds.size > 1) {
    gaps.push({
      severity: "warning",
      title: "Ulike Work-organisasjoner på tvers av arbeidsflater",
      description: `${workOrgIds.size} forskjellige Work org-ID-er er koblet.`,
      actionHref: `/o/${orgSlug}/connections`,
      platform: "work",
    });
  }

  const hasEnabledModule = input.workspaces.some((ws) =>
    ws.items.some((i) => i.status !== "disabled"),
  );
  if (hasEnabledModule && !anyExternalLinked) {
    gaps.push({
      severity: "warning",
      title: "Ingen ekstern plattform er koblet ennå",
      description: `Platform-org «${input.org.name}» har moduler på, men ingen verifisert Finance- eller Work-kobling.`,
      actionHref: `/o/${orgSlug}/connections`,
      platform: null,
    });
  }

  const gmail = input.deployment.find((d) => d.platform === "gmail");
  if (gmail?.status === "connected") {
    gaps.push({
      severity: "info",
      title: "Gmail er delt på tvers av alle organisasjoner",
      description:
        "Per-org Gmail (egen konto per organisasjon) er planlagt. Foreløpig bruker alle org samme Gmail-tilkobling fra Lovable Cloud.",
      actionHref: null,
      platform: "gmail",
    });
  }

  return gaps;
}

export const MATRIX_PLATFORM_ORDER: HubPlatformId[] = PLATFORMS;

export function matrixStatusColor(status: HubStatus): string {
  switch (status) {
    case "connected":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "partial":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-200";
    case "error":
    case "unavailable":
      return "bg-red-500/15 text-red-800 dark:text-red-300";
    case "not_configured":
      return "bg-muted text-muted-foreground";
    case "disabled":
      return "bg-muted/50 text-muted-foreground/60";
    default:
      return "bg-muted text-muted-foreground";
  }
}
