// Server-only Work domain API via module connection.
import type { ModuleConnectionRow } from "@/lib/module-connections";

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export type WorkConnectionContext = {
  connection: ModuleConnectionRow;
  apiKey: string;
  orgSlug: string;
  orgName: string;
  workspaceId: string;
  orgId: string;
};

export type WorkProject = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  description: string | null;
  hourly_rate: number | null;
  is_active: boolean;
};

export type WorkRate = {
  id: string;
  organization_id: string;
  name: string;
  amount: number;
  currency: string;
  description: string | null;
  is_active: boolean;
};

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function workFetch<T>(
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
          : `Work API ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

/** Resolve any connected Work module for the user (prefer orgSlug when given). */
export async function resolveWorkConnection(input: {
  supabaseAdmin: AdminClient;
  userId: string;
  orgSlug?: string | null;
}): Promise<WorkConnectionContext | null> {
  const { data: memberships } = await input.supabaseAdmin
    .from("memberships")
    .select("org_id")
    .eq("user_id", input.userId);
  const orgIds = (memberships ?? []).map((m) => m.org_id as string);
  if (!orgIds.length) return null;

  let orgQuery = input.supabaseAdmin
    .from("organizations")
    .select("id, name, slug")
    .in("id", orgIds);
  if (input.orgSlug) orgQuery = orgQuery.eq("slug", input.orgSlug);
  const { data: orgs } = await orgQuery;
  if (!orgs?.length) return null;

  for (const org of orgs) {
    const { data: workspaces } = await input.supabaseAdmin
      .from("workspaces")
      .select("id")
      .eq("org_id", org.id)
      .limit(5);
    for (const ws of workspaces ?? []) {
      const { data: conn } = await input.supabaseAdmin
        .from("module_connections")
        .select(
          "id, org_id, workspace_id, module_id, external_org_id, external_base_url, status, module_slug, module_info_snapshot, resolved_org_home_url, external_org_name",
        )
        .eq("workspace_id", ws.id)
        .eq("org_id", org.id)
        .eq("module_slug", "work")
        .eq("status", "connected")
        .maybeSingle();
      if (!conn?.external_base_url) continue;

      const { getModuleConnectionSecrets } = await import(
        "@/lib/module-connection-secrets.server"
      );
      const secrets = await getModuleConnectionSecrets(
        input.supabaseAdmin,
        conn.id as string,
      );
      if (!secrets?.verifyApiKey) continue;

      return {
        connection: conn as ModuleConnectionRow,
        apiKey: secrets.verifyApiKey,
        orgSlug: org.slug as string,
        orgName: org.name as string,
        workspaceId: ws.id as string,
        orgId: org.id as string,
      };
    }
  }
  return null;
}

export async function listWorkProjects(ctx: WorkConnectionContext): Promise<WorkProject[]> {
  const res = await workFetch<{ data?: WorkProject[] }>(
    ctx.connection.external_base_url,
    ctx.apiKey,
    "/api/public/v1/projects",
  );
  return res.data ?? [];
}

export async function listWorkRates(ctx: WorkConnectionContext): Promise<WorkRate[]> {
  const res = await workFetch<{ data?: WorkRate[] }>(
    ctx.connection.external_base_url,
    ctx.apiKey,
    "/api/public/v1/rates",
  );
  return res.data ?? [];
}

export async function createWorkTimeEntry(
  ctx: WorkConnectionContext,
  body: {
    project_id: string;
    rate_id?: string | null;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes?: number;
    comment?: string | null;
    source?: "timer" | "manual";
    source_ref?: string;
  },
): Promise<{ id: string; total_minutes: number | null; duplicate?: boolean }> {
  const res = await workFetch<{
    data?: { id: string; total_minutes: number | null };
    duplicate?: boolean;
  }>(ctx.connection.external_base_url, ctx.apiKey, "/api/public/v1/time-entries", {
    method: "POST",
    body: JSON.stringify({
      project_id: body.project_id,
      rate_id: body.rate_id ?? null,
      date: body.date,
      start_time: body.start_time,
      end_time: body.end_time,
      break_minutes: body.break_minutes ?? 0,
      comment: body.comment ?? null,
      source: body.source ?? "timer",
      source_app: "nexus",
      source_ref: body.source_ref,
    }),
  });
  if (!res.data?.id) throw new Error("Work returnerte ingen timeføring");
  return {
    id: res.data.id,
    total_minutes: res.data.total_minutes ?? null,
    duplicate: res.duplicate,
  };
}
