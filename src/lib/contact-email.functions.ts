// Contact email ServerFns — compose a NEW email to a contact from Nexus.
// - generateContactEmailDraft: AI suggests subject + body from an instruction.
// - sendContactEmail: send now or save as Gmail draft; sends are logged as
//   entity_signals so they show up in the contact timeline.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";

const GenerateInput = z.object({
  recipientName: z.string().max(200),
  instruction: z.string().min(1).max(600),
  currentSubject: z.string().max(300).optional(),
});

export const generateContactEmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data }): Promise<{ subject: string; body: string }> => {
    if (!getGeminiApiKey()) {
      throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY)");
    }
    const model = getGeminiModel("flash");

    const system = [
      "You draft short, professional NEW emails (not replies).",
      "You receive: recipient name, the user's instruction describing what the email should say, and optionally a subject the user already wrote.",
      "Write in the same language as the instruction (usually Norwegian).",
      "Body: 2–8 sentences, plain text. A simple greeting with the recipient's first name is fine.",
      "End with a friendly sign-off but do NOT sign a name — leave the signature blank for the user.",
      "Never invent facts, prices, links, dates, or names not present in the input.",
      'Return ONLY valid JSON on the form {"subject": "...", "body": "..."} — no markdown fences, no commentary.',
      "If the user already wrote a subject, keep it unless the instruction asks otherwise.",
    ].join(" ");

    const { text } = await generateText({
      model,
      system,
      prompt: JSON.stringify({
        recipient: data.recipientName,
        instruction: data.instruction,
        existingSubject: data.currentSubject ?? null,
      }),
    });

    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    try {
      const parsed = JSON.parse(cleaned) as { subject?: unknown; body?: unknown };
      const subject =
        typeof parsed.subject === "string" && parsed.subject.trim()
          ? parsed.subject.trim().slice(0, 300)
          : (data.currentSubject ?? "").trim();
      const body =
        typeof parsed.body === "string" && parsed.body.trim() ? parsed.body.trim() : cleaned;
      return { subject, body };
    } catch {
      // Model ignored the JSON contract — use raw text as body.
      return { subject: (data.currentSubject ?? "").trim(), body: cleaned };
    }
  });

const SendInput = z.object({
  entityId: z.string().min(1),
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  mode: z.enum(["send", "draft"]),
});

export const sendContactEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: entity, error } = await supabase
      .from("entities")
      .select("id, name")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!entity) throw new Error("Kontakt ikke funnet");

    const gmail = await import("@/lib/inbox/gmail.server");

    if (data.mode === "draft") {
      const draft = await gmail.createGmailComposeDraft({
        to: data.to,
        subject: data.subject,
        body: data.body,
      });
      return {
        ok: true,
        mode: "draft" as const,
        messageId: draft.messageId,
        openUrl: draft.openUrl,
      };
    }

    const sent = await gmail.sendGmailMessage({
      to: data.to,
      subject: data.subject,
      body: data.body,
    });

    const now = new Date().toISOString();
    // Log in the contact timeline; failures here must not mask a sent mail.
    const { error: sigErr } = await supabase.from("entity_signals").insert({
      user_id: userId,
      entity_id: data.entityId,
      source: "gmail",
      signal_type: "email_sent",
      external_ref: `gmail:${sent.messageId}`,
      occurred_at: now,
      snippet: `Sendte e-post: ${data.subject}`,
      link_source: "manual",
    });
    if (sigErr) console.warn("[sendContactEmail] signal insert", sigErr.message);
    await supabase
      .from("entities")
      .update({ last_seen_at: now })
      .eq("id", data.entityId)
      .eq("user_id", userId);

    return {
      ok: true,
      mode: "send" as const,
      messageId: sent.messageId,
      openUrl: null,
    };
  });
