import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Blocks } from "lucide-react";
import { useWs } from "./o.$orgSlug.w.$wsSlug";
import { WidgetSlot } from "@/components/platform/WidgetSlot";
import { getModuleConnection } from "@/lib/workspaceContext";
import { resolveModuleOpenUrl } from "@/lib/module-connections";
import {
  parseModuleInfoSnapshot,
  resolveWidgetHref,
  widgetsForModule,
} from "@/lib/module-registry";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/w/$wsSlug/")({
  component: Dashboard,
});

function Dashboard() {
  const { orgSlug, wsSlug } = Route.useParams();
  const { ws, modules } = useWs();
  const activeModules = modules.filter((m) => m.enabled);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <section className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Hei igjen 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arbeidsflaten <span className="font-medium text-foreground">{ws.name}</span> —{" "}
          {activeModules.length} aktive modul{activeModules.length === 1 ? "" : "er"}.
        </p>
      </section>

      {activeModules.length === 0 ? (
        <div className="surface-card p-8 text-center">
          <Blocks className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="font-heading text-lg font-semibold">Ingen moduler aktivert</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Slå på det arbeidsflaten trenger for å se widgets her.
          </p>
          <Link to="/o/$orgSlug/w/$wsSlug/modules" params={{ orgSlug, wsSlug }}>
            <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Åpne modulvelger <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
        </div>
      ) : (
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
            }).map((w) => (
              <WidgetSlot
                key={`${m.id}-${w.id}`}
                moduleName={m.name}
                title={w.title}
                hint={w.description}
                connected={connected}
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
            ));
          })}
        </div>
      )}
    </main>
  );
}
