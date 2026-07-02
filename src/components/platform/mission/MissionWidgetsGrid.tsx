import { WidgetSlot } from "@/components/platform/WidgetSlot";
import { getModuleConnection, type WorkspaceModule } from "@/lib/workspaceContext";
import { resolveModuleOpenUrl } from "@/lib/module-connections";
import {
  parseModuleInfoSnapshot,
  resolveWidgetHref,
  widgetsForModule,
} from "@/lib/module-registry";
import type { WidgetDataMap } from "@/lib/widget-data.functions";

export function MissionWidgetsGrid({
  modules,
  widgetData,
  isLoading,
  error,
}: {
  modules: WorkspaceModule[];
  widgetData: WidgetDataMap | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  const activeModules = modules.filter((m) => m.enabled);

  return (
    <section>
      <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Overview
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {activeModules.flatMap((m) => {
          const conn = getModuleConnection(modules, m.slug);
          const connected = conn?.status === "connected";
          const snapshot = parseModuleInfoSnapshot(conn?.module_info_snapshot);
          const home = conn ? resolveModuleOpenUrl(conn) : null;

          return widgetsForModule({
            moduleName: m.name,
            moduleSlug: m.slug,
            snapshot,
          }).map((w) => {
            const datum =
              connected && !w.placeholder ? widgetData?.[`${m.slug}:${w.id}`] : undefined;
            return (
              <WidgetSlot
                key={`${m.id}-${w.id}`}
                moduleName={m.name}
                title={w.title}
                hint={w.description}
                connected={connected}
                display={datum?.display}
                loading={connected && !w.placeholder && isLoading && !datum}
                error={datum?.error ?? (error ? String(error) : undefined)}
                href={
                  connected && conn
                    ? resolveWidgetHref({
                        snapshot,
                        connectionHomeUrl: home,
                        widgetDeepLinkKey: w.deep_link,
                        externalOrgId: conn.external_org_id,
                        baseUrl: conn.external_base_url,
                      })
                    : null
                }
              />
            );
          });
        })}
      </div>
    </section>
  );
}
