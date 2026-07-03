// Relationship Engine v0 — Pakke 3 runner (server-only).
// Reads raw_signals.status='new', parses with AI, upserts entity_suggestions +
// relation_suggestions, and flips status='parsed'. Best-effort per signal.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { parseSignal, type ParsedEntity, type ParsedRelation } from "./signal-parser-ai.server";
import type { Entity } from "./types";

export type ParseSignalsResult = {
  scanned: number;
  parsed: number;
  entitySuggestions: number;
  relationSuggestions: number;
  errors: string[];
};

type RawSignalRow = {
  id: string;
  source: string;
  external_id: string | null;
  external_thread_id: string | null;
  raw_text: string;
  summary: string | null;
  occurred_at: string | null;
  metadata: Record<string, unknown> | null;
};

export async function parseNewSignals(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  limit?: number;
}): Promise<ParseSignalsResult> {
  const supabase = opts.supabase;
  const limit = Math.min(opts.limit ?? 20, 50);
  const result: ParseSignalsResult = {
    scanned: 0,
    parsed: 0,
    entitySuggestions: 0,
    relationSuggestions: 0,
    errors: [],
  };

  const { data: signals, error: signalsError } = await supabase
    .from("raw_signals")
    .select("id, source, external_id, external_thread_id, raw_text, summary, occurred_at, metadata")
    .eq("user_id", opts.userId)
    .eq("status", "new")
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (signalsError) {
    result.errors.push(`load signals: ${signalsError.message}`);
    return result;
  }
  const rows = (signals ?? []) as RawSignalRow[];
  result.scanned = rows.length;
  if (rows.length === 0) return result;

  const { data: entitiesData, error: entErr } = await supabase
    .from("entities")
    .select("*")
    .eq("user_id", opts.userId)
    .order("importance", { ascending: false })
    .limit(200);
  if (entErr) {
    result.errors.push(`load entities: ${entErr.message}`);
    return result;
  }
  const existing = (entitiesData ?? []) as Entity[];
  const byName = new Map<string, Entity>();
  for (const e of existing) byName.set(e.name, e);

  for (const signal of rows) {
    try {
      const parsed = await parseSignal(
        {
          id: signal.id,
          source: signal.source,
          summary: signal.summary,
          raw_text: signal.raw_text,
          occurred_at: signal.occurred_at,
          metadata: signal.metadata ?? {},
        },
        existing,
      );

      // Upsert entity_suggestions and remember suggestion ids per ref.
      const suggIdByRef = new Map<string, string>();
      const existingIdByRef = new Map<string, string>();

      for (const ent of parsed.entities) {
        if (ent.matchesExistingEntityId) {
          existingIdByRef.set(ent.ref, ent.matchesExistingEntityId);
          continue;
        }
        const upsertRow = {
          user_id: opts.userId,
          suggestion_key: ent.suggestionKey,
          proposed_name: ent.proposedName,
          proposed_type: ent.proposedType,
          reason: ent.reason,
          confidence: ent.confidence,
          example_count: 1,
          status: "pending" as const,
          raw_signal_id: signal.id,
          owner_context: ent.ownerContext === "unknown" ? null : ent.ownerContext,
          metadata: {
            ...ent.metadata,
            source_signal: {
              id: signal.id,
              source: signal.source,
              summary: signal.summary,
            },
          },
        };
        const { data: upserted, error: upsertErr } = await supabase
          .from("entity_suggestions")
          .upsert(upsertRow, { onConflict: "user_id,suggestion_key" })
          .select("id")
          .maybeSingle();
        if (upsertErr) {
          result.errors.push(`entity suggestion ${ent.suggestionKey}: ${upsertErr.message}`);
          continue;
        }
        if (upserted?.id) {
          suggIdByRef.set(ent.ref, upserted.id);
          result.entitySuggestions += 1;
        }
      }

      // Resolve relation refs -> concrete entity or suggestion ids.
      const resolveRef = (
        ref: string,
      ): { entityId?: string; suggestionId?: string } | null => {
        if (ref.startsWith("existing:")) {
          const name = ref.slice("existing:".length);
          const ent = byName.get(name);
          if (!ent) return null;
          return { entityId: ent.id };
        }
        if (existingIdByRef.has(ref)) return { entityId: existingIdByRef.get(ref)! };
        if (suggIdByRef.has(ref)) return { suggestionId: suggIdByRef.get(ref)! };
        return null;
      };

      for (const rel of parsed.relations) {
        const from = resolveRef(rel.fromRef);
        const to = resolveRef(rel.toRef);
        if (!from || !to) continue;
        const row = {
          user_id: opts.userId,
          from_entity_id: from.entityId ?? null,
          to_entity_id: to.entityId ?? null,
          from_suggestion_id: from.suggestionId ?? null,
          to_suggestion_id: to.suggestionId ?? null,
          relation_type: rel.kind,
          confidence: rel.confidence,
          status: "pending" as const,
          raw_signal_id: signal.id,
          reasoning: rel.reason,
          metadata: {},
        };
        const { error: relErr } = await supabase.from("relation_suggestions").insert(row);
        if (relErr) {
          result.errors.push(`relation suggestion: ${relErr.message}`);
          continue;
        }
        result.relationSuggestions += 1;
      }

      const { error: statusErr } = await supabase
        .from("raw_signals")
        .update({
          status: "parsed",
          parsed_at: new Date().toISOString(),
          summary: signal.summary ?? parsed.summary || null,
        })
        .eq("id", signal.id)
        .eq("user_id", opts.userId);
      if (statusErr) {
        result.errors.push(`mark parsed ${signal.id}: ${statusErr.message}`);
        continue;
      }
      result.parsed += 1;
    } catch (err) {
      result.errors.push(
        `signal ${signal.id}: ${err instanceof Error ? err.message : "parse failed"}`,
      );
    }
  }

  return result;
}
