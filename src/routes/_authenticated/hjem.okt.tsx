import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatElapsed,
  parseHourlyRate,
  readCatalog,
  readPendingEntries,
  readWorkSession,
  startWorkSession,
  stopWorkSession,
  type PendingTimeEntry,
  type WorkSession,
} from "@/lib/work-session";

export const Route = createFileRoute("/_authenticated/hjem/okt")({
  head: () => ({ meta: [{ title: "Arbeidsøkt — Nexus" }] }),
  component: HjemOktPage,
});

function HjemOktPage() {
  const catalog = useMemo(() => readCatalog(), []);
  const [session, setSession] = useState<WorkSession | null>(null);
  const [elapsed, setElapsed] = useState("00:00");
  const [org, setOrg] = useState(catalog.orgs[0] ?? "");
  const [project, setProject] = useState(catalog.projects[0] ?? "");
  const [rateName, setRateName] = useState(catalog.rates[0] ?? "");
  const [rateAmount, setRateAmount] = useState("");
  const [comment, setComment] = useState("");
  const [breakMin, setBreakMin] = useState("0");
  const [pending, setPending] = useState<PendingTimeEntry[]>([]);

  useEffect(() => {
    const active = readWorkSession();
    setSession(active);
    setPending(readPendingEntries().slice(0, 5));
    if (active) {
      setOrg(active.organizationName);
      setProject(active.projectName);
      setRateName(active.rateName ?? "");
      setRateAmount(active.hourlyRate != null ? String(active.hourlyRate) : "");
      setComment(active.comment ?? "");
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(formatElapsed(session.startedAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session]);

  function onStart() {
    if (!org.trim()) {
      toast.error("Velg eller skriv org");
      return;
    }
    if (!project.trim()) {
      toast.error("Velg eller skriv prosjekt");
      return;
    }
    const s = startWorkSession({
      organizationName: org,
      projectName: project,
      rateName: rateName || null,
      hourlyRate: parseHourlyRate(rateAmount),
      comment: comment || null,
    });
    setSession(s);
    toast.success("Arbeidsøkt startet");
  }

  function onStop() {
    const pause = Math.max(0, Math.min(24 * 60, Number.parseInt(breakMin, 10) || 0));
    const entry = stopWorkSession(pause);
    setSession(null);
    if (entry) {
      setPending(readPendingEntries().slice(0, 5));
      toast.success(`Lagret · ${entry.total_minutes} min`, {
        description: `${entry.projectName} · klar for synk til Work`,
      });
    }
  }

  return (
    <PlatformShell hideMobileNav>
      <GlobalTopBar
        title="Arbeidsøkt"
        subtitle="Samme felter som i Work"
        back={{ to: "/hjem" }}
      />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        {session ? (
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="font-heading text-5xl font-semibold tracking-tight tabular-nums">
              {elapsed}
            </p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Org</dt>
                <dd className="truncate font-medium">{session.organizationName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Prosjekt</dt>
                <dd className="truncate font-medium">{session.projectName}</dd>
              </div>
              {(session.rateName || session.hourlyRate != null) && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Sats</dt>
                  <dd className="truncate font-medium">
                    {[session.rateName, session.hourlyRate != null ? `${session.hourlyRate} kr` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
              )}
              {session.comment && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Kommentar</dt>
                  <dd className="max-w-[60%] truncate text-right font-medium">{session.comment}</dd>
                </div>
              )}
            </dl>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Pause (minutter)
              </label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={breakMin}
                onChange={(e) => setBreakMin(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Stopp lagrer økten som Work-timeføring (klar for synk).
            </p>
            <Button type="button" className="h-14 w-full rounded-2xl text-base" onClick={onStop}>
              Stopp og lagre
            </Button>
          </section>
        ) : (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <Field
              id="org"
              label="Org"
              value={org}
              onChange={setOrg}
              placeholder="F.eks. Gold of Sicily"
              listId="org-list"
              options={catalog.orgs}
              required
            />
            <Field
              id="project"
              label="Prosjekt"
              value={project}
              onChange={setProject}
              placeholder="F.eks. Brygg — pitch"
              listId="project-list"
              options={catalog.projects}
              required
            />
            <Field
              id="rate"
              label="Sats (navn)"
              value={rateName}
              onChange={setRateName}
              placeholder="F.eks. Standard"
              listId="rate-list"
              options={catalog.rates}
            />
            <div>
              <label htmlFor="rate-amount" className="mb-1 block text-xs font-medium text-muted-foreground">
                Timepris (kr)
              </label>
              <Input
                id="rate-amount"
                inputMode="decimal"
                value={rateAmount}
                onChange={(e) => setRateAmount(e.target.value)}
                placeholder="f.eks. 950"
                className="h-12 rounded-xl"
              />
            </div>
            <div>
              <label htmlFor="comment" className="mb-1 block text-xs font-medium text-muted-foreground">
                Kommentar
              </label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 500))}
                placeholder="Hva gjorde du?"
                rows={3}
                className="rounded-xl"
              />
            </div>
            <Button
              type="button"
              className="h-14 w-full rounded-2xl text-base"
              onClick={onStart}
              disabled={!org.trim() || !project.trim()}
            >
              Start økt
            </Button>
          </section>
        )}

        {pending.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Klar for Work
            </p>
            <ul className="space-y-2">
              {pending.map((e) => (
                <li
                  key={e.id}
                  className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm"
                >
                  <p className="font-medium">
                    {e.projectName} · {e.total_minutes} min
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.organizationName}
                    {e.rateName ? ` · ${e.rateName}` : ""}
                    {e.hourlyRate != null ? ` · ${e.hourlyRate} kr` : ""}
                    {" · "}
                    {e.sync_status === "pending" ? "venter på synk" : e.sync_status}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </PlatformShell>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  listId,
  options,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  listId: string;
  options: string[];
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </label>
      <Input
        id={id}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-xl"
        required={required}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}
