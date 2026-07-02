// Knowledge v3 — Commitment detection (server-only).
// Sends ONLY sanitized snippets (<=160 chars) + sender/entity hints to the model.
// Never persists raw email/slack bodies beyond the extracted commitment title.

import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type { CommitmentConfidence } from "./commitment.types";

export type DetectSignalInput = {
  source: "gmail" | "slack";
  sourceRef: string;
  snippet: string | null;
  sender?: string | null;
  occurredAt?: string | null;
  entityId?: string | null;
  entityName?: string | null;
};

export type DetectedCommitment = {
  sourceRef: string;
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  confidence: CommitmentConfidence;
  reason: string;
  detectedPhrase: string | null;
  entityId: string | null;
};

const DetectedSchema = z.object({
  sourceRef: z.string(),
  title: z.string().min(1).max(300),
  dueDate: z.string().nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]),
  reason: z.string().max(300).optional(),
  detectedPhrase: z.string().max(200).nullable().optional(),
  entityId: z.string().nullable().optional(),
});

const OutputSchema = z.object({
  detected: z.array(DetectedSchema).max(30),
});

function isValidIsoDate(s: string | null | undefined): s is string {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export type DetectInput = {
  signals: DetectSignalInput[];
  existingCommitmentRefs: string[];
  todayOslo: string;
};

export async function detectCommitmentsFromSignals(
  input: DetectInput,
): Promise<DetectedCommitment[]> {
  const existing = new Set(input.existingCommitmentRefs);
  const candidates = input.signals.filter(
    (s) => !existing.has(s.sourceRef) && (s.snippet ?? "").trim().length > 0,
  );
  if (candidates.length === 0) return [];

  const key = process.env.LOVABLE_API_KEY;
  if (!key) return [];

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3-flash-preview");

  const sanitized = candidates.map((s) => ({
    sourceRef: s.sourceRef,
    source: s.source,
    snippet: (s.snippet ?? "").slice(0, 160),
    sender: s.sender ?? null,
    occurredAt: s.occurredAt ?? null,
    entityId: s.entityId ?? null,
    entityName: s.entityName ?? null,
  }));

  const system = [
    "You detect COMMITMENTS the user (Peder) has made in inbound Gmail/Slack signals.",
    "A commitment = an explicit promise or planned follow-up BY THE USER.",
    "Examples: 'I'll send', 'Jeg sender', 'follow up next week', 'ringer senere', 'menyen på fredag'.",
    "Do NOT detect: inbound asks without user reply, newsletters, marketing, vague noise.",
    "Never invent entities. Only echo entityId if it was provided for that signal.",
    "Never quote the message. Rewrite title as a short imperative summary (max 300 chars), in the user's language.",
    `Today is ${input.todayOslo} in Europe/Oslo. Infer dueDate as YYYY-MM-DD when the phrase mentions a day/time (fredag, tomorrow, next week). If unclear, dueDate = null.`,
    "Confidence:",
    " - high: unambiguous first-person promise AND clear phrase",
    " - medium: likely promise, minor ambiguity",
    " - low: possible promise, weak signal — prefer omitting rather than guessing",
    "If a signal is not a commitment, omit it from the output. Only include real commitments.",
    "detectedPhrase: the short verbatim phrase (from the snippet) that triggered detection, max 200.",
    "Return the sourceRef exactly as given.",
  ].join("\n");

  try {
    const { output } = await generateText({
      model,
      system,
      prompt: JSON.stringify({
        todayOslo: input.todayOslo,
        signals: sanitized,
      }),
      output: Output.object({ schema: OutputSchema }),
    });

    const refsInInput = new Set(candidates.map((c) => c.sourceRef));
    const results: DetectedCommitment[] = [];
    for (const d of output.detected) {
      if (!refsInInput.has(d.sourceRef)) continue;
      if (existing.has(d.sourceRef)) continue;
      const inputSignal = candidates.find((c) => c.sourceRef === d.sourceRef);
      const dueDate = isValidIsoDate(d.dueDate) ? d.dueDate : null;
      const title = d.title.trim().slice(0, 300);
      if (!title) continue;

      // Post-AI filter: drop low-confidence when snippet is too short.
      if (d.confidence === "low" && (inputSignal?.snippet ?? "").length < 20) continue;

      results.push({
        sourceRef: d.sourceRef,
        title,
        dueDate,
        confidence: d.confidence,
        reason: (d.reason ?? "").trim().slice(0, 300),
        detectedPhrase: d.detectedPhrase ? d.detectedPhrase.trim().slice(0, 200) : null,
        entityId: d.entityId ?? inputSignal?.entityId ?? null,
      });
    }
    return results;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      console.warn("[commitment-detect] AI malformed output", err);
    } else {
      console.warn("[commitment-detect] AI failed", err);
    }
    return [];
  }
}
