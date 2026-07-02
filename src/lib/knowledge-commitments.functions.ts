// Knowledge v3 — server functions for user_commitments.
// See docs/KNOWLEDGE.v3.md.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  CommitmentStatus,
  UserCommitment,
} from "@/lib/knowledge/commitment.types";
import { todayOsloISO, OSLO_TZ } from "@/lib/knowledge/commitment.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(v: unknown): any {
  return JSON.parse(JSON.stringify(v ?? null));
}

const STATUSES: CommitmentStatus[] = ["suggested", "open", "done", "dismissed"];

// Heuristic: is this AI-detected commitment clearly a first-person promise?
const CLEAR_PROMISE_PATTERNS: RegExp[] = [
  /\bi(?:'|’)?ll\b/i,
  /\bi will\b/i,
  /\bi(?:'|’)?m going to\b/i,
  /\bwill send\b/i,
  /\bwill follow up\b/i,
  /\bjeg sender\b/i,
  /\bjeg ringer\b/i,
  /\bjeg svarer\b/i,
  /\bjeg tar\b/i,
  /\bjeg gjør\b/i,
  /\bskal jeg\b/i,
  /\bskal sende\b/i,
  /\bkommer tilbake\b/i,
];

function hasClearPromise(text: string | null | undefined): boolean {
  if (!text) return false;
  return CLEAR_PROMISE_PATTERNS.some((r) => r.test(text));
}

// ─── Scan: detect & upsert commitments ─────────────────────────────────────

export const detectAndStoreCommitments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { fetchGmailActionsWithMeta } = await import("@/lib/inbox/gmail.server");
    const { fetchSlackActions } = await import("@/lib/inbox/slack.server");
    const { autoLinkMissionSignals } = await import(
      "@/lib/knowledge/auto-link.server"
    );
    const { inboxDescriptors } = await import("@/lib/mission-signals.server");
    const { detectCommitmentsFromSignals } = await import(
      "@/lib/knowledge/commitment-detect.server"
    );

    const [gmailRes, slack, existingRes] = await Promise.all([
      fetchGmailActionsWithMeta().catch(() => ({ actions: [], error: null })),
      fetchSlackActions().catch(() => []),
      supabase
        .from("user_commitments")
        .select("source_ref, status")
        .eq("user_id", userId),
    ]);
    const inbox = [...gmailRes.actions, ...slack];

    // Any prior source_ref should skip re-detection (we only upsert 'suggested').
    const existingRefs = new Set<string>(
      (existingRes.data ?? []).map((r) => r.source_ref as string),
    );

    // Enrich with knowledge entity links (best-effort).
    const entityLinks: Record<string, { entityId: string; entityName: string; entitySlug: string }> =
      await autoLinkMissionSignals(supabase, userId, inboxDescriptors(inbox)).catch(
        () => ({}),
      );

    const todayOslo = todayOsloISO();

    const signals = inbox.map((i) => {
      const link = entityLinks[i.key];
      return {
        source: i.source as "gmail" | "slack",
        sourceRef: i.key,
        snippet: i.snippet ?? null,
        sender: i.sender ?? null,
        occurredAt: i.occurredAt ?? null,
        entityId: link?.entityId ?? null,
        entityName: link?.entityName ?? null,
      };
    });

    const detected = await detectCommitmentsFromSignals({
      signals,
      existingCommitmentRefs: Array.from(existingRefs),
      todayOslo,
    });

    if (detected.length === 0) {
      const { data: pending } = await supabase
        .from("user_commitments")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["suggested", "open"])
        .order("due_date", { ascending: true, nullsFirst: false });
      return normalize({ 
        detected: 0,
        suggested: [],
        open: [],
        commitments: pending ?? [],
      }) as {
        detected: number;
        suggested: UserCommitment[];
        open: UserCommitment[];
        commitments: UserCommitment[];
      };
    }

    // Build rows and split by auto-open vs suggested.
    const suggestedRows: Array<Record<string, unknown>> = [];
    const openRows: Array<Record<string, unknown>> = [];

    for (const d of detected) {
      const autoOpen =
        d.confidence === "high" &&
        (!!d.dueDate || hasClearPromise(d.detectedPhrase ?? d.title));
      const row = {
        user_id: userId,
        entity_id: d.entityId ?? null,
        source: d.sourceRef.startsWith("gmail:") ? "gmail" : "slack",
        source_ref: d.sourceRef,
        title: d.title,
        due_date: d.dueDate,
        status: autoOpen ? "open" : "suggested",
        confidence: d.confidence,
        reason: d.reason || null,
        metadata: {
          detected_phrase: d.detectedPhrase ?? undefined,
          timezone: OSLO_TZ,
        },
      };
      if (autoOpen) openRows.push(row);
      else suggestedRows.push(row);
    }

    // Insert only when source_ref not present (unique constraint).
    // We never touch open/done/dismissed via re-scan because we pre-filtered
    // existing refs above (they were skipped by detectCommitments).
    const inserted: UserCommitment[] = [];
    if (suggestedRows.length > 0 || openRows.length > 0) {
      const allRows = [...openRows, ...suggestedRows];
      const { data, error } = await supabase
        .from("user_commitments")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(allRows as any, {
          onConflict: "user_id,source_ref",
          ignoreDuplicates: true,
        })
        .select("*");
      if (error) {
        console.warn("[commitments] upsert failed", error);
      } else if (data) {
        inserted.push(...(data as unknown as UserCommitment[]));
      }
    }

    const suggested = inserted.filter((c) => c.status === "suggested");
    const open = inserted.filter((c) => c.status === "open");

    const { data: pending } = await supabase
      .from("user_commitments")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["suggested", "open"])
      .order("due_date", { ascending: true, nullsFirst: false });

    return normalize({ 
      detected: inserted.length,
      suggested,
      open,
      commitments: pending ?? [],
    }) as {
      detected: number;
      suggested: UserCommitment[];
      open: UserCommitment[];
      commitments: UserCommitment[];
    };
  });

// Alias for UI clarity.
export const scanCommitments = detectAndStoreCommitments;

// ─── Listing & CRUD ────────────────────────────────────────────────────────

export const listCommitments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { status?: CommitmentStatus[] } | undefined) => input ?? {},
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("user_commitments").select("*").eq("user_id", userId);
    const statuses =
      data.status && data.status.length > 0 ? data.status : STATUSES;
    q = q.in("status", statuses);
    q = q
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    const { data: rows } = await q;
    return normalize(rows ?? []) as UserCommitment[];
  });

export const getCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("user_commitments")
      .select("*")
      .eq("user_id", userId)
      .eq("id", data.id)
      .maybeSingle();
    return normalize(row) as UserCommitment | null;
  });

const editSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  entityId: z.string().uuid().nullable().optional(),
});

async function fetchCommitmentOrThrow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  id: string,
): Promise<UserCommitment> {
  const { data: row } = await supabase
    .from("user_commitments")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (!row) throw new Response("Forpliktelsen finnes ikke", { status: 404 });
  return row as UserCommitment;
}

export const approveCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => editSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const existing = await fetchCommitmentOrThrow(supabase, userId, data.id);
    if (existing.status !== "suggested") {
      throw new Response("Kan bare godta forslag", { status: 400 });
    }
    const patch: Record<string, unknown> = { status: "open" };
    if (data.title !== undefined) patch.title = data.title.slice(0, 300);
    if (data.dueDate !== undefined) patch.due_date = data.dueDate;
    if (data.entityId !== undefined) patch.entity_id = data.entityId;
    const { data: row, error } = await supabase
      .from("user_commitments")
      .update(patch)
      .eq("user_id", userId)
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Response(error.message, { status: 500 });
    return normalize(row) as UserCommitment;
  });

export const updateCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => editSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const existing = await fetchCommitmentOrThrow(supabase, userId, data.id);
    if (existing.status !== "suggested" && existing.status !== "open") {
      throw new Response("Kan bare redigere forslag/åpne", { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title.slice(0, 300);
    if (data.dueDate !== undefined) patch.due_date = data.dueDate;
    if (data.entityId !== undefined) patch.entity_id = data.entityId;
    if (Object.keys(patch).length === 0) return existing;
    const { data: row } = await supabase
      .from("user_commitments")
      .update(patch)
      .eq("user_id", userId)
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    return normalize(row) as UserCommitment;
  });

export const markCommitmentDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("user_commitments")
      .update({ status: "done" })
      .eq("user_id", userId)
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    return normalize(row) as UserCommitment;
  });

export const dismissCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("user_commitments")
      .update({ status: "dismissed" })
      .eq("user_id", userId)
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    return normalize(row) as UserCommitment;
  });

export const linkCommitmentEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        entityId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("user_commitments")
      .update({ entity_id: data.entityId })
      .eq("user_id", userId)
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    return normalize(row) as UserCommitment;
  });

// ─── Mission-side helper: mutate by mission action key `commitment:{id}` ───

export const commitmentMissionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        actionKey: z.string().startsWith("commitment:"),
        action: z.enum(["mark_done", "dismiss", "handled_locally"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const id = data.actionKey.slice("commitment:".length);
    const newStatus =
      data.action === "mark_done"
        ? "done"
        : data.action === "dismiss"
          ? "dismissed"
          : "done";
    await supabase
      .from("user_commitments")
      .update({ status: newStatus })
      .eq("user_id", userId)
      .eq("id", id);
    return { ok: true as const };
  });
