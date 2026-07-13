import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { TopBar } from "@/components/platform/TopBar";
import { ConnectionHubPanel } from "@/components/platform/ConnectionHubPanel";
import { getOrgConnectionHub } from "@/lib/connection-hub.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/connections")({
  head: ({ params }) => ({
    meta: [{ title: `Koblinger — ${params.orgSlug}` }],
  }),
  component: OrgConnectionsPage,
});

function OrgConnectionsPage() {
  const { orgSlug } = Route.useParams();
  const fetchHub = useServerFn(getOrgConnectionHub);
  const query = useQuery({
    queryKey: ["connection-hub", orgSlug],
    queryFn: () => fetchHub({ data: { orgSlug } }),
    staleTime: 30_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title="Koblinger"
        subtitle={query.data?.org.name}
        back={{ to: "/o/$orgSlug", params: { orgSlug } }}
      />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
        <p className="text-sm text-muted-foreground">
          Oversikt over hva som er koblet, delvis koblet eller mangler — på tvers av Finance, Work,
          Gmail og Slack.
        </p>

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
