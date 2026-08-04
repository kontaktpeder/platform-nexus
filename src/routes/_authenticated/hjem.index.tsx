import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, Clock, StickyNote } from "lucide-react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { HomeActionButton } from "@/components/platform/home/HomeActionButton";
import { InboxAssistantCard } from "@/components/platform/mission/InboxAssistantCard";
import { formatElapsed, readWorkSession, type WorkSession } from "@/lib/work-session";

export const Route = createFileRoute("/_authenticated/hjem/")({
  head: () => ({ meta: [{ title: "Hjem — Nexus" }] }),
  component: HjemIndexPage,
});

function HjemIndexPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<WorkSession | null>(null);
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    setSession(readWorkSession());
  }, []);

  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(formatElapsed(session.startedAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session]);

  return (
    <PlatformShell>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <InboxAssistantCard variant="home" />

        <HomeActionButton
          title="Nytt notat"
          description="Møte, samtale eller idé → Nexus"
          icon={<StickyNote className="h-5 w-5" />}
          onClick={() => void navigate({ to: "/hjem/notat" })}
        />
        <HomeActionButton
          title={session ? `Arbeidsøkt · ${elapsed}` : "Start / stopp arbeidsøkt"}
          description={
            session
              ? `${session.projectName} · ${session.organizationName}`
              : "Velg org, prosjekt og sats → Work"
          }
          icon={<Clock className="h-5 w-5" />}
          active={!!session}
          onClick={() => void navigate({ to: "/hjem/okt" })}
        />
        <HomeActionButton
          title="Skan kvittering"
          description="Kamera eller opplasting → Finance"
          icon={<Camera className="h-5 w-5" />}
          onClick={() => void navigate({ to: "/hjem/kvittering" })}
        />
      </main>
    </PlatformShell>
  );
}
