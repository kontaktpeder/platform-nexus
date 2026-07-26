import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Loader2, RefreshCw } from "lucide-react";
import { TopBar } from "@/components/platform/TopBar";
import { ConnectionHubPanel } from "@/components/platform/ConnectionHubPanel";
import { useOrgConnectionHub } from "@/lib/connection-hub.hooks";
import { Button } from "@/components/ui/button";
import type { ConnectionHubResponse } from "@/lib/connection-hub.types";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/connections")({
  head: ({ params }) => ({
    meta: [{ title: `Koblinger — ${params.orgSlug}` }],
  }),
  component: OrgConnectionsPage,
});

function platformConnected(hub: ConnectionHubResponse, platform: "finance" | "work") {
  return hub.workspaces.some((ws) =>
    ws.items.some((i) => i.platform === platform && i.status === "connected"),
  );
}

function FirstRunChecklist({
  hub,
  orgSlug,
}: {
  hub: ConnectionHubResponse;
  orgSlug: string;
}) {
  const financeOk = platformConnected(hub, "finance");
  const workOk = platformConnected(hub, "work");
  const firstWs = hub.workspaces[0];
  const steps = [
    {
      done: true,
      title: "Organisasjon opprettet",
      detail: hub.org.name,
      href: null as string | null,
    },
    {
      done: financeOk,
      title: "Koble Finance",
      detail: financeOk
        ? "Finance er koblet"
        : "Åpne moduler → lim inn base URL + platform-verify-nøkkel",
      href: firstWs
        ? `/o/${orgSlug}/w/${firstWs.slug}/modules`
        : `/o/${orgSlug}/settings`,
    },
    {
      done: workOk,
      title: "Koble Work",
      detail: workOk
        ? "Work er koblet"
        : "Åpne moduler → lim inn base URL + platform-verify-nøkkel",
      href: firstWs
        ? `/o/${orgSlug}/w/${firstWs.slug}/modules`
        : `/o/${orgSlug}/settings`,
    },
    {
      done: financeOk && workOk,
      title: "Åpne Mission",
      detail:
        financeOk && workOk
          ? "Mission kan hente alerts fra Finance og Work"
          : "Når begge er koblet, ser du neste handlinger i Mission",
      href: "/mission",
    },
  ];

  return (
    <section className="mt-6 rounded-xl border border-border/60 bg-card p-4">
      <h2 className="text-sm font-semibold">Kom i gang</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Sjekkliste for sømløs CORE — lim inn URL + nøkkel, org-ID hentes automatisk.
      </p>
      <ul className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.title} className="flex items-start gap-2 text-sm">
            {s.done ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className={s.done ? "text-muted-foreground line-through" : "font-medium"}>
                {s.title}
              </div>
              <p className="text-xs text-muted-foreground">{s.detail}</p>
              {!s.done && s.href && (
                <a href={s.href} className="text-xs font-medium text-primary hover:underline">
                  Fortsett →
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OrgConnectionsPage() {
  const { orgSlug } = Route.useParams();
  const query = useOrgConnectionHub(orgSlug);

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title="Koblinger"
        subtitle={query.data?.org.name}
        back={{ to: "/o/$orgSlug", params: { orgSlug } }}
      />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Oversikt over hva som er koblet, delvis koblet eller mangler — på tvers av Finance, Work,
            Gmail og Slack. Oppdateres automatisk når du tester moduler på nytt.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
            Oppdater
          </Button>
        </div>

        {query.isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : query.error ? (
          <p className="mt-4 text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "Kunne ikke laste koblinger"}
          </p>
        ) : query.data ? (
          <div className="mt-2">
            <FirstRunChecklist hub={query.data} orgSlug={orgSlug} />
            <div className="mt-6">
              <ConnectionHubPanel hub={query.data} />
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-2">
          {query.data?.workspaces.map((ws) => (
            <Button key={ws.id} asChild variant="outline" size="sm">
              <Link to="/o/$orgSlug/w/$wsSlug/modules" params={{ orgSlug, wsSlug: ws.slug }}>
                Moduler · {ws.name}
              </Link>
            </Button>
          ))}
        </div>
      </main>
    </div>
  );
}
