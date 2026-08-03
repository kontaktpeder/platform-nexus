// Server-only Control domain API via module connection.
import type { ModuleConnectionRow } from "@/lib/module-connections";

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export type ControlConnectionContext = {
  connection: ModuleConnectionRow;
  apiKey: string;
  orgSlug: string;
  orgName: string;
};

export type ControlAgreementCreateResult = {
  agreement: {
    id: string;
    title: string;
    status: string;
    agreement_type: string;
    counterparty_name: string | null;
    version: number;
    source: string;
    created_at: string;
  };
  deep_links?: {
    agreement?: string;
    org_agreements?: string;
  };
};

export type ControlAgreementListItem = {
  id: string;
  title: string;
  status: string;
  agreement_type: string;
  counterparty_name: string | null;
  version: number;
  source: string;
  updated_at: string;
  created_at: string;
  body_preview: string;
  deep_link: string;
};

export type ControlAgreementDetail = {
  id: string;
  org_id: string;
  title: string;
  body: string;
  status: string;
  agreement_type: string;
  counterparty_name: string | null;
  version: number;
  source: string;
  source_ref: string | null;
  updated_at: string;
  created_at: string;
};

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function controlFetch<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${normalizeBase(baseUrl)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const errObj =
      typeof body === "object" && body && "error" in body
        ? (body as { error?: { message?: string } | string }).error
        : null;
    const msg =
      typeof errObj === "object" && errObj?.message
        ? errObj.message
        : typeof errObj === "string"
          ? errObj
          : `Control API ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

/** Resolve a connected Control module for the user (prefer orgSlug when given). */
export async function resolveControlConnection(input: {
  supabaseAdmin: AdminClient;
  userId: string;
  orgSlug?: string | null;
}): Promise<ControlConnectionContext | null> {
  const { data: memberships } = await input.supabaseAdmin
    .from("memberships")
    .select("org_id")
    .eq("user_id", input.userId);
  const orgIds = (memberships ?? []).map((m) => m.org_id as string);
  if (!orgIds.length) return null;

  const { data: orgs } = await input.supabaseAdmin
    .from("organizations")
    .select("id, name, slug")
    .in("id", orgIds);
  const orgById = new Map(
    (orgs ?? []).map((o) => [o.id as string, o as { id: string; name: string; slug: string }]),
  );

  const { data: conns } = await input.supabaseAdmin
    .from("module_connections")
    .select(
      "id, org_id, workspace_id, module_id, external_org_id, external_base_url, status, module_slug, module_info_snapshot, resolved_org_home_url, external_org_name",
    )
    .eq("module_slug", "control")
    .eq("status", "connected")
    .in("org_id", orgIds);

  if (!conns?.length) return null;

  const want = (input.orgSlug ?? "").trim().toLowerCase();
  let chosen = conns[0];
  if (want) {
    const match = conns.find((c) => {
      const slug = orgById.get(c.org_id as string)?.slug?.toLowerCase();
      return slug === want;
    });
    if (match) chosen = match;
  }

  const platform = orgById.get(chosen.org_id as string);
  if (!platform || !chosen.external_base_url) return null;

  const { getModuleConnectionSecrets } = await import(
    "@/lib/module-connection-secrets.server"
  );
  const secrets = await getModuleConnectionSecrets(input.supabaseAdmin, chosen.id as string);
  if (!secrets?.verifyApiKey) return null;

  return {
    connection: chosen as ModuleConnectionRow,
    apiKey: secrets.verifyApiKey,
    orgSlug: platform.slug,
    orgName: platform.name,
  };
}

export async function createControlAgreementDraft(
  ctx: ControlConnectionContext,
  input: {
    title: string;
    body: string;
    agreement_type?: string;
    counterparty_name?: string | null;
    source_ref?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<ControlAgreementCreateResult> {
  return controlFetch<ControlAgreementCreateResult>(
    ctx.connection.external_base_url,
    ctx.apiKey,
    "/api/public/v1/agreements",
    {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        agreement_type: input.agreement_type ?? "other",
        counterparty_name: input.counterparty_name ?? null,
        source: "nexus_fortell",
        source_ref: input.source_ref ?? null,
        metadata: input.metadata ?? {},
      }),
    },
  );
}

export async function listControlAgreements(
  ctx: ControlConnectionContext,
  input?: { q?: string | null; status?: string | null; limit?: number },
): Promise<{ agreements: ControlAgreementListItem[] }> {
  const params = new URLSearchParams();
  if (input?.q?.trim()) params.set("q", input.q.trim());
  if (input?.status?.trim()) params.set("status", input.status.trim());
  if (input?.limit) params.set("limit", String(input.limit));
  const qs = params.toString();
  return controlFetch<{ agreements: ControlAgreementListItem[] }>(
    ctx.connection.external_base_url,
    ctx.apiKey,
    `/api/public/v1/agreements${qs ? `?${qs}` : ""}`,
  );
}

export async function getControlAgreement(
  ctx: ControlConnectionContext,
  id: string,
): Promise<{
  agreement: ControlAgreementDetail;
  deep_links?: { agreement?: string };
}> {
  return controlFetch(
    ctx.connection.external_base_url,
    ctx.apiKey,
    `/api/public/v1/agreements/${encodeURIComponent(id)}`,
  );
}

export async function updateControlAgreementDraft(
  ctx: ControlConnectionContext,
  id: string,
  input: {
    title?: string;
    body?: string;
    agreement_type?: string;
    counterparty_name?: string | null;
    source_ref?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<ControlAgreementCreateResult> {
  return controlFetch<ControlAgreementCreateResult>(
    ctx.connection.external_base_url,
    ctx.apiKey,
    `/api/public/v1/agreements/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.agreement_type !== undefined
          ? { agreement_type: input.agreement_type }
          : {}),
        ...(input.counterparty_name !== undefined
          ? { counterparty_name: input.counterparty_name }
          : {}),
        ...(input.source_ref !== undefined ? { source_ref: input.source_ref } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      }),
    },
  );
}
