import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Clock, StickyNote, X } from "lucide-react";
import { toast } from "sonner";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { HomeActionButton } from "@/components/platform/home/HomeActionButton";
import { NoteCaptureCard } from "@/components/platform/mission/NoteCaptureCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import {
  formatElapsed,
  readWorkSession,
  startWorkSession,
  stopWorkSession,
  type WorkSession,
} from "@/lib/work-session";

export const Route = createFileRoute("/_authenticated/hjem")({
  head: () => ({ meta: [{ title: "Hjem — Nexus" }] }),
  component: HjemPage,
});

type Panel = "none" | "note" | "work" | "receipt";

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

function HjemPage() {
  const { user } = useAuth();
  const firstName = firstNameFrom(user);
  const [panel, setPanel] = useState<Panel>("none");
  const [session, setSession] = useState<WorkSession | null>(null);
  const [elapsed, setElapsed] = useState("00:00");
  const [workLabel, setWorkLabel] = useState("");
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  function openPanel(next: Panel) {
    setPanel((cur) => (cur === next ? "none" : next));
  }

  function onStartWork() {
    const s = startWorkSession(workLabel);
    setSession(s);
    setWorkLabel("");
    toast.success("Arbeidsøkt startet");
  }

  function onStopWork() {
    const result = stopWorkSession();
    setSession(null);
    if (result) {
      toast.success(`Økt stoppet · ${result.minutes} min`, {
        description: "Synk til Work kommer snart",
      });
    }
    setPanel("none");
  }

  function onPickReceipt(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Velg et bilde av kvitteringen");
      return;
    }
    const url = URL.createObjectURL(file);
    setReceiptPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    toast.success("Kvittering klar", {
      description: "Sendes til Finance når koblingen er på plass",
    });
  }

  return (
    <PlatformShell>
      <GlobalTopBar
        title={firstName ? `Hei, ${firstName}` : "Hjem"}
        subtitle="Fang notater, tid og kvitteringer"
      />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-8 pt-4">
        <div className="space-y-3">
          <HomeActionButton
            title="Nytt notat"
            description="Møte, samtale eller idé → Nexus"
            icon={<StickyNote className="h-5 w-5" />}
            active={panel === "note"}
            onClick={() => openPanel("note")}
          />
          <HomeActionButton
            title={session ? `Arbeidsøkt · ${elapsed}` : "Start / stopp arbeidsøkt"}
            description={
              session
                ? session.label
                  ? `Pågår · ${session.label}`
                  : "Pågår — trykk for å stoppe"
                : "Registrer tid direkte fra Nexus"
            }
            icon={<Clock className="h-5 w-5" />}
            active={panel === "work" || !!session}
            onClick={() => openPanel("work")}
          />
          <HomeActionButton
            title="Skan kvittering"
            description="Kamera → Finance"
            icon={<Camera className="h-5 w-5" />}
            active={panel === "receipt"}
            onClick={() => openPanel("receipt")}
          />
        </div>

        {panel === "note" && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nytt notat
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => setPanel("none")}
                aria-label="Lukk notat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <NoteCaptureCard />
          </div>
        )}

        {panel === "work" && (
          <section className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Arbeidsøkt</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => setPanel("none")}
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {session ? (
              <>
                <p className="font-heading text-4xl font-semibold tracking-tight tabular-nums">
                  {elapsed}
                </p>
                {session.label && <p className="text-sm text-muted-foreground">{session.label}</p>}
                <p className="text-xs text-muted-foreground">
                  Tiden lagres lokalt nå. Synk til Work kommer.
                </p>
                <Button type="button" className="h-12 w-full rounded-xl" onClick={onStopWork}>
                  Stopp økt
                </Button>
              </>
            ) : (
              <>
                <Input
                  value={workLabel}
                  onChange={(e) => setWorkLabel(e.target.value.slice(0, 80))}
                  placeholder="Hva jobber du med? (valgfritt)"
                  className="h-12 rounded-xl"
                />
                <Button type="button" className="h-12 w-full rounded-xl" onClick={onStartWork}>
                  Start økt
                </Button>
              </>
            )}
          </section>
        )}

        {panel === "receipt" && (
          <section className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Skan kvittering</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => setPanel("none")}
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Ta bilde eller velg fra rullen. Sendes til Finance når koblingen er klar.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPickReceipt(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              className="h-12 w-full gap-2 rounded-xl"
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              Åpne kamera / bilde
            </Button>
            {receiptPreview && (
              <img
                src={receiptPreview}
                alt="Kvittering"
                className="max-h-64 w-full rounded-xl object-contain bg-muted"
              />
            )}
          </section>
        )}
      </main>
    </PlatformShell>
  );
}
