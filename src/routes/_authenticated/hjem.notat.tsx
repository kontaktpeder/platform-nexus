import { createFileRoute } from "@tanstack/react-router";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { NoteCaptureCard } from "@/components/platform/mission/NoteCaptureCard";

export const Route = createFileRoute("/_authenticated/hjem/notat")({
  head: () => ({ meta: [{ title: "Nytt notat — Nexus" }] }),
  component: HjemNotatPage,
});

function HjemNotatPage() {
  return (
    <PlatformShell hideMobileNav>
      <GlobalTopBar title="Nytt notat" subtitle="Lim inn, rediger og lagre" back={{ to: "/hjem" }} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <NoteCaptureCard />
      </main>
    </PlatformShell>
  );
}
