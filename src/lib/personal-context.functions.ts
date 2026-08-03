/**
 * Personal dossier — curated "who I am" context for Nexus agents.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getPersonalContext,
  upsertPersonalContext,
} from "@/lib/personal-context.server";
import { parsePersonalContextImport } from "@/lib/personal-context/parse";
import { SEED_DIGEST, SEED_DOSSIER, SEED_SOURCE } from "@/lib/personal-context/seed";
import {
  toJsonObject,
  type PersonalContextRecord,
} from "@/lib/personal-context/types";

export type { PersonalContextRecord };

export const getPersonalContextFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersonalContextRecord | null> => {
    return getPersonalContext(context.supabase, context.userId);
  });

export const upsertPersonalContextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dossier: z.record(z.string(), z.any()),
        rawMarkdown: z.string().max(50000),
        source: z.string().max(200).nullable().optional(),
        generatedAt: z.string().nullable().optional(),
        schemaVersion: z.string().max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PersonalContextRecord> => {
    return upsertPersonalContext(context.supabase, context.userId, {
      dossier: toJsonObject(data.dossier as Record<string, unknown>),
      rawMarkdown: data.rawMarkdown,
      source: data.source,
      generatedAt: data.generatedAt ?? null,
      schemaVersion: data.schemaVersion,
    });
  });

export const importPersonalContextPasteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        paste: z.string().min(1).max(200_000),
        source: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PersonalContextRecord> => {
    const parsed = parsePersonalContextImport(data.paste);
    return upsertPersonalContext(context.supabase, context.userId, {
      dossier: parsed.dossier,
      rawMarkdown: parsed.rawMarkdown,
      source: data.source?.trim() || parsed.source,
      generatedAt: parsed.generatedAt,
      schemaVersion: parsed.schemaVersion,
    });
  });

/** One-click import of the built-in ChatGPT dossier seed. */
export const importSeedPersonalContextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersonalContextRecord> => {
    const generatedAt =
      typeof SEED_DOSSIER.generated_at === "string"
        ? SEED_DOSSIER.generated_at
        : "2026-08-03";
    const schemaVersion =
      typeof SEED_DOSSIER.schema_version === "string"
        ? SEED_DOSSIER.schema_version
        : "1.0";

    return upsertPersonalContext(context.supabase, context.userId, {
      dossier: toJsonObject(SEED_DOSSIER),
      rawMarkdown: SEED_DIGEST,
      source: SEED_SOURCE,
      generatedAt,
      schemaVersion,
    });
  });

export const clearPersonalContextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("user_personal_context")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
