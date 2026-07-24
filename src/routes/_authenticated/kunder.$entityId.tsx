import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_WARMTH_LABEL,
  ensureFieldPlace,
  getCustomerDetail,
  setCustomerWarmth,
  type CustomerDetail,
  type CustomerWarmth,
} from "@/lib/customers.functions";
import { RELATIONSHIP_LABEL } from "@/lib/knowledge/types";

export const Route = createFileRoute("/_authenticated/kunder/$entityId")({
  head: () => ({ meta: [{ title: "Kunde — Mission" }] }),
  component: KundeDetailPage,
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

function KundeDetailPage() {
  const { entityId } = Route.useParams();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getCustomerDetail);
  const runWarmth = useServerFn(setCustomerWarmth);
  const runEnsureField = useServerFn(ensureFieldPlace);

  const detailQ = useQuery({
    queryKey: ["customer", entityId],
    queryFn: () =>
      fetchDetail({ data: { entityId } }) as Promise<CustomerDetail>,
  });

  const warmthMut = useMutation({
    mutationFn: (warmth: CustomerWarmth) =>
      runWarmth({ data: { entityId, warmth } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
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

  const d = detailQ.data;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <GlobalTopBar
        title={d?.name ?? "Kunde"}
        subtitle="Entity · tidslinje · koblinger"
        back={{ to: "/kunder" }}
      />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-3">
        <Link
          to="/kunder"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Alle kunder
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
              : "Kunne ikke hente kunde"}
          </p>
        )}

        {d && (
          <>
            <header className="mb-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{d.name}</h1>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${warmthClass(d.warmth)}`}
                >
                  {CUSTOMER_WARMTH_LABEL[d.warmth]}
                </span>
              </div>
              {d.summary && (
                <p className="mt-2 text-sm text-muted-foreground">{d.summary}</p>
              )}

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
            </header>

            {d.followUp && (
              <section className="mb-5 rounded-2xl border border-border bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Neste i Felt
                </p>
                <p
                  className={`mt-1 text-base font-semibold ${d.followUp.overdue ? "text-amber-700 dark:text-amber-400" : ""}`}
                >
                  {d.followUp.overdue ? "Følg opp " : ""}
                  {d.followUp.dueLabel}
                </p>
                <p className="mt-0.5 text-sm">{d.followUp.action}</p>
                <Button className="mt-3 h-11 w-full" asChild>
                  <Link to="/field">Åpne Felt-tavle</Link>
                </Button>
              </section>
            )}

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

            <section className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Personer ({d.people.length})
                </h2>
              </div>
              {d.people.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  Ingen personer koblet ennå. Relasjoner dukker opp når du godkjenner
                  foreslag i Innboks, eller linker i Knowledge.
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
                        to="/kunder/$entityId"
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
                  Ingen signaler ennå. Logg et besøk i Felt, eller vent til mail/Slack
                  auto-linkes hit.
                </p>
              ) : (
                <ol className="relative space-y-0 border-l border-border ml-2">
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

            <div className="rounded-xl bg-muted/30 px-3 py-2 font-mono text-[10px] text-muted-foreground">
              entity_id: {d.entityId}
              <br />
              slug: {d.slug}
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
