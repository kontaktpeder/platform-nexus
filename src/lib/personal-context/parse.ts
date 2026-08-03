/**
 * Parse a ChatGPT-style personal context paste into dossier + markdown digest.
 * Accepts: pure JSON, JSON + trailing markdown, or { dossier, raw_markdown }.
 */

import type { JsonObject } from "./types";
import { toJsonObject } from "./types";

export type ParsedPersonalImport = {
  dossier: JsonObject;
  rawMarkdown: string;
  schemaVersion: string;
  generatedAt: string | null;
  source: string;
};

export function parsePersonalContextImport(raw: string): ParsedPersonalImport {
  const text = raw.trim();
  if (!text) throw new Error("Tomt innhold");

  // Fenced ```json ... ``` + optional markdown after
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    const jsonPart = fence[1].trim();
    const after = text.slice(text.indexOf(fence[0]) + fence[0].length).trim();
    return fromJsonString(jsonPart, after, "paste-fenced");
  }

  // Leading JSON object, optional trailing markdown
  if (text.startsWith("{")) {
    const split = splitJsonAndTrailing(text);
    if (split) return fromJsonString(split.json, split.trailing, "paste-json");
  }

  throw new Error(
    "Kunne ikke parse. Lim inn JSON-dossieret (evt. med markdown-digest etterpå).",
  );
}

function fromJsonString(
  jsonStr: string,
  trailingMarkdown: string,
  source: string,
): ParsedPersonalImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error("JSON er ugyldig");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Dossier må være et JSON-objekt");
  }

  const obj = parsed as Record<string, unknown>;

  // Wrapped form: { dossier, raw_markdown }
  if (obj.dossier && typeof obj.dossier === "object" && !Array.isArray(obj.dossier)) {
    const dossier = toJsonObject(obj.dossier as Record<string, unknown>);
    const md =
      (typeof obj.raw_markdown === "string" && obj.raw_markdown) ||
      (typeof obj.rawMarkdown === "string" && obj.rawMarkdown) ||
      trailingMarkdown;
    return {
      dossier,
      rawMarkdown: md.trim(),
      schemaVersion: stringOr(obj.schema_version, stringOr(dossier.schema_version, "1.0")),
      generatedAt: dateOrNull(obj.generated_at) ?? dateOrNull(dossier.generated_at),
      source,
    };
  }

  const mdFromDossier =
    typeof obj.raw_markdown === "string"
      ? obj.raw_markdown
      : typeof obj.digest_markdown === "string"
        ? obj.digest_markdown
        : "";

  return {
    dossier: toJsonObject(obj),
    rawMarkdown: (trailingMarkdown || mdFromDossier).trim(),
    schemaVersion: stringOr(obj.schema_version, "1.0"),
    generatedAt: dateOrNull(obj.generated_at),
    source,
  };
}

function splitJsonAndTrailing(
  text: string,
): { json: string; trailing: string } | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return {
          json: text.slice(0, i + 1),
          trailing: text.slice(i + 1).trim(),
        };
      }
    }
  }
  return null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function dateOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}
