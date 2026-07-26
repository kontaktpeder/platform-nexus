import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { osloWeekKey } from "@/lib/oslo-week";
import { getWeeklyPlan, saveWeeklyPlan } from "@/lib/weekly-plan.server";
import {
  normalizeWeeklyPlanPayload,
  type WeeklyPlan,
  type WeeklyPlanPayload,
} from "@/lib/weekly-plan.types";

const nowItemSchema = z.object({
  text: z.string().max(500),
  biggest: z.boolean(),
});

const waitingItemSchema = z.object({
  what: z.string().max(500),
  owner: z.string().max(120),
  nextDate: z.string().max(40),
});

const learningItemSchema = z.object({
  did: z.string().max(800),
  worked: z.string().max(800),
});

const payloadSchema = z.object({
  now: z.array(nowItemSchema).max(3),
  waiting: z.array(waitingItemSchema).max(20),
  rain: z.array(z.string().max(400)).max(20),
  ideas: z.array(z.string().max(400)).max(30),
  learning: z.array(learningItemSchema).max(20),
});

export const getCurrentWeeklyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WeeklyPlan> => {
    return getWeeklyPlan(context.supabase, context.userId, osloWeekKey());
  });

export const saveCurrentWeeklyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        weekKey: z.string().min(4).max(16),
        payload: payloadSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<WeeklyPlan> => {
    const payload = normalizeWeeklyPlanPayload(
      data.payload as WeeklyPlanPayload,
    );
    return saveWeeklyPlan(context.supabase, {
      userId: context.userId,
      weekKey: data.weekKey,
      payload,
    });
  });
