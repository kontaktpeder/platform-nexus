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
