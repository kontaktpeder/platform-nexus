import { z } from "zod";

export type ModuleConnectionStatus = "pending" | "connected" | "error" | "disconnected";

export type ModuleConnectionRow = {
  id: string;
  org_id: string;
  workspace_id: string;
  module_id: string;
  external_org_id: string;
  external_base_url: string;
  status: ModuleConnectionStatus;
  connected_by: string | null;
  connected_at: string | null;
  last_verified_at: string | null;
  error_message: string | null;
  external_org_name?: string | null;
  resolved_org_home_url?: string | null;
  module_slug?: string | null;
};

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const connectionInputSchema = z.object({
  external_org_id: z
    .string()
    .trim()
    .refine((v) => uuidRe.test(v), "Organisasjon-ID må være en gyldig UUID"),
  external_base_url: z
    .string()
    .trim()
    .url("Base URL må være en gyldig URL (inkl. https://)"),
});

export const CONNECTABLE_MODULE_SLUGS = new Set(["finance", "work"]);

export function isConnectableModule(slug: string, status: string): boolean {
  return CONNECTABLE_MODULE_SLUGS.has(slug) && status !== "coming_soon";
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** @deprecated Bruk resolveModuleOpenUrl — beholdes som fallback for gamle koblinger. */
export function moduleAppUrl(baseUrl: string, externalOrgId: string, slug: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (slug === "finance" || slug === "work") {
    return `${base}/orgs/${externalOrgId}`;
  }
  return base;
}

export function resolveModuleOpenUrl(
  connection: ModuleConnectionRow,
  fallbackSlug?: string,
): string | null {
  if (connection.status !== "connected") return null;
  if (connection.resolved_org_home_url) return connection.resolved_org_home_url;
  return moduleAppUrl(
    connection.external_base_url,
    connection.external_org_id,
    connection.module_slug ?? fallbackSlug ?? "finance",
  );
}

export function validateConnectionInput(input: {
  external_org_id: string;
  external_base_url: string;
}): { ok: boolean; error?: string } {
  const parsed = connectionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Ugyldig input" };
  }
  return { ok: true };
}
