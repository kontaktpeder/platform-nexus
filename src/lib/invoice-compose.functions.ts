// Mission Invoice Composer — preview + send with PDF from Finance.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  formatNok,
  loadInvoiceComposeContext,
} from "@/lib/finance/invoice-compose.server";
import { isValidEmailList, parseEmailList, formatEmailList } from "@/lib/email-recipients";

const emailListSchema = z
  .string()
  .min(3)
  .refine(isValidEmailList, { message: "Ugyldig e-postliste" });

const ComposeInput = z.object({
  invoiceId: z.string().uuid(),
  orgSlug: z.string().min(1),
});

export const getInvoiceComposeContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ComposeInput.parse(input))
  .handler(async ({ data, context }) => {
    return loadInvoiceComposeContext({
      supabase: context.supabase,
      userId: context.userId,
      invoiceId: data.invoiceId,
      orgSlug: data.orgSlug,
    });
  });

const GenerateInput = z.object({
  invoiceId: z.string().uuid(),
  orgSlug: z.string().min(1),
  to: emailListSchema,
  cc: z.string().optional(),
  subject: z.string().max(300),
  instruction: z.string().max(800).optional(),
});

export const generateInvoiceEmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data, context }): Promise<{ body: string }> => {
    const ctx = await loadInvoiceComposeContext({
      supabase: context.supabase,
      userId: context.userId,
      invoiceId: data.invoiceId,
      orgSlug: data.orgSlug,
    });

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const inv = ctx.invoice;
    const timeline = ctx.storyline.events
      .slice(0, 8)
      .map((e) => {
        const when = e.at ? new Date(e.at).toLocaleDateString("nb-NO") : "ukjent dato";
        return `- ${when}: ${e.label}${e.snippet ? ` — ${e.snippet}` : ""}`;
      })
      .join("\n");

    const system = [
      "Du skriver profesjonelle e-poster på norsk for betalingsoppfølging.",
      ctx.storyline.suggestedTone,
      "Ikke finn på fakta som ikke står i input. Bruk korrekt beløp og fakturanummer.",
      "2–8 setninger. Enkel hilsen (Hei,) og avslutt med «Med vennlig hilsen» uten navn.",
      "Returner kun e-postteksten — ikke emne, ikke signaturnavn.",
    ].join(" ");

    const prompt = JSON.stringify({
      customer: inv.customer_name,
      invoice_number: inv.invoice_number,
      amount: formatNok(inv.total),
      due_date: inv.due_date,
      escalation: ctx.storyline.escalationLabel,
      timeline: timeline || "Ingen tidligere hendelser registrert.",
      user_instruction: data.instruction ?? null,
    });

    const { text } = await generateText({ model, system, prompt });
    return { body: text.trim() };
  });

const SendInput = z.object({
  invoiceId: z.string().uuid(),
  orgSlug: z.string().min(1),
  to: emailListSchema,
  cc: z.string().optional(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  briefItemId: z.string().optional(),
  replyInThread: z.boolean().optional(),
  threadId: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
});

export const sendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveFinanceConnection, fetchFinanceInvoicePdf } = await import(
      "@/lib/finance/finance-invoice.server"
    );
    const { sendGmailWithAttachment } = await import("@/lib/inbox/gmail.server");

    const fin = await resolveFinanceConnection({
      supabaseAdmin,
      userId: context.userId,
      orgSlug: data.orgSlug,
    });
    if (!fin) throw new Error("Finance er ikke koblet.");

    const pdf = await fetchFinanceInvoicePdf(fin, data.invoiceId);
    const toHeader = formatEmailList(parseEmailList(data.to));
    const ccHeader = data.cc?.trim() ? formatEmailList(parseEmailList(data.cc)) : undefined;

    const sent = await sendGmailWithAttachment({
      to: toHeader,
      cc: ccHeader,
      subject: data.subject,
      body: data.body,
      attachment: {
        filename: pdf.filename,
        mimeType: "application/pdf",
        data: pdf.bytes,
      },
      threadId: data.replyInThread ? data.threadId : undefined,
      inReplyTo: data.replyInThread ? data.inReplyTo : undefined,
      references: data.replyInThread ? data.references : undefined,
    });

    const ctx = await loadInvoiceComposeContext({
      supabase: context.supabase,
      userId: context.userId,
      invoiceId: data.invoiceId,
      orgSlug: data.orgSlug,
    });

    if (ctx.storyline.entityId) {
      await context.supabase.from("entity_signals").upsert(
        {
          user_id: context.userId,
          entity_id: ctx.storyline.entityId,
          source: "mission",
          signal_type: "invoice_reminder_sent",
          external_ref: `finance:${data.orgSlug}:invoice:${data.invoiceId}:reminder:${new Date().toISOString().slice(0, 10)}`,
          occurred_at: new Date().toISOString(),
          snippet: `Sendt purring: ${data.subject}`.slice(0, 160),
          link_source: "manual",
        },
        { onConflict: "user_id,external_ref" },
      );
    }

    if (data.briefItemId) {
      const { upsertMissionActionState } = await import("@/lib/mission-action-state.server");
      await upsertMissionActionState(context.supabase, {
        userId: context.userId,
        actionKey: `brief:${data.briefItemId}`,
        status: "handled_locally",
      });
      await upsertMissionActionState(context.supabase, {
        userId: context.userId,
        actionKey: `finance:${data.orgSlug}:invoice:${data.invoiceId}`,
        status: "handled_locally",
      });
    }

    await context.supabase
      .from("morning_mission_briefs")
      .delete()
      .eq("user_id", context.userId)
      .eq(
        "brief_date",
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Oslo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
      );

    return {
      ok: true as const,
      messageId: sent.messageId,
      threadId: sent.threadId,
      openUrl: `https://mail.google.com/mail/u/0/#sent/${sent.messageId}`,
    };
  });
