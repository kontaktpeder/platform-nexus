/**
 * User-wide modules / signal sources overview for /modules.
 * Aggregates Core modules + Gmail/Slack + planned channels.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HUB_STATUS_LABELS, type HubStatus } from "@/lib/connection-hub.types";
import { isConnectableModule } from "@/lib/module-connections";
import type {
  ModulesOverviewOrgLink,
  ModulesOverviewResponse,
  ModulesOverviewRow,
} from "@/lib/modules-overview.types";

const PLANNED: Array<{
  id: string;
  name: string;
  description: string;
}> = [
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Hendelser i dag / snart som kø-signaler.",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Meldinger og folk — først via manuelt signal, senere API der mulig.",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Chat og grupper som kan bli signaler.",
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "DM og innhold — begrenset API.",
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Innhold og publisering som prosjektsignal.",
  },
];

function statusOf(s: HubStatus): { status: HubStatus; statusLabel: string } {
  return { status: s, statusLabel: HUB_STATUS_LABELS[s] };
}

export const getUserModulesOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orgSlug: z.string().min(1).nullable().optional(),
        wsSlug: z.string().min(1).nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ModulesOverviewResponse> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: memberships } = await supabase
      .from("memberships")
      .select("org_id, role")
      .eq("user_id", userId);
    const orgIds = (memberships ?? []).map((m) => m.org_id as string);
    const roleByOrg = new Map(
      (memberships ?? []).map((m) => [m.org_id as string, m.role as string]),
    );

    const { data: orgs } = orgIds.length
      ? await supabase.from("organizations").select("id, name, slug").in("id", orgIds)
      : { data: [] as Array<{ id: string; name: string; slug: string }> };
    const orgById = new Map(
      (orgs ?? []).map((o) => [o.id as string, o as { id: string; name: string; slug: string }]),
    );

    const { data: workspaces } = orgIds.length
      ? await supabase
          .from("workspaces")
          .select("id, name, slug, org_id")
          .in("org_id", orgIds)
      : { data: [] as Array<{ id: string; name: string; slug: string; org_id: string }> };
    const wsById = new Map(
      (workspaces ?? []).map((w) => [
        w.id as string,
        w as { id: string; name: string; slug: string; org_id: string },
      ]),
    );

    let activeWorkspace: ModulesOverviewResponse["activeWorkspace"] = null;
    if (data.orgSlug && data.wsSlug) {
      const org = [...orgById.values()].find((o) => o.slug === data.orgSlug);
      const ws = (workspaces ?? []).find(
        (w) => w.org_id === org?.id && w.slug === data.wsSlug,
      );
      if (org && ws) {
        const role = roleByOrg.get(org.id) ?? "member";
        activeWorkspace = {
          orgSlug: org.slug,
          orgName: org.name,
          wsSlug: ws.slug,
          wsName: ws.name,
          workspaceId: ws.id,
          canEdit: role === "owner" || role === "admin",
        };
      }
    }

    const { data: modules } = await supabase
      .from("modules")
      .select("id, slug, name, description, status, sort_order")
      .order("sort_order");

    const { data: enabledRows } = (workspaces ?? []).length
      ? await supabase
          .from("workspace_modules")
          .select("workspace_id, module_id, enabled")
          .in(
            "workspace_id",
            (workspaces ?? []).map((w) => w.id),
          )
      : { data: [] as Array<{ workspace_id: string; module_id: string; enabled: boolean }> };

    const enabledSet = new Set(
      (enabledRows ?? [])
        .filter((e) => e.enabled)
        .map((e) => `${e.workspace_id}:${e.module_id}`),
    );

    const { data: connections } = orgIds.length
      ? await supabase
          .from("module_connections")
          .select(
            "id, org_id, workspace_id, module_id, module_slug, external_org_id, external_org_name, external_base_url, status, error_message, last_verified_at",
          )
          .in("org_id", orgIds)
      : { data: [] };

    const connRows = (connections ?? []) as Array<{
      id: string;
      org_id: string;
      workspace_id: string;
      module_id: string;
      module_slug: string | null;
      external_org_id: string;
      external_org_name: string | null;
      external_base_url: string;
      status: string;
      error_message: string | null;
      last_verified_at: string | null;
    }>;

    const invoicesCapable = new Map<string, boolean>();
    const financeConns = connRows.filter(
      (c) => c.module_slug === "finance" && c.status === "connected",
    );
    if (financeConns.length > 0) {
      const { financeInvoicesCapable } = await import("@/lib/module-connection-secrets.server");
      await Promise.all(
        financeConns.map(async (conn) => {
          const ok = await financeInvoicesCapable(supabaseAdmin, {
            id: conn.id,
            external_base_url: conn.external_base_url,
            module_slug: conn.module_slug,
            status: conn.status,
          });
          invoicesCapable.set(conn.id, ok);
        }),
      );
    }

    const { count: slackRuleCount } = orgIds.length
      ? await supabase
          .from("slack_channel_ingest_rules")
          .select("id", { count: "exact", head: true })
          .in("organization_id", orgIds)
          .eq("enabled", true)
      : { count: 0 };

    const rows: ModulesOverviewRow[] = [];
    const configureFallback = activeWorkspace
      ? `/o/${activeWorkspace.orgSlug}/w/${activeWorkspace.wsSlug}/modules`
      : "/app";

    for (const mod of modules ?? []) {
      const slug = mod.slug as string;
      const moduleId = mod.id as string;
      const connectable = isConnectableModule(mod.status as string);
      const comingSoon = mod.status === "coming_soon";

      const links: ModulesOverviewOrgLink[] = [];
      let anyEnabled = false;
      let anyConnected = false;
      let anyError = false;
      let anyPartial = false;
      const gaps: string[] = [];

      for (const c of connRows.filter((x) => x.module_id === moduleId || x.module_slug === slug)) {
        const org = orgById.get(c.org_id);
        const ws = wsById.get(c.workspace_id);
        if (!org) continue;
        const enabled = enabledSet.has(`${c.workspace_id}:${moduleId}`);
        if (enabled) anyEnabled = true;

        if (c.status === "connected") {
          anyConnected = true;
          if (slug === "finance" && invoicesCapable.get(c.id) === false) {
            anyPartial = true;
            gaps.push(`${org.name}: mangler invoices:read`);
          }
        } else if (c.status === "error") {
          anyError = true;
          gaps.push(
            `${org.name}: ${c.error_message?.trim() || "verifisering feilet"}`,
          );
        }

        if (c.status === "connected" || c.status === "error" || c.status === "pending") {
          links.push({
            platformOrgName: org.name,
            platformOrgSlug: org.slug,
            workspaceName: ws?.name ?? null,
            workspaceSlug: ws?.slug ?? null,
            externalOrgName: c.external_org_name,
            configureHref: ws
              ? `/o/${org.slug}/w/${ws.slug}/modules`
              : `/o/${org.slug}/connections`,
          });
        }
      }

      // Also surface orgs where module is enabled but not connected
      for (const ws of workspaces ?? []) {
        if (!enabledSet.has(`${ws.id}:${moduleId}`)) continue;
        anyEnabled = true;
        const hasConn = connRows.some(
          (c) => c.workspace_id === ws.id && c.module_id === moduleId,
        );
        if (!hasConn && connectable) {
          const org = orgById.get(ws.org_id);
          if (!org) continue;
          const already = links.some(
            (l) => l.platformOrgSlug === org.slug && l.workspaceSlug === ws.slug,
          );
          if (!already) {
            links.push({
              platformOrgName: org.name,
              platformOrgSlug: org.slug,
              workspaceName: ws.name,
              workspaceSlug: ws.slug,
              externalOrgName: null,
              configureHref: `/o/${org.slug}/w/${ws.slug}/modules`,
            });
            gaps.push(`${org.name} · ${ws.name}: mangler kobling`);
          }
        }
      }

      let status: HubStatus;
      if (comingSoon) status = "unavailable";
      else if (anyError && !anyConnected) status = "error";
      else if (anyPartial) status = "partial";
      else if (anyConnected) status = "connected";
      else if (anyEnabled) status = "not_configured";
      else if (connectable) status = "disabled";
      else status = "unavailable";

      if (comingSoon) {
        gaps.push("Kommer senere — ikke klar for kobling.");
      } else if (!anyEnabled && connectable) {
        gaps.push("Slå på for en arbeidsflate for å koble.");
      } else if (anyEnabled && !anyConnected && connectable) {
        gaps.push("Trenger organisasjons-ID, URL og API-nøkkel.");
      }

      const enabledOnActive =
        activeWorkspace && connectable && !comingSoon
          ? enabledSet.has(`${activeWorkspace.workspaceId}:${moduleId}`)
          : null;

      const { status: st, statusLabel } = statusOf(status);
      rows.push({
        id: slug,
        name: mod.name as string,
        description: (mod.description as string | null) ?? "",
        kind: "core_module",
        moduleId,
        moduleSlug: slug,
        status: st,
        statusLabel,
        detail:
          links
            .filter((l) => l.externalOrgName)
            .map((l) => l.externalOrgName)
            .slice(0, 3)
            .join(" · ") || null,
        gaps: [...new Set(gaps)].slice(0, 4),
        enabledOnActiveWorkspace: enabledOnActive,
        canToggle: !!(
          activeWorkspace?.canEdit &&
          connectable &&
          !comingSoon &&
          enabledOnActive !== null
        ),
        connectedOrgs: links,
        configureHref: links[0]?.configureHref ?? configureFallback,
      });
    }

    // Gmail (deployment)
    {
      const ok = !!process.env.GOOGLE_MAIL_API_KEY && !!process.env.LOVABLE_API_KEY;
      const { status, statusLabel } = statusOf(ok ? "connected" : "unavailable");
      rows.push({
        id: "gmail",
        name: "Gmail",
        description: "E-post for Mission, purringer og Desk.",
        kind: "integration",
        moduleId: null,
        moduleSlug: null,
        status,
        statusLabel,
        detail: ok
          ? "Koblet via Lovable Cloud (alle organisasjoner)."
          : null,
        gaps: ok ? [] : ["GOOGLE_MAIL_API_KEY mangler i miljøet."],
        enabledOnActiveWorkspace: null,
        canToggle: false,
        connectedOrgs: [],
        configureHref: activeWorkspace
          ? `/o/${activeWorkspace.orgSlug}/connections`
          : "/app",
      });
    }

    // Slack (deployment + channel rules)
    {
      const envOk = !!process.env.SLACK_API_KEY && !!process.env.LOVABLE_API_KEY;
      let status: HubStatus = "unavailable";
      const gaps: string[] = [];
      if (!envOk) {
        gaps.push("SLACK_API_KEY mangler i miljøet.");
      } else if ((slackRuleCount ?? 0) === 0) {
        status = "partial";
        gaps.push("Ingen Slack-kanaler whitelistet ennå.");
      } else {
        status = "connected";
      }
      const { status: st, statusLabel } = statusOf(status);
      rows.push({
        id: "slack",
        name: "Slack",
        description: "Kanaler og mentions for Mission.",
        kind: "integration",
        moduleId: null,
        moduleSlug: null,
        status: st,
        statusLabel,
        detail:
          envOk && (slackRuleCount ?? 0) > 0
            ? `${slackRuleCount} kanalregel${slackRuleCount === 1 ? "" : "er"} aktiv`
            : null,
        gaps,
        enabledOnActiveWorkspace: null,
        canToggle: false,
        connectedOrgs: [],
        configureHref: activeWorkspace
          ? `/o/${activeWorkspace.orgSlug}/slack-channels`
          : "/app",
      });
    }

    for (const p of PLANNED) {
      rows.push({
        id: p.id,
        name: p.name,
        description: p.description,
        kind: "planned",
        moduleId: null,
        moduleSlug: null,
        status: "disabled",
        statusLabel: "Ikke tilgjengelig",
        detail: null,
        gaps: ["Planlagt signal-kilde — ikke koblet ennå."],
        enabledOnActiveWorkspace: null,
        canToggle: false,
        connectedOrgs: [],
        configureHref: null,
      });
    }

    const summary = {
      connected: rows.filter((r) => r.status === "connected").length,
      partial: rows.filter((r) => r.status === "partial").length,
      missing: rows.filter(
        (r) =>
          r.kind !== "planned" &&
          (r.status === "not_configured" ||
            r.status === "error" ||
            r.status === "disabled"),
      ).length,
      planned: rows.filter((r) => r.kind === "planned").length,
    };

    return { activeWorkspace, summary, rows };
  });

export const setWorkspaceModuleEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        moduleId: z.string().uuid(),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;

    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, org_id")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (wsErr) throw wsErr;
    if (!ws) throw new Error("Arbeidsflate ikke funnet");

    const { data: mem } = await supabase
      .from("memberships")
      .select("role")
      .eq("org_id", ws.org_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!mem || (mem.role !== "owner" && mem.role !== "admin")) {
      throw new Error("Kun eier/admin kan slå av/på moduler");
    }

    const { error } = await supabase.from("workspace_modules").upsert(
      {
        workspace_id: data.workspaceId,
        module_id: data.moduleId,
        enabled: data.enabled,
      },
      { onConflict: "workspace_id,module_id" },
    );
    if (error) throw error;
    return { ok: true };
  });
