// Context Scan v0 — server functions.
// See docs/CONTEXT_SCAN.v0.md.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ContextScopeType, ContextSummary } from "@/lib/context/context.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null));
}

function toClientRow(row: Record<string, unknown>): ContextSummary {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    entity_id: (row.entity_id as string) ?? null,
    scope_type: row.scope_type as ContextScopeType,
    scope_ref: (row.scope_ref as string) ?? null,
    summary: (row.summary as string) ?? "",
    key_facts: Array.isArray(row.key_facts) ? (row.key_facts as string[]) : [],
    open_questions: Array.isArray(row.open_questions)
      ? (row.open_questions as string[])
      : [],
    suggested_next_focus: (row.suggested_next_focus as string) ?? null,
    source_counts: (row.source_counts as ContextSummary["source_counts"]) ?? {},
    last_scanned_at: row.last_scanned_at as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export const runContextScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { buildContextBundles } = await import("@/lib/context/context-gather.server");
    const { synthesizeContextSummary } = await import(
      "@/lib/context/context-scan-ai.server"
    );

    const bundles = await buildContextBundles(supabase, userId);
    const summaries: ContextSummary[] = [];

    for (const b of bundles) {
      const synth = await synthesizeContextSummary(b);
      const row = {
        user_id: userId,
        entity_id: synth.entity_id,
        scope_type: synth.scope_type,
        scope_ref: synth.scope_ref,
        summary: synth.summary,
        key_facts: synth.key_facts,
        open_questions: synth.open_questions,
        suggested_next_focus: synth.suggested_next_focus,
        source_counts: synth.source_counts,
        last_scanned_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("context_summaries")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(row as any, {
          onConflict: "user_id,scope_type,scope_ref,entity_id",
        })
        .select("*")
        .maybeSingle();
      if (error) {
        console.warn("[context-scan] upsert failed", error);
        continue;
      }
      if (data) summaries.push(toClientRow(data as Record<string, unknown>));
    }

    return normalize({ scanned: summaries.length, summaries });
  });

export const listContextSummaries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scopeType: z
          .enum(["global", "entity", "project", "workspace"])
          .optional(),
        entityId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("context_summaries").select("*").eq("user_id", userId);
    if (data.scopeType) q = q.eq("scope_type", data.scopeType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    q = q.order("last_scanned_at", { ascending: false }).limit(data.limit ?? 100);
    const { data: rows } = await q;
    return normalize((rows ?? []).map((r) => toClientRow(r as Record<string, unknown>)));
  });

export const getLatestGlobalSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("context_summaries")
      .select("*")
      .eq("user_id", userId)
      .eq("scope_type", "global")
      .order("last_scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return normalize(data ? toClientRow(data as Record<string, unknown>) : null);
  });

export const getContextForEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid().optional(),
        slug: z.string().min(1).optional(),
      })
      .refine((v) => v.entityId || v.slug, { message: "entityId or slug required" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("context_summaries")
      .select("*")
      .eq("user_id", userId)
      .in("scope_type", ["entity", "project"]);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    else if (data.slug) q = q.eq("scope_ref", data.slug);
    const { data: row } = await q
      .order("last_scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return normalize(row ? toClientRow(row as Record<string, unknown>) : null);
  });
