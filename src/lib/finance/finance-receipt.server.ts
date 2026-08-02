// Upload a receipt into Finance as expense entry + attachment.
import { resolveFinanceConnection, type FinanceConnectionContext } from "@/lib/finance/finance-invoice.server";

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Prefer invoices domain key (often has entries scopes); fall back to verify key. */
function domainKey(ctx: FinanceConnectionContext): string {
  return ctx.invoicesApiKey || ctx.apiKey;
}

export async function resolveAnyFinanceConnection(input: {
  supabaseAdmin: AdminClient;
  userId: string;
  orgSlug?: string | null;
}): Promise<FinanceConnectionContext | null> {
  if (input.orgSlug) {
    return resolveFinanceConnection({
      supabaseAdmin: input.supabaseAdmin,
      userId: input.userId,
      orgSlug: input.orgSlug,
    });
  }

  const { data: memberships } = await input.supabaseAdmin
    .from("memberships")
    .select("org_id")
    .eq("user_id", input.userId);
  const orgIds = (memberships ?? []).map((m) => m.org_id as string);
  if (!orgIds.length) return null;

  const { data: orgs } = await input.supabaseAdmin
    .from("organizations")
    .select("slug")
    .in("id", orgIds);
  for (const org of orgs ?? []) {
    const ctx = await resolveFinanceConnection({
      supabaseAdmin: input.supabaseAdmin,
      userId: input.userId,
      orgSlug: org.slug as string,
    });
    if (ctx) return ctx;
  }
  return null;
}

export async function uploadReceiptToFinance(input: {
  ctx: FinanceConnectionContext;
  fileBytes: Uint8Array;
  fileName: string;
  mimeType: string;
  description?: string;
  sourceRef: string;
}): Promise<{ entryId: string; attachmentId: string; duplicate?: boolean }> {
  const base = normalizeBase(input.ctx.connection.external_base_url);
  const key = domainKey(input.ctx);
  const today = new Date().toISOString().slice(0, 10);

  const entryRes = await fetch(`${base}/api/public/v1/entries`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      entry_type: "expense",
      entry_date: today,
      description: input.description?.trim() || `Kvittering ${input.fileName}`,
      amount_gross: 0,
      vat_rate: 25,
      payment_status: "unpaid",
      source_app: "nexus",
      source_type: "receipt",
      source_ref: input.sourceRef,
      notes: "Opprettet fra Nexus — beløp kan justeres i Finance",
    }),
  });
  const entryText = await entryRes.text();
  let entryBody: { data?: { id: string }; duplicate?: boolean; error?: string } = {};
  try {
    entryBody = entryText ? JSON.parse(entryText) : {};
  } catch {
    /* ignore */
  }
  if (!entryRes.ok || !entryBody.data?.id) {
    throw new Error(
      entryBody.error ||
        (entryRes.status === 403
          ? "Finance-nøkkel mangler entries:write — legg til domene-nøkkel under Moduler"
          : `Finance entries ${entryRes.status}`),
    );
  }

  const form = new FormData();
  const copy = new Uint8Array(input.fileBytes.byteLength);
  copy.set(input.fileBytes);
  const blob = new Blob([copy], { type: input.mimeType || "application/octet-stream" });
  form.append("file", blob, input.fileName);
  form.append("entry_id", entryBody.data.id);

  const attRes = await fetch(`${base}/api/public/v1/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const attText = await attRes.text();
  let attBody: { data?: { id: string }; error?: string } = {};
  try {
    attBody = attText ? JSON.parse(attText) : {};
  } catch {
    /* ignore */
  }
  if (!attRes.ok || !attBody.data?.id) {
    throw new Error(
      attBody.error ||
        (attRes.status === 403
          ? "Finance-nøkkel mangler attachments:write"
          : `Finance attachments ${attRes.status}`),
    );
  }

  return {
    entryId: entryBody.data.id,
    attachmentId: attBody.data.id,
    duplicate: entryBody.duplicate,
  };
}
