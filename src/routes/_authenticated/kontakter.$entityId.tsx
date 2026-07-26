import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  GitMerge,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import {
  NextStepPanel,
  RelationAvatar,
  OwnerContextChip,
  PlanFollowUpPanel,
} from "@/components/platform/relation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CUSTOMER_ORG_FILTER_LABEL,
  CUSTOMER_WARMTH_LABEL,
  ensureFieldPlace,
  getCustomerDetail,
  listCustomers,
  mergeCustomers,
  renameCustomer,
  setCustomerOwnerContext,
  setCustomerWarmth,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerWarmth,
} from "@/lib/customers.functions";
import { scheduleEntityFollowUp } from "@/lib/field.functions";
import type { FollowUpPreset } from "@/lib/field/field.types";
import { rejectWrongEntity } from "@/lib/known-identities.functions";
import { RELATIONSHIP_LABEL, type OwnerContext } from "@/lib/knowledge/types";

const OWNER_OPTIONS: OwnerContext[] = [
  "gold-of-sicily",
  "peder-enk",
  "personal",
  "unknown",
];

export const Route = createFileRoute("/_authenticated/kontakter/$entityId")({
  head: () => ({ meta: [{ title: "Kontakt — Mission" }] }),
  component: KontaktDetailPage,
});

function warmthClass(w: CustomerWarmth): string {
  switch (w) {
    case "warm":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "waiting":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "cold":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function sourceIcon(source: string) {
  if (source === "gmail" || source === "email") return Mail;
  if (source === "slack") return MessageSquare;
  if (source === "felt" || source === "field") return MapPin;
  return MessageSquare;
}

function KontaktDetailPage() {
  const { entityId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getCustomerDetail);
  const fetchCustomers = useServerFn(listCustomers);
  const runWarmth = useServerFn(setCustomerWarmth);
  const runOwner = useServerFn(setCustomerOwnerContext);
  const runRename = useServerFn(renameCustomer);
  const runMerge = useServerFn(mergeCustomers);
  const runReject = useServerFn(rejectWrongEntity);
  const runEnsureField = useServerFn(ensureFieldPlace);
  const runScheduleFollowUp = useServerFn(scheduleEntityFollowUp);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");

  const detailQ = useQuery({
    queryKey: ["customer", entityId],
    queryFn: () =>
      fetchDetail({ data: { entityId } }) as Promise<CustomerDetail>,
  });

  const customersQ = useQuery({
    queryKey: ["customers"],
    queryFn: () =>
      fetchCustomers() as Promise<{ items: CustomerListItem[] }>,
    staleTime: 5 * 60_000,
    enabled: mergeOpen,
  });

  const mergeCandidates = useMemo(() => {
    const items = customersQ.data?.items ?? [];
    const q = mergeQuery.trim().toLowerCase();
    return items
      .filter((c) => c.entityId !== entityId)
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [customersQ.data?.items, entityId, mergeQuery]);

  const warmthMut = useMutation({
    mutationFn: (warmth: CustomerWarmth) =>
      runWarmth({ data: { entityId, warmth } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ownerMut = useMutation({
    mutationFn: (ownerContext: OwnerContext) =>
      runOwner({ data: { entityId, ownerContext } }),
    onSuccess: async () => {
      toast.success("Org oppdatert");
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: (name: string) => runRename({ data: { entityId, name } }),
    onSuccess: async (res) => {
      toast.success("Navn oppdatert");
      setEditingName(false);
      setNameDraft(res.name);
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mergeMut = useMutation({
    mutationFn: (absorbEntityId: string) =>
      runMerge({ data: { keepEntityId: entityId, absorbEntityId } }),
    onSuccess: async (res) => {
      toast.success(`Slo sammen «${res.absorbedName}» inn i denne`);
      setMergeOpen(false);
      setMergeTargetId("");
      setMergeQuery("");
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["field-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => runReject({ data: { entityId } }),
    onSuccess: async () => {
      toast.success("Fjernet — kommer ikke tilbake");
      await qc.invalidateQueries({ queryKey: ["customers"] });
      void navigate({ to: "/kontakter" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fieldMut = useMutation({
    mutationFn: () => runEnsureField({ data: { entityId } }),
    onSuccess: async () => {
      toast.success("Lagt til i Felt");
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["field-board"] });
    },
  });

  const scheduleMut = useMutation({
    mutationFn: (input: { action: string; preset: FollowUpPreset; pickDate?: string }) =>
      runScheduleFollowUp({
        data: {
          entityId,
          action: input.action,
          preset: input.preset,
          followUpDate: input.pickDate ?? null,
        },
      }),
    onSuccess: async (res) => {
      toast.success(`Oppfølging planlagt ${res.dueLabel}`);
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["field-board"] });
      await qc.invalidateQueries({ queryKey: ["morning-mission"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = detailQ.data;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <GlobalTopBar
        title={d?.name ?? "Kontakt"}
        subtitle="Arbeidsrom — se, rett, slå sammen"
        back={{ to: "/kontakter" }}
      />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-3">
        <Link
          to="/kontakter"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Alle kontakter
        </Link>

        {detailQ.isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {detailQ.isError && (
          <p className="text-sm text-destructive">
            {detailQ.error instanceof Error
              ? detailQ.error.message
              : "Kunne ikke hente kontakt"}
          </p>
        )}

        {d && (
          <>
            <header className="mb-5">
              {editingName ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    renameMut.mutate(nameDraft);
                  }}
                >
                  <Input
                    value={nameDraft}
                    autoFocus
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="h-12 rounded-xl text-lg font-semibold"
                    maxLength={200}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      className="h-11 flex-1 rounded-xl"
                      disabled={renameMut.isPending || !nameDraft.trim()}
                    >
                      {renameMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Lagre navn"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 rounded-xl"
                      onClick={() => {
                        setEditingName(false);
                        setNameDraft(d.name);
                      }}
                    >
                      Avbryt
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-start gap-3">
                  <RelationAvatar
                    name={d.name}
                    entityType={d.entityType}
                    imageUrl={d.imageUrl}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-2">
                      <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">
                        {d.name}
                      </h1>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-10 shrink-0 gap-1.5 rounded-xl"
                        onClick={() => {
                          setNameDraft(d.name);
                          setEditingName(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Endre navn
                      </Button>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${warmthClass(d.warmth)}`}
                      >
                        {CUSTOMER_WARMTH_LABEL[d.warmth]}
                      </span>
                      <OwnerContextChip ownerContext={d.ownerContext} />
                    </div>
                  </div>
                </div>
              )}

              {d.summary && (
                <p className="mt-2 text-sm text-muted-foreground">{d.summary}</p>
              )}

              {d.followUp && (
              <NextStepPanel
                className="mt-4"
                action={`${d.followUp.overdue ? "Følg opp " : ""}${d.followUp.dueLabel}${d.followUp.action ? ` · ${d.followUp.action}` : ""}`}
              />
            )}

            <PlanFollowUpPanel
              className="mt-4"
              defaultAction={d.followUp?.action ?? ""}
              existingLabel={
                d.followUp
                  ? `${d.followUp.overdue ? "Forsinket · " : ""}${d.followUp.dueLabel}`
                  : null
              }
              busy={scheduleMut.isPending}
              onSchedule={(input) => scheduleMut.mutate(input)}
            />

            <div className="mt-3 flex flex-wrap gap-2">
                {(["cold", "waiting", "warm"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    disabled={warmthMut.isPending}
                    onClick={() => warmthMut.mutate(w)}
                    className={`min-h-10 rounded-full border px-3 text-sm font-medium ${
                      d.warmth === w
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {CUSTOMER_WARMTH_LABEL[w]}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Org
                </p>
                <div className="flex flex-wrap gap-2">
                  {OWNER_OPTIONS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      disabled={ownerMut.isPending}
                      onClick={() => ownerMut.mutate(o)}
                      className={`min-h-10 rounded-full border px-3 text-sm font-medium ${
                        d.ownerContext === o
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card"
                      }`}
                    >
                      {CUSTOMER_ORG_FILTER_LABEL[o]}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <section className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Personer ({d.people.length})
                </h2>
              </div>
              {d.people.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  Ingen personer koblet ennå. De dukker opp fra mail/Slack og Innboks.
                </p>
              ) : (
                <ul className="space-y-2">
                  {d.people.map((p) => (
                    <li
                      key={p.entityId}
                      className="rounded-xl border border-border bg-card px-4 py-3"
                    >
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {RELATIONSHIP_LABEL[p.relationshipKind as keyof typeof RELATIONSHIP_LABEL] ??
                          p.relationshipKind}
                        {p.summary ? ` · ${p.summary}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {d.relatedCompanies.length > 0 && (
              <section className="mb-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Andre koblinger
                </h2>
                <ul className="space-y-2">
                  {d.relatedCompanies.map((c) => (
                    <li key={c.entityId}>
                      <Link
                        to="/kontakter/$entityId"
                        params={{ entityId: c.entityId }}
                        className="block rounded-xl border border-border bg-card px-4 py-3 active:bg-muted/60"
                      >
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.kind}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Tidslinje ({d.timeline.length})
              </h2>
              {d.timeline.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  Ingen signaler ennå. Mail, Slack og Felt-besøk lander her.
                </p>
              ) : (
                <ol className="relative ml-2 space-y-0 border-l border-border">
                  {d.timeline.map((t) => {
                    const Icon = sourceIcon(t.source);
                    return (
                      <li key={t.id} className="relative pb-5 pl-5 last:pb-0">
                        <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary/70" />
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground">
                              {t.atLabel} · {t.source}
                            </p>
                            <p className="text-sm font-medium leading-snug">{t.title}</p>
                            {t.detail && (
                              <p className="mt-0.5 text-sm text-muted-foreground">{t.detail}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {!d.isFieldPlace && (
              <Button
                variant="outline"
                className="mb-5 h-12 w-full gap-2"
                disabled={fieldMut.isPending}
                onClick={() => fieldMut.mutate()}
              >
                <MapPin className="h-4 w-4" />
                Vis i Felt-tavlen
              </Button>
            )}

            <section className="mb-5 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Duplikat
                  </p>
                  <h2 className="text-base font-semibold">Slå sammen med annen kontakt</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Behold denne. Den andre slettes — identiteter, felt og signaler følger med.
                  </p>
                </div>
                <GitMerge className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
              </div>

              {!mergeOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-11 w-full rounded-xl"
                  onClick={() => setMergeOpen(true)}
                >
                  Velg kontakt å slå inn her…
                </Button>
              ) : (
                <div className="mt-3 space-y-2">
                  <Input
                    value={mergeQuery}
                    onChange={(e) => setMergeQuery(e.target.value)}
                    placeholder="Søk navn…"
                    className="h-11 rounded-xl"
                  />
                  {customersQ.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Laster kontakter…
                    </div>
                  )}
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value="">Velg kontakt…</option>
                    {mergeCandidates.map((c) => (
                      <option key={c.entityId} value={c.entityId}>
                        {c.name}
                        {c.ownerContext !== "unknown"
                          ? ` · ${CUSTOMER_ORG_FILTER_LABEL[c.ownerContext]}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 flex-1 rounded-xl"
                      onClick={() => {
                        setMergeOpen(false);
                        setMergeTargetId("");
                        setMergeQuery("");
                      }}
                    >
                      Avbryt
                    </Button>
                    <Button
                      type="button"
                      className="h-11 flex-1 rounded-xl"
                      disabled={!mergeTargetId || mergeMut.isPending}
                      onClick={() => {
                        const target = mergeCandidates.find(
                          (c) => c.entityId === mergeTargetId,
                        );
                        if (
                          !window.confirm(
                            `Slå «${target?.name ?? "kontakten"}» inn i «${d.name}»?\n\n«${target?.name ?? "Den andre"}» slettes.`,
                          )
                        ) {
                          return;
                        }
                        mergeMut.mutate(mergeTargetId);
                      }}
                    >
                      {mergeMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Slå sammen"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <Button
              variant="ghost"
              className="mb-5 h-10 w-full text-sm text-muted-foreground"
              disabled={rejectMut.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Fjern denne kontakten og ignorer tilknyttede e-poster/domener? Den opprettes ikke på nytt automatisk.",
                  )
                ) {
                  rejectMut.mutate();
                }
              }}
            >
              {rejectMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Dette stemmer ikke"
              )}
            </Button>

            <div className="rounded-xl bg-muted/30 px-3 py-2 font-mono text-[10px] text-muted-foreground">
              entity_id: {d.entityId}
              <br />
              slug: {d.slug}
              <br />
              owner_context: {d.ownerContext}
              {typeof d.metadata.email_domain === "string" && (
                <>
                  <br />
                  email_domain: {d.metadata.email_domain}
                </>
              )}
            </div>
          </>
        )}
      </main>

      <PlatformBottomNav />
    </div>
  );
}
