import type { WidgetDataMap } from "@/lib/widget-data.functions";
import type { WorkspaceModule } from "@/lib/workspaceContext";
import { resolveModuleOpenUrl } from "@/lib/module-connections";
import { parseModuleInfoSnapshot, resolveWidgetHref } from "@/lib/module-registry";

export type MissionAction = {
  key: string;
  moduleSlug: string;
  moduleName: string;
  title: string;
  description: string;
  href: string | null;
  priority: number;
  kind: "action" | "info";
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

const RULES: Rule[] = [
  {
    moduleSlug: "finance",
    widgetId: "unpaid_invoices",
    priority: 1,
    kind: "action",
    deepLinkKey: "org_home",
    build: (display) => {
      const n = parseCount(display);
      if (n <= 0) return null;
      return {
        title: "Review unpaid invoices",
        description: `${display} open invoice${n === 1 ? "" : "s"} need attention`,
      };
    },
  },
  {
    moduleSlug: "work",
    widgetId: "today_hours",
    priority: 2,
    kind: "action",
    deepLinkKey: "org_home",
    build: (display) => {
      const h = parseHours(display);
      if (h <= 0) return null;
      return {
        title: "Review today's logged hours",
        description: `${display} logged today`,
      };
    },
  },
  {
    moduleSlug: "work",
    widgetId: "active_projects",
    priority: 3,
    kind: "action",
    deepLinkKey: "org_home",
    build: (display) => {
      const n = parseCount(display);
      if (n <= 0) return null;
      return {
        title: "Open active projects",
        description: `${display} active project${n === 1 ? "" : "s"}`,
      };
    },
  },
  {
    moduleSlug: "finance",
    widgetId: "month_revenue",
    priority: 10,
    kind: "info",
    deepLinkKey: "org_home",
    build: (display) => {
      if (!display) return null;
      return {
        title: "Month revenue",
        description: display,
      };
    },
  },
];

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

// ─── Global (cross-workspace) ────────────────────────────────────────────────

export type MissionTier = "urgent" | "important" | "later";
export type MissionSource = "workspace" | "gmail" | "slack";

export type GlobalMissionAction = {
  key: string;
  source: MissionSource;
  title: string;
  description: string;
  href: string | null;
  priority: number;
  tier: MissionTier;
  // Workspace-only:
  moduleSlug?: string;
  moduleName?: string;
  orgSlug?: string;
  orgName?: string;
  wsSlug?: string;
  wsName?: string;
  // Inbox-only:
  sender?: string;
  snippet?: string;
  occurredAt?: string | null;
  threadId?: string | null;
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
  return "workspace";
}

export function buildGlobalActions(input: {
  workspaces: Array<{
    orgSlug: string;
    orgName: string;
    wsSlug: string;
    wsName: string;
    widgetData: WidgetDataMap;
    modules: WorkspaceModule[];
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
  }>;
  max?: number;
}): GlobalMissionAction[] {
  const max = input.max ?? 7;
  const all: GlobalMissionAction[] = [];

  for (const ws of input.workspaces) {
    const actions = buildNextActions({ widgetData: ws.widgetData, modules: ws.modules });
    for (const a of actions) {
      all.push({
        key: `${ws.orgSlug}:${ws.wsSlug}:${a.key}`,
        source: "workspace",
        title: a.title,
        description: a.description,
        href: a.href,
        priority: a.priority,
        tier: tierFromPriority(a.priority),
        moduleSlug: a.moduleSlug,
        moduleName: a.moduleName,
        orgSlug: ws.orgSlug,
        orgName: ws.orgName,
        wsSlug: ws.wsSlug,
        wsName: ws.wsName,
      });
    }
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
      snippet: i.snippet,
    });
  }

  all.sort((a, b) => {
    const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (t !== 0) return t;
    return a.priority - b.priority;
  });

  return all.slice(0, max);
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
  workspace: 2,
};

export function buildMorningBrief(actions: GlobalMissionAction[]): MorningBrief {
  const bySource: Record<MissionSource, number> = { gmail: 0, slack: 0, workspace: 0 };
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



