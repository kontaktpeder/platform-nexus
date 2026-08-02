import { createFileRoute } from "@tanstack/react-router";
import { CaptureTopBar } from "@/components/platform/CaptureTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { InboxAssistantCard } from "@/components/platform/mission/InboxAssistantCard";

export const Route = createFileRoute("/_authenticated/hjem/spor")({
  head: () => ({ meta: [{ title: "Spør om hva som helst — Nexus" }] }),
  component: HjemSporPage,
});

function HjemSporPage() {
  return (
    <PlatformShell hideMobileNav contentClassName="min-h-dvh">
      <CaptureTopBar title="Spør om hva som helst" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
        <InboxAssistantCard variant="fullscreen" />
      </main>
    </PlatformShell>
  );
}
