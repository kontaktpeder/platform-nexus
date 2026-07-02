import { z } from "zod";

export const ModuleConfigSchema = z.object({
  key_prefix: z.string().optional(),
  contract_version: z.string().optional(),
});

export type ModuleConfig = z.infer<typeof ModuleConfigSchema>;

export const ModuleWidgetSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  deep_link: z.string().optional(),
  capabilities_required: z.array(z.string()).optional(),
  placeholder: z.boolean().optional(),
});

export const ModuleInfoSnapshotSchema = z.object({
  module_slug: z.string(),
  module_name: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  deep_links: z.record(z.string()).optional(),
  widgets: z.array(ModuleWidgetSchema).optional(),
  fetched_at: z.string(),
});

export type ModuleWidget = z.infer<typeof ModuleWidgetSchema>;
export type ModuleInfoSnapshot = z.infer<typeof ModuleInfoSnapshotSchema>;

export function parseModuleConfig(raw: unknown): ModuleConfig {
  const parsed = ModuleConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export function parseModuleInfoSnapshot(raw: unknown): ModuleInfoSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = ModuleInfoSnapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Platform: modul kan kobles når status tillater det */
export function isConnectableModule(status: string): boolean {
  return status === "available" || status === "beta";
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Resolve widget href from cached deep_links + connection */
export function resolveWidgetHref(params: {
  snapshot: ModuleInfoSnapshot | null;
  connectionHomeUrl: string | null;
  widgetDeepLinkKey?: string;
  externalOrgId: string;
  baseUrl: string;
}): string | null {
  if (
    params.connectionHomeUrl &&
    (!params.widgetDeepLinkKey || params.widgetDeepLinkKey === "org_home")
  ) {
    return params.connectionHomeUrl;
  }
  const key = params.widgetDeepLinkKey ?? "org_home";
  const template = params.snapshot?.deep_links?.[key];
  if (!template) return params.connectionHomeUrl;
  const base = normalize(params.baseUrl);
  return `${base}${template.replace("{org_id}", params.externalOrgId)}`;
}

/** Widgets for dashboard — from snapshot or generic fallback */
export function widgetsForModule(params: {
  moduleName: string;
  moduleSlug: string;
  snapshot: ModuleInfoSnapshot | null;
}): ModuleWidget[] {
  const fromSnapshot = params.snapshot?.widgets?.filter(Boolean);
  if (fromSnapshot?.length) return fromSnapshot;
  return [
    {
      id: `${params.moduleSlug}-overview`,
      title: params.moduleName,
      description: "Modulen er koblet. Data kommer når integrasjonen er ferdig.",
      deep_link: "org_home",
      placeholder: true,
    },
  ];
}
