import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { TopBar } from "@/components/platform/TopBar";
import { ConnectionHubPanel } from "@/components/platform/ConnectionHubPanel";
import { useOrgConnectionHub } from "@/lib/connection-hub.hooks";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/connections")({
  head: ({ params }) => ({
    meta: [{ title: `Koblinger — ${params.orgSlug}` }],
  }),
  component: OrgConnectionsPage,
});

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
          <div className="mt-6">
            <ConnectionHubPanel hub={query.data} />
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
