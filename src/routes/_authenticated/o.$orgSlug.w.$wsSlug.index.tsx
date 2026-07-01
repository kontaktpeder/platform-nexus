import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Blocks } from "lucide-react";
import { useWs } from "./o.$orgSlug.w.$wsSlug";
import { WidgetSlot } from "@/components/platform/WidgetSlot";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/w/$wsSlug/")({
  component: Dashboard,
});

function Dashboard() {
  const { orgSlug, wsSlug } = Route.useParams();
  const { ws, modules } = useWs();
  const activeModules = modules.filter((m) => m.enabled);

  const widgetsByModule: Record<string, { title: string; hint?: string }[]> = {
    finance: [{ title: "Ubetalte fakturaer" }, { title: "Månedens omsetning" }],
    work: [{ title: "Dagens timer" }, { title: "Aktive prosjekter" }],
    booking: [{ title: "Neste booking" }],
    content: [{ title: "Siste innlegg" }],
    explore: [{ title: "Neste popup" }],
    inventory: [{ title: "Lav på lager" }],
    crm: [{ title: "Nye leads" }],
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <section className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Hei igjen 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arbeidsflaten <span className="font-medium text-foreground">{ws.name}</span> — {activeModules.length} aktive modul{activeModules.length === 1 ? "" : "er"}.
        </p>
      </section>

      {activeModules.length === 0 ? (
        <div className="surface-card p-8 text-center">
          <Blocks className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="font-heading text-lg font-semibold">Ingen moduler aktivert</h3>
          <p className="mt-1 text-sm text-muted-foreground">Slå på det arbeidsflaten trenger for å se widgets her.</p>
          <Link to="/o/$orgSlug/w/$wsSlug/modules" params={{ orgSlug, wsSlug }}>
            <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Åpne modulvelger <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {activeModules.flatMap((m) =>
            (widgetsByModule[m.slug] ?? [{ title: m.name }]).map((w, i) => (
              <WidgetSlot key={`${m.id}-${i}`} moduleName={m.name} title={w.title} hint={w.hint} />
            )),
          )}
        </div>
      )}
    </main>
  );
}
