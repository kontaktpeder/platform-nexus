/**
 * Fortell: search Nexus-internal notes (signals, facts, Fortell history,
 * personal memory, and bundled desk docs). Not mail/Slack.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { getPersonalContext } from "@/lib/personal-context.server";
import {
  asDossierObject,
  type JsonObject,
} from "@/lib/personal-context/types";

type DB = SupabaseClient<Database>;

export type InternalNoteHit = {
  source:
    | "signal"
    | "raw_note"
    | "contact_fact"
    | "fortell_chat"
    | "personal"
    | "desk_doc";
  title: string;
  snippet: string;
  entityName: string | null;
  at: string | null;
  score: number;
};

function sanitizeToken(s: string): string {
  return s.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

/** Tokens for matching; keep short time tokens like 16:15. */
export function noteSearchTokens(query: string): string[] {
  const raw = query
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^a-z0-9æøå:.-]+/i)
    .map((t) => t.trim())
    .filter(Boolean);

  const stop = new Set([
    "og",
    "i",
    "på",
    "til",
    "fra",
    "av",
    "den",
    "det",
    "de",
    "en",
    "et",
    "som",
    "skal",
    "når",
    "hva",
    "hvor",
    "om",
    "med",
    "for",
    "ikke",
    "sjekk",
    "notatene",
    "notater",
    "interne",
    "har",
    "gjort",
    "dette",
    "her",
    "finne",
    "finnes",
    "noe",
    "mailer",
    "mail",
    "slack",
  ]);

  const synonyms: Record<string, string[]> = {
    rygge: ["omrigg", "omrigger", "flytter", "flytte"],
    rygging: ["omrigg", "omrigger"],
    anlegget: ["anlegg", "rigg"],
    anlegg: ["anlegget", "rigg"],
    middagsområdet: ["middag", "kveld"],
    middagsomrade: ["middag", "kveld"],
    bryllupet: ["bryllup", "josefine", "vielse"],
    bryllup: ["josefine", "vielse"],
  };

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const t of raw) {
    if (stop.has(t)) continue;
    if (t.length < 2) continue;
    if (t.length < 3 && !/^\d{1,2}:\d{2}$/.test(t)) continue;
    add(t);
    for (const syn of synonyms[t] ?? []) add(syn);
    if (out.length >= 16) break;
  }
  return out.slice(0, 16);
}

function scoreText(text: string, tokens: string[]): number {
  const hay = text.toLowerCase();
  if (!tokens.length) return hay ? 1 : 0;
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += t.length >= 5 ? 3 : 2;
  }
  // Bonus for full-phrase-ish density
  if (tokens.length >= 2 && score >= tokens.length * 2) score += 2;
  return score;
}

function clip(s: string, max = 420): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function pushHit(
  hits: InternalNoteHit[],
  hit: Omit<InternalNoteHit, "score"> & { score?: number },
  tokens: string[],
): void {
  const blob = `${hit.title} ${hit.snippet} ${hit.entityName ?? ""}`;
  const score = hit.score ?? scoreText(blob, tokens);
  if (score <= 0 && tokens.length > 0) return;
  hits.push({ ...hit, score });
}

async function searchDeskDocs(
  tokens: string[],
  query: string,
): Promise<InternalNoteHit[]> {
  const hits: InternalNoteHit[] = [];
  const docsDir = path.join(process.cwd(), "public", "docs");
  let files: string[] = [];
  try {
    files = (await readdir(docsDir)).filter((f) => f.endsWith(".txt"));
  } catch {
    return hits;
  }

  for (const file of files) {
    let text = "";
    try {
      text = await readFile(path.join(docsDir, file), "utf8");
    } catch {
      continue;
    }
    const score = scoreText(`${file} ${text}`, tokens);
    if (score <= 0 && tokens.length) continue;

    // Prefer a matching line (timeline / role) as snippet
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    let bestLine = lines[0] ?? file;
    let bestScore = 0;
    for (const line of lines) {
      const s = scoreText(line, tokens);
      if (s > bestScore) {
        bestScore = s;
        bestLine = line;
      }
    }
    // If query mentions omrigg/hagen, bias toward that line
    const bias = /omrigg|hagen|anlegg|henrik|16:15/i;
    if (bias.test(query)) {
      const biased = lines.find((l) => bias.test(l) && scoreText(l, tokens) > 0);
      if (biased) bestLine = biased;
    }

    const title =
      lines.find((l) => l === l.toUpperCase() && l.length > 8)?.slice(0, 80) ??
      file.replace(/\.txt$/i, "");

    pushHit(
      hits,
      {
        source: "desk_doc",
        title: title.replace(/:$/, ""),
        snippet: clip(bestLine, 500),
        entityName: null,
        at: null,
        score: score + (bestScore > 0 ? 2 : 0),
      },
      tokens,
    );
  }
  return hits;
}

export async function searchInternalNotes(input: {
  supabase: DB;
  userId: string;
  query: string;
  limit?: number;
}): Promise<{ hits: InternalNoteHit[]; tokens: string[] }> {
  const q = input.query.trim().slice(0, 200);
  const tokens = noteSearchTokens(q);
  const limit = input.limit ?? 12;
  const hits: InternalNoteHit[] = [];
  const { supabase, userId } = input;

  const primary = sanitizeToken(tokens[0] ?? q).slice(0, 80);
  const orParts = (tokens.length ? tokens : [q])
    .slice(0, 5)
    .map((t) => sanitizeToken(t))
    .filter((t) => t.length >= 2)
    .map((t) => `snippet.ilike.%${t}%`);

  // 1) Entity signal snippets
  if (orParts.length) {
    const { data: sigs } = await supabase
      .from("entity_signals")
      .select("snippet, source, signal_type, occurred_at, entity_id")
      .eq("user_id", userId)
      .or(orParts.join(","))
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(25);

    const entityIds = [...new Set((sigs ?? []).map((s) => s.entity_id))];
    const nameById = new Map<string, string>();
    if (entityIds.length) {
      const { data: ents } = await supabase
        .from("entities")
        .select("id, name")
        .eq("user_id", userId)
        .in("id", entityIds);
      for (const e of ents ?? []) nameById.set(e.id, e.name);
    }

    for (const s of sigs ?? []) {
      const snippet = (s.snippet ?? "").trim();
      if (!snippet) continue;
      pushHit(
        hits,
        {
          source: "signal",
          title: `${s.source}/${s.signal_type}`,
          snippet: clip(snippet),
          entityName: nameById.get(s.entity_id) ?? null,
          at: s.occurred_at,
        },
        tokens,
      );
    }
  }

  // 2) Raw notes (manual intake + other raw_signals)
  if (primary) {
    const { data: raws } = await supabase
      .from("raw_signals")
      .select("summary, raw_text, source, occurred_at, created_at")
      .eq("user_id", userId)
      .or(
        [
          `raw_text.ilike.%${primary}%`,
          `summary.ilike.%${primary}%`,
          ...tokens.slice(1, 4).map((t) => {
            const st = sanitizeToken(t);
            return `raw_text.ilike.%${st}%`;
          }),
        ].join(","),
      )
      .order("created_at", { ascending: false })
      .limit(20);

    for (const r of raws ?? []) {
      const text = String(r.raw_text || r.summary || "").trim();
      if (!text) continue;
      if (scoreText(text, tokens) <= 0 && tokens.length) continue;
      pushHit(
        hits,
        {
          source: "raw_note",
          title: r.summary?.trim() || `${r.source}-notat`,
          snippet: clip(text),
          entityName: null,
          at: r.occurred_at ?? r.created_at,
        },
        tokens,
      );
    }
  }

  // 3) Contact notes_facts + summary
  {
    const { data: ents } = await supabase
      .from("entities")
      .select("id, name, summary, metadata, type")
      .eq("user_id", userId)
      .in("type", ["person", "company", "project", "goal", "commitment"])
      .limit(200);

    for (const e of ents ?? []) {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      const facts = Array.isArray(meta.notes_facts)
        ? meta.notes_facts.filter((x): x is string => typeof x === "string")
        : [];
      const blobParts = [e.name, e.summary ?? "", ...facts];
      for (const part of blobParts) {
        if (!part || scoreText(part, tokens) <= 0) continue;
        // Prefer fact lines that match over bare name
        const isNameOnly = part === e.name && facts.every((f) => scoreText(f, tokens) <= 0);
        if (isNameOnly && scoreText(e.summary ?? "", tokens) <= 0) continue;
        pushHit(
          hits,
          {
            source: "contact_fact",
            title: e.name,
            snippet: clip(part === e.name ? (e.summary ?? facts[0] ?? part) : part),
            entityName: e.name,
            at: null,
          },
          tokens,
        );
      }
    }
  }

  // 4) Fortell chat history
  if (primary) {
    const { data: msgs } = await supabase
      .from("fortell_messages")
      .select("content, role, created_at")
      .eq("user_id", userId)
      .ilike("content", `%${primary}%`)
      .order("created_at", { ascending: false })
      .limit(15);

    for (const m of msgs ?? []) {
      const content = (m.content ?? "").trim();
      if (!content || scoreText(content, tokens) <= 0) continue;
      pushHit(
        hits,
        {
          source: "fortell_chat",
          title: m.role === "user" ? "Fortell (deg)" : "Fortell (svar)",
          snippet: clip(content),
          entityName: null,
          at: m.created_at,
        },
        tokens,
      );
    }
  }

  // 5) Personal context / Fortell soft memory
  try {
    const ctx = await getPersonalContext(supabase, userId);
    const dossier = (ctx?.dossier ?? {}) as JsonObject;
    const mem = asDossierObject(dossier.fortell_memory as Json);
    const notes = [
      ...(Array.isArray(mem.notes)
        ? mem.notes.filter((x): x is string => typeof x === "string")
        : []),
      ...(Array.isArray(mem.preferences)
        ? mem.preferences.filter((x): x is string => typeof x === "string")
        : []),
      typeof ctx?.rawMarkdown === "string" ? ctx.rawMarkdown : "",
    ];
    for (const n of notes) {
      if (!n || scoreText(n, tokens) <= 0) continue;
      pushHit(
        hits,
        {
          source: "personal",
          title: "Personlig kontekst",
          snippet: clip(n),
          entityName: null,
          at: null,
        },
        tokens,
      );
    }
  } catch {
    // best-effort
  }

  // 6) Bundled desk docs (kjøreplaner etc.)
  hits.push(...(await searchDeskDocs(tokens, q)));

  // Dedupe by snippet prefix + source
  const seen = new Set<string>();
  const ranked = hits
    .sort((a, b) => b.score - a.score)
    .filter((h) => {
      const key = `${h.source}:${h.snippet.slice(0, 80).toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);

  return { hits: ranked, tokens };
}
