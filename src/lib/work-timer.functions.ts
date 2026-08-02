import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Connected Work org names from Platform — seeds the timer org picker. */
export const listConnectedWorkOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("module_connections")
      .select("external_org_id, external_org_name, status, module_slug")
      .eq("module_slug", "work")
      .eq("status", "connected");
    if (error) throw error;
    const seen = new Set<string>();
    const orgs: Array<{ id: string; name: string }> = [];
    for (const row of data ?? []) {
      const name = (row.external_org_name as string | null)?.trim();
      const id = (row.external_org_id as string | null)?.trim();
      if (!name || !id) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      orgs.push({ id, name });
    }
    return { orgs };
  });

/** Live projects + rates from Work for the connected org. */
export const fetchWorkTimerCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ orgSlug: z.string().min(1).max(80).optional().nullable() })
      .optional()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveWorkConnection, listWorkProjects, listWorkRates } = await import(
      "@/lib/work/work-api.server"
    );

    const ctx = await resolveWorkConnection({
      supabaseAdmin,
      userId,
      orgSlug: data?.orgSlug ?? null,
    });
    if (!ctx) {
      return {
        connected: false as const,
        org: null,
        projects: [] as Array<{ id: string; name: string }>,
        rates: [] as Array<{ id: string; name: string; amount: number }>,
        error: "Ingen koblet Work-organisasjon",
      };
    }

    try {
      const [projects, rates] = await Promise.all([
        listWorkProjects(ctx),
        listWorkRates(ctx),
      ]);
      return {
        connected: true as const,
        org: {
          id: ctx.connection.external_org_id as string,
          name:
            (ctx.connection.external_org_name as string | null) ||
            ctx.orgName ||
            "Work",
        },
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        rates: rates.map((r) => ({
          id: r.id,
          name: r.name,
          amount: Number(r.amount),
        })),
        error: null as string | null,
      };
    } catch (e) {
      return {
        connected: true as const,
        org: {
          id: ctx.connection.external_org_id as string,
          name: (ctx.connection.external_org_name as string | null) || ctx.orgName,
        },
        projects: [],
        rates: [],
        error: e instanceof Error ? e.message : "Kunne ikke hente fra Work",
      };
    }
  });

/** Push one pending Nexus timer entry into Work. */
export const syncTimeEntryToWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().min(1).max(80),
        projectId: z.string().uuid(),
        rateId: z.string().uuid().nullable().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start_time: z.string(),
        end_time: z.string(),
        break_minutes: z.number().int().min(0).max(24 * 60),
        comment: z.string().max(2000).nullable().optional(),
        orgSlug: z.string().min(1).max(80).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveWorkConnection, createWorkTimeEntry } = await import(
      "@/lib/work/work-api.server"
    );
    const ctx = await resolveWorkConnection({
      supabaseAdmin,
      userId,
      orgSlug: data.orgSlug ?? null,
    });
    if (!ctx) throw new Error("Ingen koblet Work-organisasjon");

    const result = await createWorkTimeEntry(ctx, {
      project_id: data.projectId,
      rate_id: data.rateId ?? null,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      break_minutes: data.break_minutes,
      comment: data.comment ?? null,
      source: "timer",
      source_ref: data.id,
    });
    return {
      ok: true as const,
      workEntryId: result.id,
      total_minutes: result.total_minutes,
      duplicate: !!result.duplicate,
    };
  });
