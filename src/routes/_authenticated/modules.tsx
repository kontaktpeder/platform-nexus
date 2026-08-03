import { createFileRoute } from "@tanstack/react-router";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { ModulesOverview } from "@/components/platform/ModulesOverview";
import { PlatformShell } from "@/components/platform/PlatformShell";

export const Route = createFileRoute("/_authenticated/modules")({
  head: () => ({ meta: [{ title: "Moduler — Nexus" }] }),
  component: ModulesPage,
});

function ModulesPage() {
  return (
    <PlatformShell>
      <GlobalTopBar
        title="Moduler"
        subtitle="Hva som er koblet, mangler, og planlagt"
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10 pt-4">
        <ModulesOverview />
      </main>
    </PlatformShell>
  );
}
