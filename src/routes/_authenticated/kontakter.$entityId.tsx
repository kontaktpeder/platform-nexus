import { createFileRoute } from "@tanstack/react-router";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { ContactDetailPanel } from "@/components/platform/relation/ContactDetailPanel";

export const Route = createFileRoute("/_authenticated/kontakter/$entityId")({
  head: () => ({ meta: [{ title: "Kontakt — Platform Core" }] }),
  component: KontaktDetailPage,
});

function KontaktDetailPage() {
  const { entityId } = Route.useParams();
  return (
    <PlatformShell>
      <GlobalTopBar
        title="Kontakt"
        subtitle="Full katalog"
        back={{ to: "/kontakter" }}
      />
      <ContactDetailPanel entityId={entityId} variant="page" />
    </PlatformShell>
  );
}
