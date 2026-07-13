import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWs } from "./o.$orgSlug.w.$wsSlug";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ModuleConnectionPanel } from "@/components/platform/ModuleConnectionPanel";
import { isConnectableModule } from "@/lib/module-connections";
import { parseModuleConfig } from "@/lib/module-registry";
import { ConnectionHubSummaryBar } from "@/components/platform/ConnectionHubPanel";
import { getOrgConnectionHub } from "@/lib/connection-hub.functions";
import { PLATFORM_META } from "@/lib/connection-hub.types";
import { ConnectionStatusBadge } from "@/components/platform/ConnectionStatusBadge";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/w/$wsSlug/modules")({
  component: ModulesPage,
});

function iconFor(name?: string | null): LucideIcon {
  if (!name) return Icons.Package;
  const key = name
    .split("-")
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join("");
  return (Icons as unknown as Record<string, LucideIcon>)[key] ?? Icons.Package;
}

function ModulesPage() {
  const { orgSlug, wsSlug } = Route.useParams();
  const { org, ws, modules, role } = useWs();
  const qc = useQueryClient();
  const canEdit = role === "owner" || role === "admin";
  const fetchHub = useServerFn(getOrgConnectionHub);
  const hubQuery = useQuery({
    queryKey: ["connection-hub", orgSlug],
    queryFn: () => fetchHub({ data: { orgSlug } }),
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async ({ moduleId, enabled }: { moduleId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("workspace_modules")
        .upsert(
          { workspace_id: ws.id, module_id: moduleId, enabled },
          { onConflict: "workspace_id,module_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspace-context", orgSlug, wsSlug] });
      void qc.invalidateQueries({ queryKey: ["connection-hub", orgSlug] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wsHub = hubQuery.data?.workspaces.find((w) => w.slug === wsSlug);
  const deployment = hubQuery.data?.deployment ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Moduler</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plattformer og integrasjoner — hva som er koblet for {ws.name}.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/o/$orgSlug/connections" params={{ orgSlug }}>
            Alle koblinger →
          </Link>
        </Button>
      </div>

      {hubQuery.data && (
        <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-4">
          <ConnectionHubSummaryBar hub={hubQuery.data} />
        </div>
      )}

      <section className="mt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Integrasjoner
        </h2>
        <ul className="mt-3 grid gap-2">
          {deployment.map((item) => {
            const meta = PLATFORM_META[item.platform];
            const Icon = iconFor(meta.icon);
            return (
              <li key={item.platform} className="surface-card flex items-center gap-3 p-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{meta.name}</span>
                    <ConnectionStatusBadge status={item.status} label={item.statusLabel} />
                  </div>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
                {item.configureHref && (
                  <Button asChild size="sm" variant="ghost" className="text-xs">
                    <a href={item.configureHref}>Konfigurer</a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Plattformer · {ws.name}
        </h2>
        <ul className="mt-3 grid gap-3">
          {modules.map((m) => {
            const Icon = iconFor(m.icon);
            const hubItem = wsHub?.items.find((i) => i.platform === m.slug);
            return (
              <li key={m.id} className="surface-card p-4">
                <div className="flex items-center gap-4">
                  <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-heading text-base font-semibold">{m.name}</div>
                      {m.status === "beta" && <Badge variant="secondary">Beta</Badge>}
                      {m.status === "coming_soon" && <Badge variant="outline">Kommer</Badge>}
                      {hubItem && (
                        <ConnectionStatusBadge
                          status={hubItem.status}
                          label={hubItem.statusLabel}
                        />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.description}</div>
                    {hubItem?.externalOrgName && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        → {hubItem.externalOrgName}
                      </div>
                    )}
                  </div>
                  <Switch
                    checked={m.enabled}
                    disabled={!canEdit || m.status === "coming_soon" || toggle.isPending}
                    onCheckedChange={(v) => toggle.mutate({ moduleId: m.id, enabled: v })}
                  />
                </div>

                {m.enabled && isConnectableModule(m.status) && (
                  <ModuleConnectionPanel
                    orgId={org.id}
                    workspaceId={ws.id}
                    moduleId={m.id}
                    moduleSlug={m.slug}
                    moduleName={m.name}
                    enabled={m.enabled}
                    connection={m.connection}
                    canEdit={canEdit}
                    orgSlug={orgSlug}
                    wsSlug={wsSlug}
                    moduleDefaultUrl={m.default_url}
                    moduleKeyPrefix={parseModuleConfig(m.config).key_prefix ?? null}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
