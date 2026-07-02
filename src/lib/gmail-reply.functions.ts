// Gmail reply-draft ServerFns.
// - getGmailReplyContext: fetch subject/sender/snippet for a message id.
// - generateGmailReplyDraft: server-side AI reply from sanitized context only.
// - saveGmailDraft: create a Gmail draft (never sends).
// Nothing is persisted in Platform DB.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const ContextInput = z.object({ messageId: z.string().min(1).max(200) });

export const getGmailReplyContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ContextInput.parse(input))
  .handler(async ({ data }) => {
    const { getGmailReplyContext: fetchCtx } = await import(
      "@/lib/inbox/gmail.server"
    );
    const ctx = await fetchCtx(data.messageId);
    // Return only what the UI needs — omit rfcMessageId/references from client.
    return {
      messageId: ctx.messageId,
      subject: ctx.subject,
      senderName: ctx.senderName,
      senderEmail: ctx.senderEmail,
      snippet: ctx.snippet,
    };
  });

const GenerateInput = z.object({
  subject: z.string().max(300),
  senderName: z.string().max(200),
  snippet: z.string().max(600),
  instruction: z.string().max(500).optional(),
});

export const generateGmailReplyDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data }): Promise<{ reply: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const system = [
      "You draft short, professional email replies.",
      "You receive only: subject, sender name, a brief snippet of the incoming email, and optional user instruction.",
      "Write a reply of 2–6 sentences in plain text. No greeting like 'Dear' unless the sender's tone calls for it; a simple 'Hi <first name>,' is fine.",
      "End with a friendly sign-off. Do not sign a specific name — leave the signature line blank so the user can add their own.",
      "Never invent facts, prices, links, dates, or names not present in the input.",
      "If the snippet is too vague to answer, write a short acknowledgement asking a clarifying question.",
      "Return only the email body text — no subject line, no quoted original.",
    ].join(" ");

    const promptPayload = {
      subject: data.subject,
      from: data.senderName,
      snippet: data.snippet,
      instruction: data.instruction ?? null,
    };

    const { text } = await generateText({
      model,
      system,
      prompt: JSON.stringify(promptPayload),
    });

    return { reply: text.trim() };
  });

const SaveInput = z.object({
  messageId: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
});

export const saveGmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data }) => {
    const { getGmailReplyContext: fetchCtx, createGmailReplyDraft } =
      await import("@/lib/inbox/gmail.server");
    const context = await fetchCtx(data.messageId);
    const saved = await createGmailReplyDraft({ context, body: data.body });
    return {
      draftId: saved.draftId,
      openUrl: saved.openUrl,
    };
  });
