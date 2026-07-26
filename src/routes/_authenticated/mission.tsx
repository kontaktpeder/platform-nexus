import { createFileRoute, Link } from "@tanstack/react-router";
import { getReviewCount } from "@/lib/review.functions";
import { ArrowRight, Clock, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { GlobalMissionHeader } from "@/components/platform/mission/GlobalMissionHeader";
import { MorningMissionView } from "@/components/platform/mission/MorningMissionView";
import {
  getMorningMission,
  actOnMorningItem,
  undoMorningItem,
} from "@/lib/morning-mission.functions";
import type { MorningBriefItemAction, MorningBriefActionOptions, MorningMissionItem } from "@/lib/morning-mission.types";
import { InvoiceComposeSheet } from "@/components/platform/mission/InvoiceComposeSheet";
import { parseInvoiceFromMissionItem } from "@/lib/mission-invoice-action";
import { useAuth } from "@/hooks/useAuth";
import { useMissionContactSync } from "@/lib/mission-contact-sync.hooks";
import { listCustomers, type CustomerListItem } from "@/lib/customers.functions";
import { WeeklyControlCard } from "@/components/platform/mission/WeeklyControlCard";
import { ContactDetailPanel } from "@/components/platform/relation/ContactDetailPanel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mission")({
  head: () => ({ meta: [{ title: "I dag — Platform Core" }] }),
  component: GlobalMission,
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
  if (trimmed) return trimmed.split(/\s+/)[0];
  if (user.email) {
    const local = user.email.split("@")[0];
    const parts = local.split(/[._-]/).filter(Boolean);
    const p = (parts[0] ?? local).toLowerCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
  }
  return null;
}

function GlobalMission() {
  const { user } = useAuth();
  const firstName = firstNameFrom(user);
  const queryClient = useQueryClient();

  const fetchMorning = useServerFn(getMorningMission);
  const query = useQuery({
    queryKey: ["morning-mission"],
    queryFn: () => fetchMorning({ data: {} }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // After brief settles: Gmail/Slack → contacts (if stale). Don't race the brief.
  useMissionContactSync({
    enabled: !!user,
    ready: query.isFetched,
  });

  const runAct = useServerFn(actOnMorningItem);
  const runUndo = useServerFn(undoMorningItem);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [composeTarget, setComposeTarget] = useState<{
    invoiceId: string;
    orgSlug: string;
    briefItemId: string;
  } | null>(null);
  const [panelEntityId, setPanelEntityId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const data = query.data;
  const payload = data?.payload;
  const todayCount = (payload?.today ?? []).filter((i) => !hiddenIds.has(i.id)).length;
  const weekCount = (payload?.this_week ?? []).filter((i) => !hiddenIds.has(i.id)).length;
  const waitingCount = (payload?.waiting ?? []).filter((i) => !hiddenIds.has(i.id)).length;
  const activeCount = todayCount + weekCount + waitingCount;

  const displayData = data
    ? {
        ...data,
        payload: {
          ...data.payload,
          today: data.payload.today.filter((i) => !hiddenIds.has(i.id)),
          this_week: data.payload.this_week.filter((i) => !hiddenIds.has(i.id)),
          waiting: data.payload.waiting.filter((i) => !hiddenIds.has(i.id)),
        },
      }
    : undefined;

  async function onRefresh() {
    setRefreshing(true);
    try {
      // Brief only — contact sync runs in background on Mission open.
      await fetchMorning({ data: { force: true } });
      await queryClient.invalidateQueries({ queryKey: ["morning-mission"] });
      toast("Brief oppdatert");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke oppdatere");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAction(
    itemId: string,
    action: MorningBriefItemAction,
    options?: MorningBriefActionOptions,
  ) {
    setHiddenIds((prev) => new Set(prev).add(itemId));
    setBusyItemId(itemId);
    try {
      const result = await runAct({
        data: {
          itemId,
          action,
          sourceIds: options?.sourceIds,
          hint: options?.hint,
        },
      });
      const label =
        action === "done"
          ? result.learned
            ? "Ferdig — Mission husker dette"
            : "Ferdig"
          : action === "waiting"
            ? "Markert som venter"
            : action === "ignored"
              ? "Ignorert"
              : "Utsatt";
      toast(label, {
        duration: 7000,
        action: {
          label: "Angre",
          onClick: async () => {
            try {
              await runUndo({ data: { itemId } });
              setHiddenIds((prev) => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
              });
              void queryClient.invalidateQueries({ queryKey: ["morning-mission"] });
              toast("Gjenopprettet");
            } catch {
              toast.error("Kunne ikke angre");
            }
          },
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["morning-mission"] });
      if (result.learned) {
        await fetchMorning({ data: { force: true } });
        await queryClient.invalidateQueries({ queryKey: ["morning-mission"] });
      }
    } catch (err) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      toast.error(err instanceof Error ? err.message : "Handlingen feilet");
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <PlatformShell>
      <GlobalTopBar
        title="Mission"
        subtitle="Husk, følg opp og bygg sterke relasjoner"
      />
      <div className="flex min-h-0 flex-1">
        <main
          className={cn(
            "min-w-0 flex-1 overflow-y-auto px-5 py-4 sm:px-8 sm:py-6",
            panelEntityId && !isMobile && "xl:max-w-none",
          )}
        >
          <div className={cn("mx-auto w-full", panelEntityId && !isMobile ? "max-w-3xl" : "max-w-6xl")}>
            <GlobalMissionHeader
              firstName={firstName}
              count={activeCount}
              canStart={todayCount > 0}
              loadFailed={!!query.error && !data}
              onStart={() => {
                document.getElementById("morning-start-here")?.scrollIntoView({ behavior: "smooth" });
              }}
            />

            <div id="morning-today">
              <MorningMissionView
                data={displayData}
                loading={query.isLoading}
                refreshing={refreshing}
                busyItemId={busyItemId}
                error={query.error}
                onRefresh={onRefresh}
                onAction={handleAction}
                onOpenContact={setPanelEntityId}
                onComposeInvoice={(item: MorningMissionItem) => {
                  const parsed = parseInvoiceFromMissionItem(item);
                  if (!parsed) return;
                  setComposeTarget({
                    invoiceId: parsed.invoiceId,
                    orgSlug: parsed.orgSlug,
                    briefItemId: item.id,
                  });
                }}
              />
            </div>

            <details className="mt-10 rounded-2xl border border-border/60 bg-muted/20 open:pb-4">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                Mer kontekst (ukeplan, Felt, Review)
              </summary>
              <div className="space-y-4 px-4 pt-1">
                <WeeklyControlCard />
                <CustomerFollowUps />
                <ReviewInboxTeaser />
              </div>
            </details>
          </div>
        </main>

        {panelEntityId && !isMobile && (
          <aside className="sticky top-0 hidden h-[calc(100svh)] w-[min(440px,40vw)] shrink-0 flex-col border-l border-border bg-card md:flex">
            <ContactDetailPanel
              entityId={panelEntityId}
              variant="panel"
              onClose={() => setPanelEntityId(null)}
              onOpenEntity={setPanelEntityId}
            />
          </aside>
        )}
      </div>

      {isMobile && (
        <Sheet
          open={!!panelEntityId}
          onOpenChange={(open) => {
            if (!open) setPanelEntityId(null);
          }}
        >
          <SheetContent side="right" className="w-full max-w-full border-l p-0 sm:max-w-md">
            {panelEntityId && (
              <ContactDetailPanel
                entityId={panelEntityId}
                variant="panel"
                onClose={() => setPanelEntityId(null)}
                onOpenEntity={setPanelEntityId}
              />
            )}
          </SheetContent>
        </Sheet>
      )}

      {composeTarget && (
        <InvoiceComposeSheet
          open={!!composeTarget}
          onOpenChange={(open) => {
            if (!open) setComposeTarget(null);
          }}
          invoiceId={composeTarget.invoiceId}
          orgSlug={composeTarget.orgSlug}
          briefItemId={composeTarget.briefItemId}
          onSent={async () => {
            setHiddenIds((prev) => new Set(prev).add(composeTarget.briefItemId));
            setComposeTarget(null);
            await fetchMorning({ data: { force: true } });
            await queryClient.invalidateQueries({ queryKey: ["morning-mission"] });
          }}
        />
      )}
    </PlatformShell>
  );
}

function ReviewInboxTeaser() {
  const fetchCount = useServerFn(getReviewCount);
  const q = useQuery({
    queryKey: ["review-count"],
    queryFn: () => fetchCount() as Promise<{ total: number }>,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const total = q.data?.total ?? 0;
  if (total === 0) return null;
  return (
    <Link
      to="/review"
      className="mt-3 flex items-center justify-between rounded-2xl border border-border/60 bg-card p-4 text-sm shadow-sm transition hover:border-border"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-amber-500/10 text-amber-700">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="font-medium">AI trenger gjennomgang</p>
          <p className="text-xs text-muted-foreground">{total} forslag venter i Innboks</p>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">Åpne →</span>
    </Link>
  );
}

function CustomerFollowUps() {
  const fetchCustomers = useServerFn(listCustomers);
  const query = useQuery({
    queryKey: ["customers"],
    queryFn: () =>
      fetchCustomers() as Promise<{
        items: CustomerListItem[];
      }>,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const followUps = (query.data?.items ?? [])
    .filter((customer) => customer.followUp)
    .sort((a, b) =>
      (a.followUp?.dueAt ?? "").localeCompare(b.followUp?.dueAt ?? ""),
    )
    .slice(0, 4);

  return (
    <section aria-labelledby="customer-follow-ups" className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">
            Inntektsnært
          </p>
          <h2 id="customer-follow-ups" className="text-lg font-semibold">
            Følg opp nå
          </h2>
        </div>
        <Link
          to="/kontakter"
          className="inline-flex min-h-10 items-center gap-1 rounded-xl px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Alle kontakter <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {query.isLoading && (
        <div className="grid gap-2" aria-label="Laster oppfølginger">
          {[0, 1].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Kunne ikke hente kundeoppfølginger akkurat nå.
        </div>
      )}

      {!query.isLoading && !query.isError && followUps.length === 0 && (
        <Link
          to="/field"
          className="flex min-h-20 items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-4 transition-colors active:bg-muted"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Ingen planlagte oppfølginger</p>
            <p className="text-sm text-muted-foreground">
              Legg inn neste steg etter et besøk.
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {followUps.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {followUps.map((customer) => {
            const followUp = customer.followUp;
            if (!followUp) return null;
            return (
              <li key={followUp.id}>
                <Link
                  to="/kontakter/$entityId"
                  params={{ entityId: customer.entityId }}
                  className="flex min-h-24 items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/35 active:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{customer.name}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          followUp.overdue
                            ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {followUp.overdue ? "Nå" : followUp.dueLabel}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-foreground/90">
                      {followUp.action || "Ta kontakt og avklar neste steg"}
                    </p>
                    {customer.lastSeenLabel && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sist kontakt: {customer.lastSeenLabel}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
