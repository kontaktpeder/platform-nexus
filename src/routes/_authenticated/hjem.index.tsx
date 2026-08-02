import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, Clock, StickyNote } from "lucide-react";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { HomeActionButton } from "@/components/platform/home/HomeActionButton";
import { useAuth } from "@/hooks/useAuth";
import { formatElapsed, readWorkSession, type WorkSession } from "@/lib/work-session";

export const Route = createFileRoute("/_authenticated/hjem/")({
  head: () => ({ meta: [{ title: "Hjem — Nexus" }] }),
  component: HjemIndexPage,
});

function firstNameFrom(user: ReturnType<typeof useAuth>["user"]): string | null {
  if (!user) return null;
  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const cand =
    (md.first_name as string) ||
    (md.given_name as string) ||
    (md.name as string) ||
    (md.full_name as string) ||
    "";
  const trimmed = cand.trim();
  if (trimmed) return trimmed.split(/\s+/)[0] ?? null;
  if (user.email) {
    const local = user.email.split("@")[0] ?? "";
    const p = (local.split(/[._-]/)[0] ?? local).toLowerCase();
    return p ? p.charAt(0).toUpperCase() + p.slice(1) : null;
  }
  return null;
}

function HjemIndexPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = firstNameFrom(user);
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
      <GlobalTopBar
        title={firstName ? `Hei, ${firstName}` : "Hjem"}
        subtitle="Fang notater, tid og kvitteringer"
      />

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-3 px-4 pb-8 pt-4">
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
              : "Org, prosjekt, sats og kommentar → Work"
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
