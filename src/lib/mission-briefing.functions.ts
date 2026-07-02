import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

// Sanitized action card sent to the model — no raw email/Slack bodies beyond the
// short snippet already surfaced in the UI. No links, no IDs, no PII beyond what
// the user already sees on their own screen.
const SanitizedAction = z.object({
  key: z.string(),
  title: z.string(),
  source: z.enum(["gmail", "slack", "workspace", "commitment"]),
  tier: z.enum(["urgent", "important", "later"]),
  workspaceLabel: z.string().nullable(),
  snippet: z.string().nullable(),
  hasDeepLink: z.boolean(),
});

const ContextInput = z.object({
  globalSummary: z.string().nullable(),
  entitySummary: z.string().nullable(),
  keyFacts: z.array(z.string()),
});

const Input = z.object({
  actions: z.array(SanitizedAction).max(15),
  context: ContextInput.optional(),
});

const BriefingSchema = z.object({
  briefing: z.string(),
  recommendedKey: z.string().nullable(),
  reason: z.string().nullable(),
});

export type MissionBriefing = z.infer<typeof BriefingSchema>;

export const generateMissionBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<MissionBriefing> => {
    if (data.actions.length === 0) {
      return {
        briefing: "You're all caught up. Nothing urgent across your inboxes or workspaces.",
        recommendedKey: null,
        reason: null,
      };
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const system = [
      "You are Mission Control, a concise morning briefing assistant.",
      "You receive a small JSON list of the user's pending action cards (from Gmail, Slack, workspaces, and commitments), and optionally a `context` object with prior understanding.",
      "Write a calm, direct morning briefing in 2–4 sentences. No greetings, no emojis, no hype.",
      "If context is provided, weave it into the briefing in at most 1 sentence. Context enriches, does not replace action cards, and must never contradict them.",
      "Then pick exactly one action card as the top recommended first thing to do.",
      "Prefer urgent > important > later. Prefer actions with hasDeepLink=true when tied.",
      "Return the exact `key` string of the recommended card in recommendedKey.",
      "If nothing is worth recommending, set recommendedKey to null.",
      "Never invent tasks, links, or details not present in the input.",
    ].join(" ");

    const payload: Record<string, unknown> = { actions: data.actions };
    if (data.context) payload.context = data.context;

    try {
      const { output } = await generateText({
        model,
        system,
        prompt: JSON.stringify(payload),
        output: Output.object({ schema: BriefingSchema }),
      });

      const validKeys = new Set(data.actions.map((a) => a.key));
      const recommendedKey =
        output.recommendedKey && validKeys.has(output.recommendedKey)
          ? output.recommendedKey
          : null;

      return {
        briefing: output.briefing.trim(),
        recommendedKey,
        reason: output.reason?.trim() ?? null,
      };
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        // Degrade gracefully — caller falls back to deterministic Morning Brief.
        console.warn("[mission-briefing] AI returned malformed output, falling back", err);
        return { briefing: "", recommendedKey: null, reason: null };
      }
      throw err;
    }
  });
