import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ContactDetailPanel } from "@/components/platform/relation/ContactDetailPanel";
import { PlatformSheet } from "@/components/platform/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/kontakter/$entityId")({
  head: () => ({ meta: [{ title: "Kontakt — Nexus" }] }),
  component: KontaktDetailPage,
});

function KontaktDetailPage() {
  const { entityId } = Route.useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const panel = (
    <ContactDetailPanel
      entityId={entityId}
      variant="panel"
      onClose={() => void navigate({ to: "/kontakter" })}
      onOpenEntity={(id) =>
        void navigate({ to: "/kontakter/$entityId", params: { entityId: id } })
      }
      className="min-h-0 flex-1 border-0 bg-transparent"
    />
  );

  if (isMobile) {
    return (
      <PlatformSheet
        onClose={() => void navigate({ to: "/kontakter" })}
        size="sheet"
        detents={["half", "full"]}
        initialDetent="half"
        zClassName="z-[55]"
      >
        {panel}
      </PlatformSheet>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-xl flex-col">{panel}</div>
    </div>
  );
}
