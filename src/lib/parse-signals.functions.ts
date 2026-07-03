// ServerFn wrapper for Relationship Engine parser (Pakke 3).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseNewSignals, type ParseSignalsResult } from "./knowledge/parse-signals.server";

const schema = z
  .object({ limit: z.number().int().min(1).max(50).optional() })
  .default({});

export const parseNewRawSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<ParseSignalsResult> => {
    return parseNewSignals({
      supabase: context.supabase,
      userId: context.userId,
      limit: data.limit,
    });
  });
