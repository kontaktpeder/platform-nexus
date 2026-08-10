/**
 * Fortell continuous memory: persist threads/messages and absorb soft facts
 * into user_personal_context (no UI confirm for preferences/notes).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";
import {
  getPersonalContext,
  upsertPersonalContext,
} from "@/lib/personal-context.server";
import {
  asDossierObject,
  toJsonObject,
  type JsonObject,
} from "@/lib/personal-context/types";

type DB = SupabaseClient<Database>;

const MEMORY_START = "<!-- fortell-memory -->";
const MEMORY_END = "<!-- /fortell-memory -->";
const MAX_NOTES = 40;
const MAX_PREFS = 24;

const MemoryExtractSchema = z.object({
  shouldUpdate: z.boolean(),
  preferences: z.array(z.string().min(3).max(200)).max(6),
  notes: z.array(z.string().min(3).max(240)).max(6),
  communicationHints: z.array(z.string().min(3).max(200)).max(3),
});

export type FortellStoredMessage = {
  role: "user" | "assistant";
  content: string;
};

function titleFromInstruction(instruction: string): string {
  const t = instruction.replace(/\s+/g, " ").trim();
  if (t.length <= 60) return t;
  return `${t.slice(0, 57).trimEnd()}…`;
}

function uniqCap(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (s.length < 3) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.slice(0, 240));
    if (out.length >= max) break;
  }
  return out;
}

function readMemoryBag(dossier: JsonObject): {
  notes: string[];
  preferences: string[];
  communicationHints: string[];
} {
  const block = asDossierObject(dossier.fortell_memory as Json);
  const notes = Array.isArray(block.notes)
    ? block.notes.filter((x): x is string => typeof x === "string")
    : [];
  const preferences = Array.isArray(block.preferences)
    ? block.preferences.filter((x): x is string => typeof x === "string")
    : [];
  const communicationHints = Array.isArray(block.communication_hints)
    ? block.communication_hints.filter((x): x is string => typeof x === "string")
    : [];
  return { notes, preferences, communicationHints };
}

function renderMemoryMarkdown(mem: {
  notes: string[];
  preferences: string[];
  communicationHints: string[];
}): string {
  const lines: string[] = ["## Fortell-minne (auto)", ""];
  if (mem.preferences.length) {
    lines.push("### Preferanser", ...mem.preferences.map((p) => `- ${p}`), "");
  }
  if (mem.communicationHints.length) {
    lines.push(
      "### Kommunikasjon",
      ...mem.communicationHints.map((p) => `- ${p}`),
      "",
    );
  }
  if (mem.notes.length) {
    lines.push("### Notater", ...mem.notes.map((p) => `- ${p}`), "");
  }
  if (
    !mem.preferences.length &&
    !mem.notes.length &&
    !mem.communicationHints.length
  ) {
    return "";
  }
  return `${MEMORY_START}\n${lines.join("\n").trim()}\n${MEMORY_END}`;
}

function spliceMemoryMarkdown(raw: string, block: string): string {
  const start = raw.indexOf(MEMORY_START);
  const end = raw.indexOf(MEMORY_END);
  if (start >= 0 && end > start) {
    const after = end + MEMORY_END.length;
    const without = `${raw.slice(0, start).trimEnd()}\n\n${raw.slice(after).trimStart()}`.trim();
    return block ? `${without}\n\n${block}`.trim() : without;
  }
  if (!block) return raw.trim();
  return raw.trim() ? `${raw.trim()}\n\n${block}` : block;
}

/** Ensure an active (non-archived) thread exists; return id + recent messages. */
export async function getOrCreateActiveFortellThread(
  client: DB,
  userId: string,
): Promise<{ threadId: string; messages: FortellStoredMessage[] }> {
  const { data: existing, error: findErr } = await client
    .from("fortell_threads")
    .select("id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;

  let threadId = existing?.id ?? null;
  if (!threadId) {
    const { data: created, error: createErr } = await client
      .from("fortell_threads")
      .insert({ user_id: userId })
      .select("id")
      .single();
    if (createErr) throw createErr;
    threadId = created.id;
  }

  const messages = await loadFortellMessages(client, userId, threadId, 32);
  return { threadId, messages };
}

export async function archiveAndStartFortellThread(
  client: DB,
  userId: string,
): Promise<{ threadId: string }> {
  const now = new Date().toISOString();
  await client
    .from("fortell_threads")
    .update({ archived_at: now })
    .eq("user_id", userId)
    .is("archived_at", null);

  const { data: created, error } = await client
    .from("fortell_threads")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return { threadId: created.id };
}

export async function loadFortellMessages(
  client: DB,
  userId: string,
  threadId: string,
  limit = 32,
): Promise<FortellStoredMessage[]> {
  const { data, error } = await client
    .from("fortell_messages")
    .select("role, content")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;

  return (data ?? [])
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content }));
}

/** Resolve thread owned by user; create active if missing/invalid. */
export async function resolveFortellThreadId(
  client: DB,
  userId: string,
  threadId: string | null | undefined,
): Promise<string> {
  if (threadId) {
    const { data } = await client
      .from("fortell_threads")
      .select("id, archived_at")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data && !data.archived_at) return data.id;
  }
  const active = await getOrCreateActiveFortellThread(client, userId);
  return active.threadId;
}

export async function appendFortellTurn(
  client: DB,
  userId: string,
  threadId: string,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = [
    {
      thread_id: threadId,
      user_id: userId,
      role: "user" as const,
      content: userContent.slice(0, 12000),
    },
    {
      thread_id: threadId,
      user_id: userId,
      role: "assistant" as const,
      content: assistantContent.slice(0, 12000),
    },
  ];

  const { error: msgErr } = await client.from("fortell_messages").insert(rows);
  if (msgErr) throw msgErr;

  const { data: thread } = await client
    .from("fortell_threads")
    .select("title")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  const patch: {
    last_message_at: string;
    updated_at: string;
    title?: string;
  } = {
    last_message_at: now,
    updated_at: now,
  };
  if (!thread?.title?.trim()) {
    patch.title = titleFromInstruction(userContent);
  }

  await client
    .from("fortell_threads")
    .update(patch)
    .eq("id", threadId)
    .eq("user_id", userId);
}

/**
 * Extract soft prefs/notes from the latest turn and merge into personal context.
 * Never writes contacts, relations, or Control agreements — those stay confirm-gated.
 */
export async function absorbFortellMemory(
  client: DB,
  userId: string,
  instruction: string,
  answer: string,
  priorHistory: FortellStoredMessage[],
): Promise<void> {
  if (!getGeminiApiKey()) return;

  const recent = [
    ...priorHistory.slice(-6),
    { role: "user" as const, content: instruction },
    { role: "assistant" as const, content: answer },
  ];

  const system = [
    "Du ekstraherer varig personlig minne fra en Fortell-samtale.",
    "Lagre KUN myke ting: preferanser, arbeidsvaner, kommunikasjonsstil, stabile fakta om brukeren selv.",
    "IKKE lagre: e-postadresser, telefon, org.nr, avtaletekst, midlertidige oppgaver, engangshendelser, andres private data.",
    "IKKE lagre ting som krever bekreftelse (kontaktendringer, relasjoner, Control).",
    "Hvis ingenting nytt og varig: shouldUpdate=false og tomme lister.",
    "Skriv korte norske punkter.",
  ].join("\n");

  let extracted: z.infer<typeof MemoryExtractSchema>;
  try {
    const { output } = await generateText({
      model: getGeminiModel("flash"),
      system,
      prompt: JSON.stringify({
        turn: recent.map((m) => ({ role: m.role, content: m.content.slice(0, 1500) })),
      }),
      output: Output.object({ schema: MemoryExtractSchema }),
    });
    extracted = output;
  } catch {
    return;
  }

  if (!extracted.shouldUpdate) return;
  if (
    extracted.preferences.length === 0 &&
    extracted.notes.length === 0 &&
    extracted.communicationHints.length === 0
  ) {
    return;
  }

  const existing = await getPersonalContext(client, userId);
  const dossier = existing?.dossier ? { ...existing.dossier } : {};
  const prev = readMemoryBag(dossier);

  const merged = {
    notes: uniqCap([...extracted.notes, ...prev.notes], MAX_NOTES),
    preferences: uniqCap(
      [...extracted.preferences, ...prev.preferences],
      MAX_PREFS,
    ),
    communicationHints: uniqCap(
      [...extracted.communicationHints, ...prev.communicationHints],
      12,
    ),
  };

  dossier.fortell_memory = toJsonObject({
    notes: merged.notes,
    preferences: merged.preferences,
    communication_hints: merged.communicationHints,
    updated_at: new Date().toISOString().slice(0, 10),
    source: "fortell-auto",
  });

  // Soft-merge into identity.preferences when present
  const identity = asDossierObject(dossier.identity as Json);
  const idPrefs = Array.isArray(identity.preferences)
    ? identity.preferences.filter((x): x is string => typeof x === "string")
    : [];
  if (extracted.preferences.length) {
    identity.preferences = uniqCap(
      [...extracted.preferences, ...idPrefs],
      MAX_PREFS,
    );
    dossier.identity = identity;
  }

  const memoryMd = renderMemoryMarkdown(merged);
  const rawMarkdown = spliceMemoryMarkdown(
    existing?.rawMarkdown ?? "",
    memoryMd,
  );

  await upsertPersonalContext(client, userId, {
    dossier: toJsonObject(dossier),
    rawMarkdown: rawMarkdown.slice(0, 50000),
    source: existing?.source ?? "fortell-auto",
    generatedAt:
      existing?.generatedAt ?? new Date().toISOString().slice(0, 10),
    schemaVersion: existing?.schemaVersion ?? "1.0",
  });
}
