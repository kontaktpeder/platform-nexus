// ServerFn wrappers for Relationship Engine ingest pipeline.
// Thin: no logic here beyond auth + delegating to server-only helpers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ingestGmail, ingestSlack, type IngestResult } from "./ingest/ingest.server";

const optsSchema = z
  .object({
    workspaceId: z.string().uuid().nullish(),
    max: z.number().int().min(1).max(100).optional(),
    query: z.string().max(500).optional(),
  })
  .default({});

export const ingestGmailSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => optsSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<IngestResult> => {
    return ingestGmail({
      supabase: context.supabase,
      userId: context.userId,
      workspaceId: data.workspaceId ?? null,
      max: data.max,
      query: data.query,
    });
  });

export const ingestSlackSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => optsSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<IngestResult> => {
    return ingestSlack({
      supabase: context.supabase,
      userId: context.userId,
      workspaceId: data.workspaceId ?? null,
    });
  });

export type IngestRecentResult = {
  gmail: IngestResult;
  slack: IngestResult;
};

/** Human-readable ingest status — shows fetched/new/known + errors (not just inserts). */
export function formatIngestStatus(
  ing: IngestRecentResult,
  extra?: { promoted?: number; linked?: number; parsed?: number; scanned?: number },
): string {
  const g = ing.gmail;
  const s = ing.slack;
  const parts = [
    `Gmail ${g.inserted} nye / ${g.skipped} kjente (hentet ${g.fetched})`,
    `Slack ${s.inserted} nye / ${s.skipped} kjente (hentet ${s.fetched})`,
  ];
  if (extra?.promoted != null || extra?.linked != null) {
    parts.push(
      `Auto-opprettet ${extra.promoted ?? 0} · koblet ${extra.linked ?? 0}`,
    );
  }
  if (extra?.parsed != null && extra?.scanned != null) {
    parts.push(`Parsed ${extra.parsed}/${extra.scanned}`);
  }
  const errors = [...(g.errors ?? []), ...(s.errors ?? [])].filter(Boolean);
  if (errors.length) {
    parts.push(`Feil: ${errors.slice(0, 3).join("; ")}`);
  } else if (g.fetched === 0 && s.fetched === 0) {
    parts.push("Ingen treff fra connector (tom innboks eller API-svar uten meldinger)");
  }
  return parts.join(" · ");
}

function catchIngestError(label: string, err: unknown): IngestResult {
  const message =
    err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? [
          (err as { message: string }).message,
          "code" in err && typeof (err as { code: unknown }).code === "string"
            ? (err as { code: string }).code
            : null,
        ]
          .filter(Boolean)
          .join(" — ")
      : err instanceof Error
        ? err.message
        : `${label} failed`;
  return { fetched: 0, inserted: 0, skipped: 0, errors: [message] };
}

export const ingestRecentSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => optsSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<IngestRecentResult> => {
    const shared = {
      supabase: context.supabase,
      userId: context.userId,
      workspaceId: data.workspaceId ?? null,
    };
    const [gmail, slack] = await Promise.all([
      ingestGmail({ ...shared, max: data.max, query: data.query }).catch((err) =>
        catchIngestError("gmail", err),
      ),
      ingestSlack(shared).catch((err) => catchIngestError("slack", err)),
    ]);
    return { gmail, slack };
  });
