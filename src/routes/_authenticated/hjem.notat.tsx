import { createFileRoute } from "@tanstack/react-router";
import { CaptureTopBar } from "@/components/platform/CaptureTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { NoteCaptureCard } from "@/components/platform/mission/NoteCaptureCard";

export const Route = createFileRoute("/_authenticated/hjem/notat")({
  head: () => ({ meta: [{ title: "Nytt notat — Nexus" }] }),
  component: HjemNotatPage,
});

function HjemNotatPage() {
  return (
    <PlatformShell hideMobileNav contentClassName="min-h-dvh">
      <CaptureTopBar title="Nytt notat" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
        <NoteCaptureCard variant="fullscreen" />
      </main>
    </PlatformShell>
  );
}
