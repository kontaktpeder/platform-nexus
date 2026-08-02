import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const uploadReceiptToFinanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fileBase64: z.string().min(1).max(20_000_000),
        fileName: z.string().min(1).max(200),
        mimeType: z.string().min(3).max(120),
        description: z.string().max(500).optional(),
        orgSlug: z.string().min(1).max(80).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveAnyFinanceConnection, uploadReceiptToFinance } = await import(
      "@/lib/finance/finance-receipt.server"
    );

    const ctx = await resolveAnyFinanceConnection({
      supabaseAdmin,
      userId,
      orgSlug: data.orgSlug ?? null,
    });
    if (!ctx) throw new Error("Ingen koblet Finance-organisasjon");

    const raw = data.fileBase64.replace(/^data:[^;]+;base64,/, "");
    const bin = atob(raw);
    const fileBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) fileBytes[i] = bin.charCodeAt(i);
    if (fileBytes.length === 0) throw new Error("Tom fil");
    if (fileBytes.length > 25 * 1024 * 1024) throw new Error("Filen er for stor (maks 25 MB)");

    const sourceRef = crypto.randomUUID();
    const result = await uploadReceiptToFinance({
      ctx,
      fileBytes,
      fileName: data.fileName,
      mimeType: data.mimeType,
      description: data.description,
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
