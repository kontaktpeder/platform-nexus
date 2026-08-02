import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { CaptureTopBar } from "@/components/platform/CaptureTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listConnectedWorkOrgs } from "@/lib/work-timer.functions";
import {
  BREAK_OPTIONS,
  addProjectToCatalog,
  addRateToCatalog,
  ensureOrgsInCatalog,
  formatElapsed,
  projectsForOrg,
  ratesForOrg,
  readCatalog,
  readPendingEntries,
  readWorkSession,
  startWorkSession,
  stopWorkSession,
  type PendingTimeEntry,
  type WorkCatalog,
  type WorkSession,
} from "@/lib/work-session";

export const Route = createFileRoute("/_authenticated/hjem/okt")({
  head: () => ({ meta: [{ title: "Arbeidsøkt — Nexus" }] }),
  component: HjemOktPage,
});

function HjemOktPage() {
  const listWorkOrgs = useServerFn(listConnectedWorkOrgs);
  const [catalog, setCatalog] = useState<WorkCatalog>(() => readCatalog());
  const [session, setSession] = useState<WorkSession | null>(null);
  const [elapsed, setElapsed] = useState("00:00");
  const [orgId, setOrgId] = useState(catalog.orgs[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [rateId, setRateId] = useState("");
  const [comment, setComment] = useState("");
  const [breakMin, setBreakMin] = useState("0");
  const [pending, setPending] = useState<PendingTimeEntry[]>([]);
  const [adding, setAdding] = useState<"project" | "rate" | null>(null);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("950");

  const workOrgsQ = useQuery({
    queryKey: ["work-timer-orgs"],
    queryFn: () => listWorkOrgs() as Promise<{ orgs: Array<{ id: string; name: string }> }>,
    staleTime: 60_000,
  });

  useEffect(() => {
    const orgs = workOrgsQ.data?.orgs ?? [];
    if (orgs.length === 0) return;
    setCatalog(ensureOrgsInCatalog(orgs));
  }, [workOrgsQ.data]);

  const projects = useMemo(() => projectsForOrg(catalog, orgId), [catalog, orgId]);
  const rates = useMemo(() => ratesForOrg(catalog, orgId), [catalog, orgId]);
  const selectedOrg = catalog.orgs.find((o) => o.id === orgId) ?? null;
  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const selectedRate = rates.find((r) => r.id === rateId) ?? null;

  useEffect(() => {
    const active = readWorkSession();
    setSession(active);
    setPending(readPendingEntries().slice(0, 5));
    const cat = readCatalog();
    setCatalog(cat);
    if (active) {
      setOrgId(active.organizationId);
      setProjectId(active.projectId);
      setRateId(active.rateId ?? "");
      setComment(active.comment ?? "");
      return;
    }
    const firstOrg = cat.orgs[0]?.id ?? "";
    setOrgId(firstOrg);
    const orgProjects = projectsForOrg(cat, firstOrg);
    const orgRates = ratesForOrg(cat, firstOrg);
    setProjectId(orgProjects[0]?.id ?? "");
    setRateId(orgRates[0]?.id ?? "");
  }, []);

  useEffect(() => {
    if (session) return;
    const orgProjects = projectsForOrg(catalog, orgId);
    const orgRates = ratesForOrg(catalog, orgId);
    if (!orgProjects.some((p) => p.id === projectId)) {
      setProjectId(orgProjects[0]?.id ?? "");
    }
    if (!orgRates.some((r) => r.id === rateId)) {
      setRateId(orgRates[0]?.id ?? "");
    }
  }, [orgId, catalog, session, projectId, rateId]);

  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(formatElapsed(session.startedAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session]);

  function onStart() {
    if (!selectedOrg || !selectedProject) {
      toast.error("Velg org og prosjekt");
      return;
    }
    const s = startWorkSession({
      organizationId: selectedOrg.id,
      organizationName: selectedOrg.name,
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

  function submitAdd() {
    if (!orgId || !newName.trim()) return;
    if (adding === "project") {
      const p = addProjectToCatalog(orgId, newName);
      setCatalog(readCatalog());
      setProjectId(p.id);
      toast.success(`Prosjekt «${p.name}» lagt til`);
    } else if (adding === "rate") {
      const amount = Number(newAmount.replace(",", ".")) || 0;
      if (amount <= 0) {
        toast.error("Ugyldig timepris");
        return;
      }
      const r = addRateToCatalog(orgId, newName, amount);
      setCatalog(readCatalog());
      setRateId(r.id);
      toast.success(`Sats «${r.name}» lagt til`);
    }
    setAdding(null);
    setNewName("");
    setNewAmount("950");
  }

  return (
    <PlatformShell hideMobileNav>
      <CaptureTopBar title="Arbeidsøkt" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
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
            <p className="text-xs text-muted-foreground">
              Stopp lagrer økten som Work-timeføring (klar for synk).
            </p>
            <Button type="button" className="h-14 w-full rounded-2xl text-base" onClick={onStop}>
              Stopp og lagre
            </Button>
          </section>
        ) : (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <PickerField label="Org *">
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Velg organisasjon" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PickerField>

            <PickerField
              label="Prosjekt *"
              action={
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                  onClick={() => {
                    setAdding("project");
                    setNewName("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Ny
                </button>
              }
            >
              <Select value={projectId || undefined} onValueChange={setProjectId} disabled={!orgId}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Velg prosjekt" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PickerField>

            <PickerField
              label="Sats"
              action={
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                  onClick={() => {
                    setAdding("rate");
                    setNewName("");
                    setNewAmount("950");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Ny
                </button>
              }
            >
              <Select value={rateId || undefined} onValueChange={setRateId} disabled={!orgId}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Velg sats" />
                </SelectTrigger>
                <SelectContent>
                  {rates.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} · {r.amount} kr
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PickerField>

            {adding && (
              <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {adding === "project" ? "Nytt prosjekt" : "Ny sats"}
                </p>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={adding === "project" ? "Prosjektnavn" : "Satsnavn"}
                  className="h-11 rounded-xl"
                  autoFocus
                />
                {adding === "rate" && (
                  <Input
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="Timepris (kr)"
                    className="h-11 rounded-xl"
                  />
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1 rounded-xl"
                    onClick={() => setAdding(null)}
                  >
                    Avbryt
                  </Button>
                  <Button
                    type="button"
                    className="h-10 flex-1 rounded-xl"
                    disabled={!newName.trim()}
                    onClick={submitAdd}
                  >
                    Legg til
                  </Button>
                </div>
              </div>
            )}

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
              disabled={!orgId || !projectId}
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

function PickerField({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-muted-foreground">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}
