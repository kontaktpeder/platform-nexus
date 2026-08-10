/**
 * Daily alignment server fns — get / upsert / list.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getDailyAlignment,
  listDailyAlignments,
  upsertDailyAlignment,
} from "@/lib/daily-alignment.server";
import type { DailyAlignment } from "@/lib/daily-alignment.types";
import { osloDayKey } from "@/lib/oslo-week";

const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ugyldig day_key");

const patchSchema = z.object({
  identityEnergy: z.string().max(4000).optional(),
  northStar: z.string().max(500).optional(),
  serviceFocus: z.string().max(4000).optional(),
  winToday: z.string().max(4000).optional(),
  tomorrowPriorities: z.string().max(2000).optional(),
});

export const getDailyAlignmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dayKey: dayKeySchema.optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<DailyAlignment> => {
    return getDailyAlignment(
      context.supabase,
      context.userId,
      data.dayKey ?? osloDayKey(),
    );
  });

export const upsertDailyAlignmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dayKey: dayKeySchema,
        patch: patchSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<DailyAlignment> => {
    return upsertDailyAlignment(
      context.supabase,
      context.userId,
      data.dayKey,
      data.patch,
    );
  });

export const listDailyAlignmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        before: dayKeySchema.optional(),
        limit: z.number().int().min(1).max(90).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<DailyAlignment[]> => {
    return listDailyAlignments(context.supabase, context.userId, {
      before: data.before,
      limit: data.limit,
    });
  });
