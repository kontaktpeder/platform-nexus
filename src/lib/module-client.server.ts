// Server-only. Module Contract v1 client.

export const CONTRACT_VERSION = "1.0";

export type ModuleHealth = {
  contract_version: string;
  status: string;
  module_slug: string;
  module_name?: string;
  app_version?: string;
  timestamp?: string;
};

export type ModuleInfo = {
  contract_version: string;
  module_slug: string;
  module_name: string;
  app_base_url?: string;
  capabilities?: string[];
  deep_links?: Record<string, string>;
  widgets?: unknown[];
};

export type ModuleVerifyResult = {
  contract_version: string;
  verified: boolean;
  organization: { id: string; name: string };
  deep_links?: { org_home?: string };
};

export class ModuleClientError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
  }
}

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

export async function fetchModuleHealth(baseUrl: string): Promise<ModuleHealth> {
  const res = await fetch(`${normalizeBase(baseUrl)}/api/public/v1/module/health`);
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ModuleClientError(`Health feilet (${res.status})`, res.status, body);
  }
  const h = body as ModuleHealth;
  if (h.contract_version !== CONTRACT_VERSION) {
    throw new ModuleClientError(`Ustøttet contract_version: ${h.contract_version}`);
  }
  if (h.status !== "ok") {
    throw new ModuleClientError(`Modul status: ${h.status}`);
  }
  return h;
}

export async function fetchModuleInfo(baseUrl: string): Promise<ModuleInfo> {
  const res = await fetch(`${normalizeBase(baseUrl)}/api/public/v1/module/info`);
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ModuleClientError(`Info feilet (${res.status})`, res.status, body);
  }
  const info = body as ModuleInfo;
  if (info.contract_version !== CONTRACT_VERSION) {
    throw new ModuleClientError(`Ustøttet contract_version: ${info.contract_version}`);
  }
  return info;
}

export async function verifyModuleOrganization(params: {
  baseUrl: string;
  orgId: string;
  apiKey: string;
}): Promise<ModuleVerifyResult> {
  const base = normalizeBase(params.baseUrl);
  const res = await fetch(`${base}/api/public/v1/module/organization/${params.orgId}`, {
    headers: { Authorization: `Bearer ${params.apiKey}` },
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ModuleClientError(
      res.status === 404
        ? "Organisasjon ikke funnet eller matcher ikke nøkkelen"
        : res.status === 401 || res.status === 403
          ? "Ugyldig eller manglende verify-nøkkel"
          : `Verify feilet (${res.status})`,
      res.status,
      body,
    );
  }
  const v = body as ModuleVerifyResult;
  if (v.contract_version !== CONTRACT_VERSION) {
    throw new ModuleClientError(`Ustøttet contract_version: ${v.contract_version}`);
  }
  if (!v.verified) {
    throw new ModuleClientError("Verify returnerte verified=false");
  }
  if (v.organization?.id !== params.orgId) {
    throw new ModuleClientError("Organisasjon-ID i respons matcher ikke");
  }
  return v;
}

/** Full verify-flyt i henhold til Module Contract v1. */
export async function verifyModuleConnection(params: {
  baseUrl: string;
  expectedModuleSlug: string;
  externalOrgId: string;
  apiKey: string;
}) {
  const health = await fetchModuleHealth(params.baseUrl);
  if (health.module_slug !== params.expectedModuleSlug) {
    throw new ModuleClientError(
      `Forventet modul "${params.expectedModuleSlug}", fikk "${health.module_slug}"`,
    );
  }

  const info = await fetchModuleInfo(params.baseUrl);
  const verified = await verifyModuleOrganization({
    baseUrl: params.baseUrl,
    orgId: params.externalOrgId,
    apiKey: params.apiKey,
  });

  const baseForLinks = normalizeBase(info.app_base_url ?? params.baseUrl);
  const template = info.deep_links?.org_home;
  const orgHome =
    verified.deep_links?.org_home ??
    (template
      ? `${baseForLinks}${template.replace("{org_id}", params.externalOrgId)}`
      : `${baseForLinks}/orgs/${params.externalOrgId}`);

  return {
    health,
    info,
    verified,
    orgHome,
    orgName: verified.organization.name,
  };
}
