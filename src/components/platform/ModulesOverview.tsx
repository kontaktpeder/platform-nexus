import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as Icons from "lucide-react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ConnectionStatusBadge } from "@/components/platform/ConnectionStatusBadge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useResolvedLastWorkspace } from "@/lib/last-workspace.hooks";
import {
  getUserModulesOverview,
  setWorkspaceModuleEnabled,
} from "@/lib/modules-overview.functions";
import type { ModulesOverviewRow } from "@/lib/modules-overview.types";
import { cn } from "@/lib/utils";

const ICON_BY_ID: Record<string, string> = {
  finance: "landmark",
  work: "briefcase",
  control: "shield",
  booking: "calendar",
  content: "file-text",
  gmail: "mail",
  slack: "message-square",
  google_calendar: "calendar-days",
  whatsapp: "message-circle",
  telegram: "send",
  instagram: "camera",
  tiktok: "video",
};

function iconFor(id: string): LucideIcon {
  const name = ICON_BY_ID[id] ?? "package";
  const key = name
    .split("-")
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join("");
  return (Icons as unknown as Record<string, LucideIcon>)[key] ?? Icons.Package;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      <ul className="grid gap-3">{children}</ul>
    </section>
  );
}

function ModuleRow({
  row,
  onToggle,
  toggling,
}: {
  row: ModulesOverviewRow;
  onToggle?: (enabled: boolean) => void;
  toggling?: boolean;
}) {
  const Icon = iconFor(row.id);
  const orgLinks = row.connectedOrgs.slice(0, 8);
  const linkLabel = (o: ModulesOverviewRow["connectedOrgs"][number]) => {
    const ext = o.externalOrgName ? ` → ${o.externalOrgName}` : "";
    const ws = o.workspaceName ? ` · ${o.workspaceName}` : "";
    return `${o.platformOrgName}${ws}${ext}`;
  };
  const statusHint = (s: ModulesOverviewRow["connectedOrgs"][number]["linkStatus"]) => {
    switch (s) {
      case "connected":
        return "Koblet";
      case "partial":
        return "Delvis";
      case "error":
        return "Feil";
      case "pending":
        return "Pågår";
      case "missing":
        return "Mangler";
    }
  };

  return (
    <li className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-base font-semibold">{row.name}</span>
            <ConnectionStatusBadge status={row.status} label={row.statusLabel} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{row.description}</p>
          {row.detail && (
            <p className="mt-1 text-xs font-medium text-foreground/80">{row.detail}</p>
          )}

          {orgLinks.length > 0 && (
            <ul className="mt-2 space-y-1">
              {orgLinks.map((o) => (
                <li key={`${o.platformOrgSlug}:${o.workspaceSlug ?? ""}:${o.linkStatus}`}>
                  <a
                    href={o.configureHref}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-muted/60",
                      o.linkStatus === "connected"
                        ? "text-foreground/80"
                        : "text-amber-950 dark:text-amber-100",
                    )}
                  >
                    <span className="min-w-0 truncate">{linkLabel(o)}</span>
                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-semibold uppercase tracking-wide",
                        o.linkStatus === "connected"
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-amber-800 dark:text-amber-200",
                      )}
                    >
                      {statusHint(o.linkStatus)}
                    </span>
                  </a>
                </li>
              ))}
              {row.connectedOrgs.length > 8 && (
                <li className="px-2 text-xs text-muted-foreground">
                  +{row.connectedOrgs.length - 8} til
                </li>
              )}
            </ul>
          )}

          {row.gaps.length > 0 && (
            <ul className="mt-2 space-y-1">
              {row.gaps.slice(0, 4).map((g) => (
                <li
                  key={g}
                  className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-950 dark:text-amber-100"
                >
                  {g}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {row.canToggle && onToggle && (
            <Switch
              checked={!!row.enabledOnActiveWorkspace}
              disabled={toggling}
              onCheckedChange={onToggle}
              aria-label={`Slå ${row.name} ${row.enabledOnActiveWorkspace ? "av" : "på"}`}
            />
          )}
          {row.configureHref && row.kind !== "planned" && (
            <Button asChild size="sm" variant="ghost" className="h-9 gap-1 px-2 text-xs">
              <a href={row.configureHref}>
                {row.orgCoverage && row.orgCoverage.connected < row.orgCoverage.total
                  ? "Koble mangler"
                  : "Åpne"}
                <ArrowRight className="h-3 w-3" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function ModulesOverview() {
  const qc = useQueryClient();
  const lastWs = useResolvedLastWorkspace();
  const fetchOverview = useServerFn(getUserModulesOverview);
  const setEnabled = useServerFn(setWorkspaceModuleEnabled);

  const overview = useQuery({
    queryKey: [
      "modules-overview",
      lastWs.data?.orgSlug ?? null,
      lastWs.data?.wsSlug ?? null,
    ],
    queryFn: () =>
      fetchOverview({
        data: {
          orgSlug: lastWs.data?.orgSlug ?? null,
          wsSlug: lastWs.data?.wsSlug ?? null,
        },
      }),
    enabled: !lastWs.isLoading,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const toggleMut = useMutation({
    mutationFn: (input: { moduleId: string; enabled: boolean }) => {
      const wsId = overview.data?.activeWorkspace?.workspaceId;
      if (!wsId) throw new Error("Ingen aktiv arbeidsflate");
      return setEnabled({
        data: {
          workspaceId: wsId,
          moduleId: input.moduleId,
          enabled: input.enabled,
        },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["modules-overview"] });
      if (lastWs.data) {
        await qc.invalidateQueries({
          queryKey: ["workspace-context", lastWs.data.orgSlug, lastWs.data.wsSlug],
        });
        await qc.invalidateQueries({
          queryKey: ["connection-hub", lastWs.data.orgSlug],
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (lastWs.isLoading || overview.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (overview.isError) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Kunne ikke hente moduler:{" "}
        {overview.error instanceof Error ? overview.error.message : "Ukjent feil"}
      </div>
    );
  }

  const data = overview.data;
  if (!data) return null;

  const core = data.rows.filter((r) => r.kind === "core_module");
  const integrations = data.rows.filter((r) => r.kind === "integration");
  const planned = data.rows.filter((r) => r.kind === "planned");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-emerald-800 dark:text-emerald-300">
          {data.summary.connected} koblet
        </span>
        {data.summary.partial > 0 && (
          <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-amber-900 dark:text-amber-200">
            {data.summary.partial} delvis
          </span>
        )}
        {data.summary.missing > 0 && (
          <span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-orange-900 dark:text-orange-200">
            {data.summary.missing} mangler / av
          </span>
        )}
        <span className="rounded-lg bg-muted px-2.5 py-1 text-muted-foreground">
          {data.summary.planned} planlagt
        </span>
      </div>

      {data.activeWorkspace ? (
        <p className="text-sm text-muted-foreground">
          Toggle gjelder{" "}
          <span className="font-medium text-foreground">
            {data.activeWorkspace.orgName} · {data.activeWorkspace.wsName}
          </span>
          . Hver organisasjon må kobles til sin egen org i Finance/Work — «Koblet»
          på en core betyr alle dine Nexus-orger er linked.
        </p>
      ) : (
        <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm">
          <p className="text-muted-foreground">
            Velg en organisasjon/arbeidsflate for å slå moduler av/på.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3 rounded-xl">
            <Link to="/app">Velg organisasjon</Link>
          </Button>
        </div>
      )}

      <Section title="Core-moduler">{core.map((row) => (
        <ModuleRow
          key={row.id}
          row={row}
          toggling={toggleMut.isPending}
          onToggle={
            row.canToggle && row.moduleId
              ? (enabled) =>
                  toggleMut.mutate({ moduleId: row.moduleId!, enabled })
              : undefined
          }
        />
      ))}</Section>

      <Section title="Integrasjoner">{integrations.map((row) => (
        <ModuleRow key={row.id} row={row} />
      ))}</Section>

      <Section title="Planlagt">{planned.map((row) => (
        <ModuleRow key={row.id} row={row} />
      ))}</Section>

      {data.activeWorkspace && (
        <p className={cn("text-center text-xs text-muted-foreground")}>
          Detaljert kobling per workspace:{" "}
          <Link
            to="/o/$orgSlug/w/$wsSlug/modules"
            params={{
              orgSlug: data.activeWorkspace.orgSlug,
              wsSlug: data.activeWorkspace.wsSlug,
            }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {data.activeWorkspace.wsName} →
          </Link>
        </p>
      )}
    </div>
  );
}
