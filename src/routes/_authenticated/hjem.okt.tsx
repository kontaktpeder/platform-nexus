import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CaptureTopBar } from "@/components/platform/CaptureTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getLastWorkspace } from "@/lib/last-workspace";
import {
  listConnectedModuleOrgs,
  type ConnectedModuleOrg,
} from "@/lib/module-orgs.functions";
import { fetchWorkTimerCatalog, syncTimeEntryToWork } from "@/lib/work-timer.functions";
import {
  BREAK_OPTIONS,
  formatElapsed,
  markPendingSynced,
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
  const listOrgs = useServerFn(listConnectedModuleOrgs);
  const runCatalog = useServerFn(fetchWorkTimerCatalog);
  const runSync = useServerFn(syncTimeEntryToWork);
  const lastWs = useMemo(() => getLastWorkspace(), []);

  const [orgSlug, setOrgSlug] = useState(lastWs?.orgSlug ?? "");
  const [session, setSession] = useState<WorkSession | null>(null);
  const [elapsed, setElapsed] = useState("00:00");
  const [projectId, setProjectId] = useState("");
  const [rateId, setRateId] = useState("");
  const [comment, setComment] = useState("");
  const [breakMin, setBreakMin] = useState("0");
  const [pending, setPending] = useState<PendingTimeEntry[]>([]);
  const [syncing, setSyncing] = useState(false);

  const orgsQ = useQuery({
    queryKey: ["connected-module-orgs", "work"],
    queryFn: () =>
      listOrgs({ data: { moduleSlug: "work" } }) as Promise<{
        orgs: ConnectedModuleOrg[];
      }>,
    staleTime: 30_000,
  });

  useEffect(() => {
    const orgs = orgsQ.data?.orgs ?? [];
    if (!orgs.length) return;
    if (!orgSlug || !orgs.some((o) => o.platformOrgSlug === orgSlug)) {
      setOrgSlug(orgs[0]!.platformOrgSlug);
    }
  }, [orgsQ.data, orgSlug]);

  const catalogQ = useQuery({
    queryKey: ["work-timer-catalog", orgSlug],
    enabled: !!orgSlug,
    queryFn: () =>
      runCatalog({ data: { orgSlug } }) as Promise<{
        connected: boolean;
        org: { id: string; name: string } | null;
        projects: Array<{ id: string; name: string }>;
        rates: Array<{ id: string; name: string; amount: number }>;
        error: string | null;
      }>,
    staleTime: 30_000,
  });

  const projects = catalogQ.data?.projects ?? [];
  const rates = catalogQ.data?.rates ?? [];
  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const selectedRate = rates.find((r) => r.id === rateId) ?? null;
  const workOrgName = catalogQ.data?.org?.name ?? "";
  const workOrgId = catalogQ.data?.org?.id ?? "";

  useEffect(() => {
    const active = readWorkSession();
    setSession(active);
    setPending(readPendingEntries().slice(0, 8));
    if (active) {
      setProjectId(active.projectId);
      setRateId(active.rateId ?? "");
      setComment(active.comment ?? "");
    }
  }, []);

  useEffect(() => {
    if (session || !catalogQ.data?.connected) return;
    setProjectId((cur) =>
      projects.some((p) => p.id === cur) ? cur : (projects[0]?.id ?? ""),
    );
    setRateId((cur) => (rates.some((r) => r.id === cur) ? cur : (rates[0]?.id ?? "")));
  }, [catalogQ.data, projects, rates, session]);

  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(formatElapsed(session.startedAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session]);

  async function syncEntry(entry: PendingTimeEntry) {
    if (!/^[0-9a-f-]{36}$/i.test(entry.projectId)) {
      throw new Error("Prosjekt mangler Work-id — start økt på nytt etter Work-kobling");
    }
    const res = await runSync({
      data: {
        id: entry.id,
        projectId: entry.projectId,
        rateId: entry.rateId && /^[0-9a-f-]{36}$/i.test(entry.rateId) ? entry.rateId : null,
        date: entry.date,
        start_time: entry.start_time,
        end_time: entry.end_time,
        break_minutes: entry.break_minutes,
        comment: entry.comment,
        orgSlug: orgSlug || null,
      },
    });
    markPendingSynced(entry.id, "synced");
    return res;
  }

  function onStart() {
    if (!workOrgId || !selectedProject) {
      toast.error("Velg org og prosjekt fra Work");
      return;
    }
    const s = startWorkSession({
      organizationId: workOrgId,
      organizationName: workOrgName || "Work",
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      rateId: selectedRate?.id ?? null,
      rateName: selectedRate?.name ?? null,
      hourlyRate: selectedRate?.amount ?? null,
      comment: comment || null,
    });
    setSession(s);
    toast.success("Arbeidsøkt startet");
  }

  async function onStop() {
    const pause = Math.max(0, Math.min(24 * 60, Number.parseInt(breakMin, 10) || 0));
    const entry = stopWorkSession(pause, comment);
    setSession(null);
    if (!entry) return;
    setPending(readPendingEntries().slice(0, 8));
    setSyncing(true);
    try {
      const res = await syncEntry(entry);
      setPending(readPendingEntries().slice(0, 8));
      toast.success(
        res.duplicate
          ? `Allerede i Work · ${entry.total_minutes} min`
          : `Synket til Work · ${entry.total_minutes} min`,
        { description: entry.projectName },
      );
    } catch (e) {
      markPendingSynced(entry.id, "failed");
      setPending(readPendingEntries().slice(0, 8));
      toast.error(e instanceof Error ? e.message : "Kunne ikke synke til Work", {
        description: "Økten er lagret lokalt — prøv synk igjen under",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function retrySync(entry: PendingTimeEntry) {
    setSyncing(true);
    try {
      await syncEntry(entry);
      setPending(readPendingEntries().slice(0, 8));
      toast.success("Synket til Work");
    } catch (e) {
      markPendingSynced(entry.id, "failed");
      setPending(readPendingEntries().slice(0, 8));
      toast.error(e instanceof Error ? e.message : "Synk feilet");
    } finally {
      setSyncing(false);
    }
  }

  const loading = orgsQ.isLoading || catalogQ.isLoading;
  const catalogError = catalogQ.data?.error;
  const connected = !!catalogQ.data?.connected && !!catalogQ.data.org;

  return (
    <PlatformShell hideMobileNav>
      <CaptureTopBar title="Arbeidsøkt" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
        {!session && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Work-org
            </label>
            <Select
              value={orgSlug || undefined}
              onValueChange={(v) => {
                setOrgSlug(v);
                setProjectId("");
                setRateId("");
              }}
              disabled={!!session}
            >
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Velg organisasjon" />
              </SelectTrigger>
              <SelectContent>
                {(orgsQ.data?.orgs ?? []).map((o) => (
                  <SelectItem key={o.connectionId} value={o.platformOrgSlug}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!loading && !connected && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            Koble Work under Moduler for å hente prosjekter og satser.
          </p>
        )}
        {catalogError && connected && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
            {catalogError}
          </p>
        )}

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
            </dl>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Pause</label>
              <Select value={breakMin} onValueChange={setBreakMin}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BREAK_OPTIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m === 0 ? "Ingen pause" : `${m} minutter`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="stop-comment" className="mb-1 block text-xs font-medium text-muted-foreground">
                Kommentar til Work
              </label>
              <Textarea
                id="stop-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 500))}
                placeholder="Hva gjorde du?"
                rows={3}
                disabled={syncing}
                className="rounded-xl"
              />
            </div>
            <Button
              type="button"
              className="h-14 w-full rounded-2xl text-base"
              onClick={() => void onStop()}
              disabled={syncing}
            >
              {syncing ? "Stopper og synker …" : "Stopp og synk til Work"}
            </Button>
          </section>
        ) : (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Prosjekt *
              </label>
              <Select
                value={projectId || undefined}
                onValueChange={setProjectId}
                disabled={!projects.length}
              >
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder={loading ? "Henter …" : "Velg prosjekt"} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Sats</label>
              <Select value={rateId || undefined} onValueChange={setRateId} disabled={!rates.length}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder={rates.length ? "Velg sats" : "Ingen satser"} />
                </SelectTrigger>
                <SelectContent>
                  {rates.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} · {r.amount} kr
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              disabled={!projectId || !connected}
            >
              Start økt
            </Button>
          </section>
        )}

        {pending.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Timeføringer
            </p>
            <ul className="space-y-2">
              {pending.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {e.projectName} · {e.total_minutes} min
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.organizationName}
                      {e.rateName ? ` · ${e.rateName}` : ""}
                      {" · "}
                      {e.sync_status === "synced"
                        ? "i Work"
                        : e.sync_status === "failed"
                          ? "synk feilet"
                          : "venter"}
                    </p>
                  </div>
                  {e.sync_status !== "synced" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 shrink-0 rounded-xl"
                      disabled={syncing}
                      onClick={() => void retrySync(e)}
                    >
                      Synk
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </PlatformShell>
  );
}
