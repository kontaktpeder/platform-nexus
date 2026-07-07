import type { WidgetDataMap } from "@/lib/widget-data.functions";
import type { WorkspaceModule } from "@/lib/workspaceContext";
import { resolveModuleOpenUrl } from "@/lib/module-connections";
import { parseModuleInfoSnapshot, resolveWidgetHref } from "@/lib/module-registry";
import type {
  ModuleAlertSeverity,
  WorkspaceAlertsMap,
} from "@/lib/module-alerts.types";

export type MissionAction = {
  key: string;
  moduleSlug: string;
  moduleName: string;
  title: string;
  description: string;
  href: string | null;
  priority: number;
  kind: "action" | "info";
  severity?: ModuleAlertSeverity;
};

export function parseCount(display: string | undefined): number {
  if (!display) return 0;
  const m = display.replace(/\s/g, "").match(/-?\d+([.,]\d+)?/);
  if (!m) return 0;
  return Number(m[0].replace(",", "."));
}

export function parseHours(display: string | undefined): number {
  if (!display) return 0;
  const m = display.replace(/\s/g, "").match(/-?\d+([.,]\d+)?/);
  if (!m) return 0;
  return Number(m[0].replace(",", "."));
}

type Rule = {
  moduleSlug: string;
  widgetId: string;
  priority: number;
  kind: "action" | "info";
  deepLinkKey: string;
  build: (display: string) => { title: string; description: string } | null;
};

/**
 * NOTE: Legacy widget-derived Mission cards were removed as of Module Contract
 * v1.1. Actionable items now come from `/module/alerts` per module and are
 * built via `buildModuleAlertActions`. Info widgets (like month_revenue) still
 * render in `MissionWidgetsGrid` on the workspace, but never as global
 * Mission actions.
 */
const RULES: Rule[] = [];


export function buildNextActions(input: {
  widgetData: WidgetDataMap | undefined;
  modules: WorkspaceModule[];
}): MissionAction[] {
  const { widgetData, modules } = input;
  if (!widgetData) return [];

  const actions: MissionAction[] = [];

  for (const rule of RULES) {
    const key = `${rule.moduleSlug}:${rule.widgetId}`;
    const datum = widgetData[key];
    if (!datum?.display) continue;
    const built = rule.build(datum.display);
    if (!built) continue;

    const mod = modules.find((m) => m.slug === rule.moduleSlug);
    if (!mod || !mod.connection) continue;

    const snapshot = parseModuleInfoSnapshot(mod.connection.module_info_snapshot);
    const home = resolveModuleOpenUrl(mod.connection);
    const href = resolveWidgetHref({
      snapshot,
      connectionHomeUrl: home,
      widgetDeepLinkKey: rule.deepLinkKey,
      externalOrgId: mod.connection.external_org_id,
      baseUrl: mod.connection.external_base_url,
    });

    actions.push({
      key,
      moduleSlug: rule.moduleSlug,
      moduleName: mod.name,
      title: built.title,
      description: built.description,
      href,
      priority: rule.priority,
      kind: rule.kind,
    });
  }

  actions.sort((a, b) => a.priority - b.priority);

  // Prefer actions over info: if we already have 3 actions, drop info cards
  const primary = actions.filter((a) => a.kind === "action").slice(0, 3);
  if (primary.length >= 3) return primary;
  const info = actions.filter((a) => a.kind === "info");
  return [...primary, ...info].slice(0, 3);
}

// ─── Module Alerts (Module Contract v1.1) ────────────────────────────────────

const SEVERITY_ORDER: Record<ModuleAlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_PRIORITY: Record<ModuleAlertSeverity, number> = {
  critical: 1,
  warning: 3,
  info: 8,
};

export function appendReturnParam(href: string, returnUrl: string): string {
  try {
    const u = new URL(href);
    u.searchParams.set("return", returnUrl);
    return u.toString();
  } catch {
    return href;
  }
}

export function buildModuleAlertActions(input: {
  moduleAlerts: WorkspaceAlertsMap | undefined;
  modules: WorkspaceModule[];
  missionReturnUrl?: string;
}): MissionAction[] {
  const { moduleAlerts, modules, missionReturnUrl } = input;
  if (!moduleAlerts) return [];

  const out: MissionAction[] = [];
  for (const [key, alert] of Object.entries(moduleAlerts)) {
    const mod = modules.find((m) => m.slug === alert.moduleSlug);
    const moduleName = mod?.name ?? alert.moduleName ?? alert.moduleSlug;
    let href = alert.action_url ?? alert.connectionHomeUrl ?? null;
    if (href && alert.action_url && missionReturnUrl) {
      href = appendReturnParam(href, missionReturnUrl);
    }
    out.push({
      key,
      moduleSlug: alert.moduleSlug,
      moduleName,
      title: alert.title,
      description: alert.description ?? "",
      href,
      priority: alert.priority ?? SEVERITY_PRIORITY[alert.severity],
      kind: alert.severity === "info" ? "info" : "action",
      severity: alert.severity,
    });
  }


  out.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity ?? "info"];
    const sb = SEVERITY_ORDER[b.severity ?? "info"];
    if (sa !== sb) return sa - sb;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.title.localeCompare(b.title);
  });

  return out;
}

// ─── Global (cross-workspace) ────────────────────────────────────────────────

export type MissionTier = "urgent" | "important" | "later";
export type MissionSource = "workspace" | "gmail" | "slack" | "commitment";

export type GlobalMissionAction = {
  key: string;
  source: MissionSource;
  title: string;
  description: string;
  href: string | null;
  priority: number;
  tier: MissionTier;
  severity?: ModuleAlertSeverity;
  // Workspace-only:
  moduleSlug?: string;
  moduleName?: string;
  orgSlug?: string;
  orgName?: string;
  wsSlug?: string;
  wsName?: string;
  // Inbox-only:
  sender?: string;
  senderEmail?: string | null;
  channelName?: string | null;
  snippet?: string;
  occurredAt?: string | null;
  threadId?: string | null;
  // Optional Knowledge enrichment:
  entityId?: string;
  entityName?: string;
  entitySlug?: string;
  entityLinkSource?: "manual" | "auto" | null;
  // Commitment-only:
  commitmentId?: string;
  commitmentDueDate?: string | null;
};

function tierFromPriority(p: number): MissionTier {
  if (p <= 2) return "urgent";
  if (p <= 5) return "important";
  return "later";
}

const TIER_ORDER: Record<MissionTier, number> = { urgent: 0, important: 1, later: 2 };

export function getActionSourceFromKey(key: string): MissionSource {
  if (key.startsWith("gmail:")) return "gmail";
  if (key.startsWith("slack:")) return "slack";
  if (key.startsWith("commitment:")) return "commitment";
  return "workspace";
}

function tierFromSeverity(sev: ModuleAlertSeverity): MissionTier {
  if (sev === "critical") return "urgent";
  if (sev === "warning") return "important";
  return "later";
}

export function buildGlobalActions(input: {
  workspaces: Array<{
    orgSlug: string;
    orgName: string;
    wsSlug: string;
    wsName: string;
    widgetData: WidgetDataMap;
    modules: WorkspaceModule[];
    moduleAlerts?: WorkspaceAlertsMap;
  }>;
  inbox?: Array<{
    key: string;
    source: "gmail" | "slack";
    title: string;
    sender: string;
    snippet: string;
    href: string | null;
    priority: number;
    tier: MissionTier;
    occurredAt?: string | null;
    threadId?: string | null;
    senderEmail?: string | null;
    channelName?: string | null;
  }>;
  max?: number;
  missionReturnUrl?: string;
}): GlobalMissionAction[] {
  const max = input.max ?? 7;
  const all: GlobalMissionAction[] = [];

  for (const ws of input.workspaces) {
    // 1) Module Alerts (v1.1) — actionable items from each module.
    const alertActions = buildModuleAlertActions({
      moduleAlerts: ws.moduleAlerts,
      modules: ws.modules,
      missionReturnUrl: input.missionReturnUrl,
    });

    for (const a of alertActions) {
      const sev = a.severity ?? "info";
      all.push({
        key: `${ws.orgSlug}:${ws.wsSlug}:${a.key}`,
        source: "workspace",
        title: a.title,
        description: a.description,
        href: a.href,
        priority: a.priority,
        tier: tierFromSeverity(sev),
        severity: sev,
        moduleSlug: a.moduleSlug,
        moduleName: a.moduleName,
        orgSlug: ws.orgSlug,
        orgName: ws.orgName,
        wsSlug: ws.wsSlug,
        wsName: ws.wsName,
      });
    }

    // Legacy widget-derived Mission cards intentionally omitted — Mission
    // shows Module Alerts only. Info widgets remain in MissionWidgetsGrid.

  }

  for (const i of input.inbox ?? []) {
    all.push({
      key: i.key,
      source: i.source,
      title: i.title,
      description: i.snippet,
      href: i.href,
      priority: i.priority,
      tier: i.tier,
      sender: i.sender,
      senderEmail: i.senderEmail ?? null,
      channelName: i.channelName ?? null,
      snippet: i.snippet,
      occurredAt: i.occurredAt ?? null,
      threadId: i.threadId ?? null,
    });
  }

  all.sort((a, b) => {
    const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (t !== 0) return t;
    return a.priority - b.priority;
  });

  return all.slice(0, max);
}

// ─── Commitments (Knowledge v3) ─────────────────────────────────────────────

export type CommitmentActionInput = {
  id: string;
  title: string;
  due_date: string | null;
  entity_id: string | null;
  metadata?: Record<string, unknown>;
};

export function buildCommitmentActions(
  commitments: CommitmentActionInput[],
  entityMap?: Record<
    string,
    { name: string; slug: string; linkSource?: "manual" | "auto" }
  >,
  todayOslo: string = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()),
): GlobalMissionAction[] {
  const out: GlobalMissionAction[] = [];
  for (const c of commitments) {
    let priority = 4;
    let tier: MissionTier = "later";
    let description = "Åpen forpliktelse";
    if (c.due_date) {
      if (c.due_date < todayOslo) {
        priority = 1;
        tier = "urgent";
        description = "Forfalt";
      } else if (c.due_date === todayOslo) {
        priority = 2;
        tier = "important";
        description = "Forfaller i dag";
      } else {
        // Future — caller should exclude, but be defensive.
        continue;
      }
    }
    const linked = c.entity_id ? entityMap?.[c.entity_id] : undefined;
    if (linked) description = `${description} · ${linked.name}`;
    out.push({
      key: `commitment:${c.id}`,
      source: "commitment",
      title: c.title,
      description,
      href: null,
      priority,
      tier,
      commitmentId: c.id,
      commitmentDueDate: c.due_date,
      entityId: linked ? c.entity_id ?? undefined : undefined,
      entityName: linked?.name,
      entitySlug: linked?.slug,
      entityLinkSource: linked?.linkSource ?? "manual",
    });
  }
  return out;
}


// ─── Morning Brief ───────────────────────────────────────────────────────────

export type MorningBrief = {
  total: number;
  bySource: Record<MissionSource, number>;
  byTier: Record<MissionTier, number>;
  recommended: GlobalMissionAction | null;
};

const SOURCE_TIEBREAK: Record<MissionSource, number> = {
  gmail: 0,
  slack: 1,
  commitment: 2,
  workspace: 3,
};

export function buildMorningBrief(actions: GlobalMissionAction[]): MorningBrief {
  const bySource: Record<MissionSource, number> = {
    gmail: 0,
    slack: 0,
    workspace: 0,
    commitment: 0,
  };
  const byTier: Record<MissionTier, number> = { urgent: 0, important: 0, later: 0 };

  for (const a of actions) {
    bySource[a.source] += 1;
    byTier[a.tier] += 1;
  }

  const ranked = [...actions].sort((a, b) => {
    const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (t !== 0) return t;
    const linkA = a.href ? 0 : 1;
    const linkB = b.href ? 0 : 1;
    if (linkA !== linkB) return linkA - linkB;
    const p = a.priority - b.priority;
    if (p !== 0) return p;
    return SOURCE_TIEBREAK[a.source] - SOURCE_TIEBREAK[b.source];
  });

  return {
    total: actions.length,
    bySource,
    byTier,
    recommended: ranked[0] ?? null,
  };
}



