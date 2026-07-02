// Server-only: synthesize a ContextSummary from a sanitized bundle.
// Uses Lovable AI Gateway. Deterministic fallback when AI fails.

import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type {
  ContextScanBundle,
  ContextSummary,
  ContextEntityBundle,
  ContextGlobalBundle,
} from "./context.types";

const AiSchema = z.object({
  summary: z.string(),
  keyFacts: z.array(z.string()),
  openQuestions: z.array(z.string()),
  suggestedNextFocus: z.string().nullable(),
});

export type SynthesizedContext = Omit<
  ContextSummary,
  "id" | "user_id" | "created_at" | "updated_at" | "last_scanned_at"
>;

function clampArr(arr: string[], maxItems: number, maxLen: number): string[] {
  return arr
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .slice(0, maxItems)
    .map((s) => s.slice(0, maxLen));
}

type FallbackBody = {
  summary: string;
  key_facts: string[];
  open_questions: string[];
  suggested_next_focus: string | null;
};

function fallback(bundle: ContextScanBundle): FallbackBody {
  if (bundle.scopeType === "global") {
    const b = bundle as ContextGlobalBundle;
    if (b.insufficient) {
      return {
        summary:
          "Ikke nok historikk ennå. Koble Gmail/Slack og legg til enheter for å bygge kontekst.",
        key_facts: [],
        open_questions: ["Trenger flere koblede signaler"],
        suggested_next_focus: null,
      };
    }
    const facts: string[] = [];
    if (b.recentSignalsCount7d > 0)
      facts.push(`${b.recentSignalsCount7d} signaler siste 7 dager`);
    if (b.openCommitments.length > 0)
      facts.push(
        `${b.openCommitments.length} åpne løfter (${b.openCommitments.map((c) => c.title).slice(0, 3).join(", ")})`,
      );
    for (const w of b.widgets.slice(0, 3))
      facts.push(`${w.org} · ${w.module}: ${w.display}`);
    return {
      summary: `Oversikt: ${b.recentSignalsCount7d} nye signaler siste uke og ${b.openCommitments.length} åpne løfter.`,
      key_facts: clampArr(facts, 12, 200),
      open_questions: [],
      suggested_next_focus: b.openCommitments[0]?.title ?? null,
    };
  }
  const b = bundle as ContextEntityBundle;
  if (b.insufficient) {
    return {
      summary: `Ikke nok historikk ennå for ${b.entity.name}.`,
      key_facts: [],
      open_questions: ["Trenger flere koblede signaler"],
      suggested_next_focus: null,
    };
  }
  const facts: string[] = [];
  if (b.entity.lastActivityAt)
    facts.push(`Siste aktivitet: ${b.entity.lastActivityAt.slice(0, 10)}`);
  for (const c of b.commitments.slice(0, 3))
    facts.push(`Løfte: ${c.title}${c.dueDate ? ` (${c.dueDate})` : ""}`);
  for (const r of b.relationships.slice(0, 3))
    facts.push(
      `${r.direction === "outgoing" ? r.kind : "← " + r.kind} ${r.otherName}`,
    );
  for (const w of b.widgets.slice(0, 3)) facts.push(`${w.module}: ${w.display}`);
  return {
    summary: `${b.entity.name}: ${b.signals.length} signaler, ${b.commitments.length} åpne løfter.`,
    key_facts: clampArr(facts, 12, 200),
    open_questions: [],
    suggested_next_focus: b.commitments[0]?.title ?? null,
  };
}

export async function synthesizeContextSummary(
  bundle: ContextScanBundle,
): Promise<SynthesizedContext> {
  const base = {
    entity_id: bundle.scopeType === "global" ? null : (bundle as ContextEntityBundle).entity.id,
    scope_type: bundle.scopeType,
    scope_ref: bundle.scopeRef,
    source_counts: bundle.sourceCounts,
  };

  const key = process.env.LOVABLE_API_KEY;

  // Insufficient → deterministic
  if (bundle.insufficient || !key) {
    const f = fallback(bundle);
    return { ...base, ...f };
  }

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3-flash-preview");

  const system = [
    "You are Context Scan, a cautious summarizer.",
    "You receive a sanitized JSON bundle of the user's Platform data (entities, signals, commitments, widgets).",
    "Write in Norwegian (nb-NO) unless the input names/titles are clearly in another language — then match that language.",
    "Rules:",
    "- Only use facts present in the bundle. Never invent modules, numbers, people, dates.",
    "- summary: 2–6 sentences, max 1200 chars, calm and factual.",
    "- keyFacts: max 12 short bullets (each ≤200 chars) grounded in the bundle.",
    "- openQuestions: honest gaps (e.g. \"Uklart om fakturaen gjelder Nordahl\"); empty array if none.",
    "- suggestedNextFocus: one short line or null.",
    "- No PII beyond what's in the input. No links.",
  ].join(" ");

  try {
    const { output } = await generateText({
      model,
      system,
      prompt: JSON.stringify(bundle),
      output: Output.object({ schema: AiSchema }),
    });
    const summary = (output.summary ?? "").trim().slice(0, 1200);
    const keyFacts = clampArr(output.keyFacts ?? [], 12, 200);
    const openQuestions = clampArr(output.openQuestions ?? [], 6, 200);
    const suggestedNextFocus = output.suggestedNextFocus
      ? output.suggestedNextFocus.trim().slice(0, 300)
      : null;
    if (!summary) {
      const f = fallback(bundle);
      return { ...base, ...f };
    }
    return {
      ...base,
      summary,
      key_facts: keyFacts,
      open_questions: openQuestions,
      suggested_next_focus: suggestedNextFocus,
    } as SynthesizedContext;
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) {
      console.warn("[context-scan] AI failed, falling back", err);
    }
    const f = fallback(bundle);
    return { ...base, ...f };
  }
}

// Type-adapter so both fallback and AI paths return matching shapes.
declare module "./context.types" {}
