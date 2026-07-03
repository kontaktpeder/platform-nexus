// Context Scan v1 — synthesize a ContextSummary from a sanitized bundle.
// Hard rule: never invent a number. If value is missing/error, say "ukjent".
// Language: Norwegian narrative ("hva skjedde"), not metric dumps.

import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type {
  ContextScanBundle,
  ContextSummary,
  ContextEntityBundle,
  ContextGlobalBundle,
  ContextWorkspaceBundle,
  ContextFactProvenance,
  ContextSource,
  ContextWidgetFact,
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

function widgetLabel(w: ContextWidgetFact): string {
  const scope = `${w.orgName || w.orgSlug} · ${w.moduleSlug}:${w.widgetId}`;
  if (w.status === "ok" && w.displayValue) return `${scope}: ${w.displayValue}`;
  if (w.status === "error") return `${scope}: ukjent (${w.note ?? "feil"})`;
  return `${scope}: ikke nok data`;
}

function factProvenanceFromBundle(
  bundle: ContextScanBundle,
): ContextFactProvenance[] {
  const widgets: ContextWidgetFact[] =
    bundle.scopeType === "global"
      ? (bundle as ContextGlobalBundle).widgets
      : bundle.scopeType === "workspace"
        ? (bundle as ContextWorkspaceBundle).widgets
        : (bundle as ContextEntityBundle).widgets;
  return widgets.map((w) => ({
    source: "widget",
    sourceRef: w.sourceRef,
    displayValue: w.displayValue,
    extractedValue: w.extractedValue,
    status: w.status,
    note: w.note ?? null,
  }));
}

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
    if (b.recentSignalsCount30d > 0)
      facts.push(`${b.recentSignalsCount30d} signaler siste 30 dager`);
    if (b.activeEntityNames.length > 0)
      facts.push(`Aktive: ${b.activeEntityNames.slice(0, 5).join(", ")}`);
    if (b.openCommitments.length > 0)
      facts.push(
        `${b.openCommitments.length} åpne løfter (${b.openCommitments
          .map((c) => c.title)
          .slice(0, 3)
          .join(", ")})`,
      );
    for (const w of b.widgets.slice(0, 3)) facts.push(widgetLabel(w));
    return {
      summary:
        `Oversikt siste 30 dager: ${b.recentSignalsCount30d} signaler` +
        (b.activeEntityNames.length > 0
          ? `, aktive kontakter ${b.activeEntityNames.slice(0, 3).join(", ")}`
          : "") +
        `. ${b.openCommitments.length} åpne løfter.`,
      key_facts: clampArr(facts, 12, 200),
      open_questions: [],
      suggested_next_focus: b.openCommitments[0]?.title ?? null,
    };
  }
  if (bundle.scopeType === "workspace") {
    const b = bundle as ContextWorkspaceBundle;
    const facts: string[] = [];
    for (const w of b.widgets.slice(0, 4)) facts.push(widgetLabel(w));
    for (const a of b.missionActions.slice(0, 3))
      facts.push(`Handling: ${a.title}`);
    return {
      summary: `${b.orgName} · ${b.wsName}: ${b.widgets.filter((w) => w.status === "ok").length} widgets med data, ${b.missionActions.length} handlinger.`,
      key_facts: clampArr(facts, 10, 200),
      open_questions: [],
      suggested_next_focus: b.missionActions[0]?.title ?? null,
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
  for (const w of b.widgets.slice(0, 3)) facts.push(widgetLabel(w));
  return {
    summary: `${b.entity.name}: ${b.signals.length} signaler siste 30 dager, ${b.commitments.length} åpne løfter.`,
    key_facts: clampArr(facts, 12, 200),
    open_questions: [],
    suggested_next_focus: b.commitments[0]?.title ?? null,
  };
}

function includedSourcesOf(bundle: ContextScanBundle): ContextSource[] {
  if (bundle.scopeType === "global")
    return (bundle as ContextGlobalBundle).includedSources ?? [];
  if (bundle.scopeType === "workspace")
    return (bundle as ContextWorkspaceBundle).includedSources ?? [];
  return (bundle as ContextEntityBundle).includedSources ?? [];
}

function entityIdOf(bundle: ContextScanBundle): string | null {
  if (bundle.scopeType === "global" || bundle.scopeType === "workspace") return null;
  return (bundle as ContextEntityBundle).entity.id;
}

export async function synthesizeContextSummary(
  bundle: ContextScanBundle,
): Promise<SynthesizedContext> {
  const included_sources = includedSourcesOf(bundle);
  const fact_provenance = factProvenanceFromBundle(bundle);
  const base = {
    entity_id: entityIdOf(bundle),
    scope_type: bundle.scopeType,
    scope_ref: bundle.scopeRef,
    source_counts: bundle.sourceCounts,
    included_sources,
    fact_provenance,
  };

  const key = process.env.LOVABLE_API_KEY;

  if (bundle.insufficient || !key) {
    const f = fallback(bundle);
    return { ...base, ...f };
  }

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3-flash-preview");

  const system = [
    "Du er Context Scan. Du får et sanitert JSON-bundle med bruker-data (widgets, signaler, løfter, mission-actions).",
    "Skriv på norsk (nb-NO), som en kort fortelling — «hva skjedde, hvem venter, hva er blokkert, hva fortjener oppmerksomhet».",
    "HARDE REGLER:",
    "- Bruk ALDRI tall som ikke står i bundlet. Hvis en widget har status 'unknown' eller 'error', si «ukjent» eller «ikke nok data» — aldri «0».",
    "- Siter kun et tall når det finnes som displayValue i widgets-arrayen (bruk samme streng verbatim).",
    "- Ikke oppfinn moduler, personer eller datoer.",
    "- summary: 2–6 setninger, rolig, faktisk, historie-stil. Maks 1200 tegn.",
    "- keyFacts: maks 12 korte punkter (≤200 tegn), forankret i bundlet.",
    "- openQuestions: ærlige hull (f.eks. «Uklart om fakturaen gjelder Nordahl»); tom liste hvis ingen.",
    "- suggestedNextFocus: én kort linje eller null.",
    "- Ingen lenker, ingen PII utover det som allerede er i input.",
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
