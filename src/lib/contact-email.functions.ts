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
      "Do NOT include any sign-off (no «Vennlig hilsen», no name) — Nexus appends the user's signature.",
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
      const { stripTrailingSignOff } = await import("@/lib/mail-compose");
      const body = stripTrailingSignOff(
        typeof parsed.body === "string" && parsed.body.trim() ? parsed.body.trim() : cleaned,
      );
      return { subject, body };
    } catch {
      const { stripTrailingSignOff } = await import("@/lib/mail-compose");
      // Model ignored the JSON contract — use raw text as body.
      return {
        subject: (data.currentSubject ?? "").trim(),
        body: stripTrailingSignOff(cleaned),
      };
    }
  });

const SendInput = z.object({
  entityId: z.string().min(1),
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  mode: z.enum(["send", "draft"]),
  fromEmail: z.string().email().nullable().optional(),
  fromDisplayName: z.string().max(80).nullable().optional(),
  signatureBody: z.string().max(4000).nullable().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1).max(180),
        mimeType: z.string().min(1).max(120),
        dataBase64: z.string().min(1).max(20_000_000),
      }),
    )
    .max(5)
    .optional(),
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
    const { appendMailSignature } = await import("@/lib/mail-compose");
    const { validateMailAttachments } = await import("@/lib/mail-attachments");
    const body = appendMailSignature(data.body, data.signatureBody);
    const from = data.fromEmail
      ? { email: data.fromEmail, displayName: data.fromDisplayName ?? null }
      : null;
    const attachmentErr = data.attachments?.length
      ? validateMailAttachments(data.attachments)
      : null;
    if (attachmentErr) throw new Error(attachmentErr);
    const attachments = data.attachments?.map((f) => ({
      filename: f.filename.trim().slice(0, 180),
      mimeType: f.mimeType.trim().slice(0, 120) || "application/octet-stream",
      data: new Uint8Array(Buffer.from(f.dataBase64, "base64")),
    }));

    if (data.mode === "draft") {
      const draft = await gmail.createGmailComposeDraft({
        to: data.to,
        subject: data.subject,
        body,
        from,
        attachments,
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
      body,
      from,
      attachments,
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
