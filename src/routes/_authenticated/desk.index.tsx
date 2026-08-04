import { createFileRoute } from "@tanstack/react-router";
import { NexusOsHome } from "@/components/platform/os/NexusOsHome";
import { parseOsContext } from "@/lib/os/context";

export const Route = createFileRoute("/_authenticated/desk/")({
  head: () => ({ meta: [{ title: "I dag — Nexus" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    kontekst: parseOsContext(search.kontekst),
  }),
  component: DeskIndexPage,
});

function DeskIndexPage() {
  const { kontekst } = Route.useSearch();
  return <NexusOsHome kontekst={kontekst} />;
}
