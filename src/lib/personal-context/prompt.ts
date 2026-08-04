import type { JsonObject, PersonalContextRecord } from "./types";

/** Keep agent prompts lean — full dossier stays in DB for editing. */
const PROMPT_CAP = 2200;

/** Build a capped system-prompt block from the personal dossier. */
export function buildPersonalContextPromptBlock(
  record: PersonalContextRecord | null,
): string | null {
  if (!record) return null;

  const digest =
    record.rawMarkdown.trim() ||
    buildFallbackDigest(record.dossier);

  if (!digest.trim()) return null;

  const capped =
    digest.length > PROMPT_CAP
      ? `${digest.slice(0, PROMPT_CAP - 1).trimEnd()}…`
      : digest;

  const generated = record.generatedAt
    ? `Dossier generert/oppdatert: ${record.generatedAt}.`
    : `Dossier sist lagret: ${record.updatedAt.slice(0, 10)}.`;

  return [
    "PERSONLIG KONTEKST (bruker-forfattet dossier — ikke oppfunnet av deg):",
    generated,
    "Business-status eldre enn ~30 dager skal verifiseres før viktige råd.",
    "---",
    capped,
    "---",
  ].join("\n");
}

function buildFallbackDigest(dossier: JsonObject): string {
  const identity = asObj(dossier.identity);
  const goals = asObj(dossier.goals);
  const branding = asObj(dossier.branding);
  const rules = Array.isArray(dossier.operating_rules)
    ? (dossier.operating_rules as unknown[]).filter((r) => typeof r === "string").slice(0, 12)
    : [];

  const lines: string[] = ["# Hvem er brukeren?"];

  if (typeof identity.full_name === "string") {
    lines.push(identity.full_name);
  }
  if (typeof identity.how_i_work === "string") {
    lines.push("", "## Hvordan arbeider brukeren", identity.how_i_work);
  }
  if (typeof identity.communication_style === "string") {
    lines.push("", "## Kommunikasjonsstil", identity.communication_style);
  }

  const quarter = Array.isArray(goals.this_quarter)
    ? (goals.this_quarter as unknown[]).filter((g) => typeof g === "string").slice(0, 8)
    : [];
  if (quarter.length) {
    lines.push("", "## Dette kvartalet", ...quarter.map((g) => `- ${g}`));
  }

  if (typeof branding.personal_positioning === "string") {
    lines.push("", "## Posisjonering", branding.personal_positioning);
  }

  if (rules.length) {
    lines.push("", "## Driftsregler", ...rules.map((r) => `- ${r}`));
  }

  return lines.join("\n");
}

function asObj(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
