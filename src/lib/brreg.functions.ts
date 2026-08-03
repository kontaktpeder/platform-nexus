import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BrregCompanyHit } from "@/lib/brreg.server";

/** Debounced Brreg company search for contact enrichment (Finance-style). */
export const searchBrregCompaniesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        q: z.string().min(2).max(120),
        city: z.string().max(80).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; companies: BrregCompanyHit[] } | { ok: false; message: string }> => {
    try {
      const { searchBrregCompanies } = await import("@/lib/brreg.server");
      const companies = await searchBrregCompanies({
        name: data.q,
        city: data.city ?? null,
        limit: 10,
      });
      return { ok: true, companies };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Brønnøysund er ikke tilgjengelig",
      };
    }
  });
