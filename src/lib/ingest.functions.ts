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
      ingestGmail({ ...shared, max: data.max, query: data.query }).catch(
        (err): IngestResult => ({
          fetched: 0,
          inserted: 0,
          skipped: 0,
          errors: [err instanceof Error ? err.message : "gmail ingest failed"],
        }),
      ),
      ingestSlack(shared).catch(
        (err): IngestResult => ({
          fetched: 0,
          inserted: 0,
          skipped: 0,
          errors: [err instanceof Error ? err.message : "slack ingest failed"],
        }),
      ),
    ]);
    return { gmail, slack };
  });
