// Lightweight contact sync: Gmail + Slack → identities → auto entities.
// No AI parse — safe to run when opening Mission.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { IngestResult } from "@/lib/ingest/ingest.server";
import type { AutoPromoteResult } from "@/lib/knowledge/identity/identity.server";

export type ContactSyncResult = {
  skipped: boolean;
  reason?: string;
  gmail: IngestResult;
  slack: IngestResult;
  promoted: number;
  linked: number;
  autoErrors: string[];
  syncedAt: string;
};

const emptyIngest = (): IngestResult => ({
  fetched: 0,
  inserted: 0,
  skipped: 0,
  errors: [],
});

function catchIngest(label: string, err: unknown): IngestResult {
  const message =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : `${label} failed`;
  return { fetched: 0, inserted: 0, skipped: 0, errors: [message] };
}

/** Sync platform signals into contacts. Idempotent; call on Mission open. */
export const syncPlatformContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        /** Cap Gmail fetch (open-path uses a moderate cap). */
        max: z.number().int().min(1).max(1000).optional(),
        force: z.boolean().optional(),
      })
      .optional()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ContactSyncResult> => {
    const { supabase, userId } = context;
    const max = data?.max ?? 400;
    const syncedAt = new Date().toISOString();

    const { ingestGmail, ingestSlack } = await import("@/lib/ingest/ingest.server");

    const [gmail, slack] = await Promise.all([
      ingestGmail({ supabase, userId, max }).catch((err) =>
        catchIngest("gmail", err),
      ),
      ingestSlack({ supabase, userId }).catch((err) => catchIngest("slack", err)),
    ]);

    let promote: AutoPromoteResult = {
      promoted: 0,
      linked: 0,
      skipped: 0,
      errors: [],
    };
    try {
      const { autoPromoteEligibleIdentities } = await import(
        "@/lib/knowledge/identity/identity.server"
      );
      promote = await autoPromoteEligibleIdentities(supabase, userId);
    } catch (err) {
      promote.errors.push(
        err instanceof Error ? err.message : "auto-promote failed",
      );
    }

    return {
      skipped: false,
      gmail: gmail ?? emptyIngest(),
      slack: slack ?? emptyIngest(),
      promoted: promote.promoted,
      linked: promote.linked,
      autoErrors: promote.errors,
      syncedAt,
    };
  });
