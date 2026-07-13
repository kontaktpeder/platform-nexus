// Server-only Finance invoice API via module connection.
import { decryptSecret } from "@/lib/module-secrets.server";
import type { ModuleConnectionRow } from "@/lib/module-connections";

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export type FinanceInvoiceSummary = {
  id: string;
  invoice_number: string | null;
  customer_name: string;
  customer_email: string | null;
  status: string;
  total: number;
  due_date: string | null;
  issue_date: string | null;
};

export type FinanceConnectionContext = {
  connection: ModuleConnectionRow;
  apiKey: string;
  orgSlug: string;
  orgName: string;
  workspaceId: string;
  orgId: string;
};

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function financeFetch<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
): Promise<T> {
  const res = await fetch(`${normalizeBase(baseUrl)}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: string }).message)
        : `Finance API ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export async function resolveFinanceConnection(input: {
  supabaseAdmin: AdminClient;
  userId: string;
  orgSlug: string;
}): Promise<FinanceConnectionContext | null> {
  const { data: memberships } = await input.supabaseAdmin
    .from("memberships")
    .select("org_id")
    .eq("user_id", input.userId);
  const orgIds = (memberships ?? []).map((m) => m.org_id as string);
  if (!orgIds.length) return null;

  const { data: orgs } = await input.supabaseAdmin
    .from("organizations")
    .select("id, name, slug")
    .in("id", orgIds)
    .eq("slug", input.orgSlug)
    .maybeSingle();
  if (!orgs) return null;

  const { data: workspaces } = await input.supabaseAdmin
    .from("workspaces")
    .select("id")
    .eq("org_id", orgs.id)
    .limit(1);
  const workspaceId = workspaces?.[0]?.id as string | undefined;
  if (!workspaceId) return null;

  const { data: conn } = await input.supabaseAdmin
    .from("module_connections")
    .select(
      "id, org_id, workspace_id, module_id, external_org_id, external_base_url, status, module_slug, module_info_snapshot, resolved_org_home_url, external_org_name",
    )
    .eq("workspace_id", workspaceId)
    .eq("org_id", orgs.id)
    .eq("module_slug", "finance")
    .eq("status", "connected")
    .maybeSingle();
  if (!conn) return null;

  const { data: sec } = await input.supabaseAdmin
    .from("module_connection_secrets")
    .select("api_key_ciphertext")
    .eq("connection_id", conn.id)
    .maybeSingle();
  if (!sec) return null;

  return {
    connection: conn as ModuleConnectionRow,
    apiKey: decryptSecret(sec.api_key_ciphertext),
    orgSlug: orgs.slug as string,
    orgName: orgs.name as string,
    workspaceId,
    orgId: orgs.id as string,
  };
}

export async function listUnpaidFinanceInvoices(
  ctx: FinanceConnectionContext,
): Promise<FinanceInvoiceSummary[]> {
  const res = await financeFetch<{ data?: FinanceInvoiceSummary[] }>(
    ctx.connection.external_base_url,
    ctx.apiKey,
    "/api/public/v1/invoices?status=sent&limit=20",
  );
  return (res.data ?? []).map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number ?? null,
    customer_name: inv.customer_name,
    customer_email: inv.customer_email ?? null,
    status: inv.status,
    total: Number(inv.total),
    due_date: inv.due_date ?? null,
    issue_date: inv.issue_date ?? null,
  }));
}

export async function fetchFinanceInvoice(
  ctx: FinanceConnectionContext,
  invoiceId: string,
): Promise<FinanceInvoiceSummary> {
  const res = await financeFetch<{ data?: FinanceInvoiceSummary }>(
    ctx.connection.external_base_url,
    ctx.apiKey,
    `/api/public/v1/invoices/${encodeURIComponent(invoiceId)}`,
  );
  if (!res.data) throw new Error("Faktura ikke funnet");
  return {
    id: res.data.id,
    invoice_number: res.data.invoice_number ?? null,
    customer_name: res.data.customer_name,
    customer_email: res.data.customer_email ?? null,
    status: res.data.status,
    total: Number(res.data.total),
    due_date: res.data.due_date ?? null,
    issue_date: res.data.issue_date ?? null,
  };
}

export async function fetchFinanceInvoicePdf(
  ctx: FinanceConnectionContext,
  invoiceId: string,
): Promise<{ filename: string; bytes: Uint8Array }> {
  const res = await fetch(
    `${normalizeBase(ctx.connection.external_base_url)}/api/public/v1/invoices/${encodeURIComponent(invoiceId)}/pdf`,
    { headers: { Authorization: `Bearer ${ctx.apiKey}` } },
  );
  if (!res.ok) throw new Error("Kunne ikke hente faktura-PDF");
  const buf = new Uint8Array(await res.arrayBuffer());
  const disp = res.headers.get("Content-Disposition") ?? "";
  const m = disp.match(/filename="?([^";]+)"?/i);
  const filename = m?.[1] ?? `faktura-${invoiceId}.pdf`;
  return { filename, bytes: buf };
}
