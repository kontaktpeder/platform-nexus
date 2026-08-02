import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ReceiptSuggestionSchema } from "@/lib/receipt-scan.server";

function base64ToBytes(fileBase64: string): Uint8Array {
  const raw = fileBase64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** AI-tolk én kvittering → forslag (bokføres ikke ennå). */
export const scanReceiptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fileBase64: z.string().min(1).max(20_000_000),
        fileName: z.string().min(1).max(200),
        mimeType: z.string().min(3).max(120),
        orgSlug: z.string().min(1).max(80).optional().nullable(),
        financeOrgName: z.string().max(200).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { scanReceiptWithGemini } = await import("@/lib/receipt-scan.server");
    const { resolveReceiptOrgContext } = await import("@/lib/receipt-org-context.server");

    const fileBytes = base64ToBytes(data.fileBase64);
    if (fileBytes.length === 0) throw new Error("Tom fil");
    if (fileBytes.length > 25 * 1024 * 1024) throw new Error("Filen er for stor (maks 25 MB)");

    const orgContext = await resolveReceiptOrgContext(supabase, userId, {
      orgSlug: data.orgSlug ?? null,
      financeOrgName: data.financeOrgName ?? null,
    });

    const suggestion = await scanReceiptWithGemini({
      bytes: fileBytes,
      mimeType: data.mimeType,
      fileName: data.fileName,
      orgContext,
    });
    return { suggestion, orgContext };
  });

/** Godkjenn forslag → lag bilag + vedlegg i valgt Finance-org. */
export const approveReceiptToFinanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fileBase64: z.string().min(1).max(20_000_000),
        fileName: z.string().min(1).max(200),
        mimeType: z.string().min(3).max(120),
        orgSlug: z.string().min(1).max(80),
        suggestion: ReceiptSuggestionSchema,
        sourceRef: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveAnyFinanceConnection, uploadApprovedReceiptToFinance } = await import(
      "@/lib/finance/finance-receipt.server"
    );

    const ctx = await resolveAnyFinanceConnection({
      supabaseAdmin,
      userId,
      orgSlug: data.orgSlug,
    });
    if (!ctx) throw new Error("Ingen koblet Finance-organisasjon for valgt org");

    const fileBytes = base64ToBytes(data.fileBase64);
    const sourceRef = data.sourceRef ?? crypto.randomUUID();
    const result = await uploadApprovedReceiptToFinance({
      ctx,
      fileBytes,
      fileName: data.fileName,
      mimeType: data.mimeType,
      suggestion: data.suggestion,
      sourceRef,
    });

    return {
      ok: true as const,
      entryId: result.entryId,
      attachmentId: result.attachmentId,
      duplicate: !!result.duplicate,
      financeOrg: ctx.connection.external_org_name ?? ctx.orgName,
    };
  });
