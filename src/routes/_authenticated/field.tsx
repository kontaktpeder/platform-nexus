import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { LogVisitSheet } from "@/components/platform/field/LogVisitSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  cancelFieldFollowUp,
  completeFieldFollowUp,
  createFieldPlace,
  getFieldBoard,
  logFieldActivity,
  seedFieldPlacesFromNotes,
  snoozeFieldFollowUp,
} from "@/lib/field.functions";
import {
  FIELD_SECTION_LABEL,
  FOLLOW_UP_PRESET_LABEL,
  type FieldBoard,
  type FieldBoardSection,
  type FieldPlaceCard,
  type FollowUpPreset,
} from "@/lib/field/field.types";
import { formatOsloActivityDate } from "@/lib/field/field-dates";

export const Route = createFileRoute("/_authenticated/field")({
  head: () => ({ meta: [{ title: "Felt — Mission" }] }),
  component: FieldPage,
});

const SECTION_ORDER: FieldBoardSection[] = ["due", "upcoming", "waiting", "no_plan"];

function FieldPage() {
  const qc = useQueryClient();
  const fetchBoard = useServerFn(getFieldBoard);
  const runCreate = useServerFn(createFieldPlace);
  const runLog = useServerFn(logFieldActivity);
  const runSnooze = useServerFn(snoozeFieldFollowUp);
  const runComplete = useServerFn(completeFieldFollowUp);
  const runCancel = useServerFn(cancelFieldFollowUp);
  const runSeed = useServerFn(seedFieldPlacesFromNotes);

  const boardQ = useQuery({
    queryKey: ["field-board"],
    queryFn: () => fetchBoard() as Promise<FieldBoard>,
  });

  const [logOpen, setLogOpen] = useState(false);
  const [logTarget, setLogTarget] = useState<FieldPlaceCard | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [actionCard, setActionCard] = useState<FieldPlaceCard | null>(null);

  const board = boardQ.data;
  const places = useMemo(() => {
    if (!board) return [];
    return SECTION_ORDER.flatMap((s) => board.sections[s]).map((c) => ({
      entityId: c.entityId,
      name: c.name,
    }));
  }, [board]);

  const createMut = useMutation({
    mutationFn: (name: string) => runCreate({ data: { name } }),
    onSuccess: async (row) => {
      toast.success(`${row.name} lagt til`);
      setAddOpen(false);
      setNewName("");
      await qc.invalidateQueries({ queryKey: ["field-board"] });
      setLogTarget({
        entityId: row.id,
        name: row.name,
        slug: row.slug,
        section: "no_plan",
        situation: null,
        lastActivityAt: null,
        lastResult: null,
        nextAction: null,
        followUp: null,
        dueLabel: null,
      });
      setLogOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedMut = useMutation({
    mutationFn: () => runSeed(),
    onSuccess: async (res) => {
      toast.success(`Importerte ${res.created} steder`);
      await qc.invalidateQueries({ queryKey: ["field-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logMut = useMutation({
    mutationFn: (payload: {
      entityId: string;
      result: import("@/lib/field/field.types").FieldResult;
      note: string;
      nextAction: string;
      followUpPreset: FollowUpPreset;
      followUpDate: string | null;
    }) =>
      runLog({
        data: {
          entityId: payload.entityId,
          result: payload.result,
          note: payload.note || null,
          nextAction: payload.nextAction || null,
          followUpPreset: payload.followUpPreset,
          followUpDate: payload.followUpDate,
        },
      }),
    onSuccess: async () => {
      toast.success("Besøk lagret");
      setLogOpen(false);
      setLogTarget(null);
      await qc.invalidateQueries({ queryKey: ["field-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function snooze(followUpId: string, preset: FollowUpPreset) {
    try {
      await runSnooze({ data: { followUpId, preset } });
      toast.success(`Utsett: ${FOLLOW_UP_PRESET_LABEL[preset]}`);
      setActionCard(null);
      await qc.invalidateQueries({ queryKey: ["field-board"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    }
  }

  async function finish(followUpId: string) {
    try {
      await runComplete({ data: { followUpId } });
      toast.success("Oppfølging ferdig");
      setActionCard(null);
      await qc.invalidateQueries({ queryKey: ["field-board"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    }
  }

  async function drop(followUpId: string) {
    try {
      await runCancel({ data: { followUpId } });
      toast.success("Oppfølging avsluttet");
      setActionCard(null);
      await qc.invalidateQueries({ queryKey: ["field-board"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    }
  }

  function openLog(card?: FieldPlaceCard) {
    setLogTarget(card ?? null);
    setLogOpen(true);
  }

  const dueCount = board?.counts.due ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <GlobalTopBar
        title="Felt"
        subtitle={
          dueCount > 0
            ? `${dueCount} å følge opp nå`
            : "Hvem trenger deg i dag?"
        }
      />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-3">
        {boardQ.isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {boardQ.isError && (
          <p className="py-8 text-sm text-destructive">
            Kunne ikke hente feltlisten. Kjør migrering hvis tabellene mangler.
          </p>
        )}

        {board && board.counts.total === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
            <MapPin className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-base font-medium">Ingen steder ennå</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Legg til barer og steder du besøker. Logg resultat med ett trykk.
            </p>
            <Button className="mt-5 h-12 px-6" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Legg til sted
            </Button>
            <Button
              variant="ghost"
              className="mt-2 h-11 w-full text-sm text-muted-foreground"
              disabled={seedMut.isPending}
              onClick={() => seedMut.mutate()}
            >
              {seedMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Importer steder fra notatlisten"
              )}
            </Button>
          </div>
        )}

        {board &&
          SECTION_ORDER.map((section) => {
            const cards = board.sections[section];
            if (!cards.length) return null;
            return (
              <section key={section} className="mb-6">
                <div className="sticky top-0 z-10 -mx-4 mb-2 bg-background/95 px-4 py-2 backdrop-blur">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {FIELD_SECTION_LABEL[section]}
                    <span className="ml-1.5 tabular-nums text-muted-foreground/70">
                      {cards.length}
                    </span>
                  </h2>
                </div>
                <ul className="space-y-2">
                  {cards.map((card) => (
                    <li key={card.entityId}>
                      <PlaceCard
                        card={card}
                        onLog={() => openLog(card)}
                        onActions={() => setActionCard(card)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
      </main>

      {/* Sticky mobile actions */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center gap-2 px-4 pb-2">
        <div className="pointer-events-auto flex w-full max-w-lg gap-2">
          <Button
            variant="outline"
            className="h-14 flex-none rounded-2xl border-border bg-background/95 px-4 shadow-lg backdrop-blur"
            onClick={() => setAddOpen(true)}
            aria-label="Legg til sted"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button
            className="h-14 flex-1 rounded-2xl text-base font-semibold shadow-lg"
            onClick={() => openLog()}
          >
            Logg besøk
          </Button>
        </div>
      </div>

      <PlatformBottomNav />

      <LogVisitSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        places={places}
        initialPlace={logTarget}
        busy={logMut.isPending}
        onSubmit={async (payload) => {
          await logMut.mutateAsync(payload);
        }}
      />

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Nytt sted</SheetTitle>
          </SheetHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="F.eks. Parkteateret"
            className="h-12 text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                createMut.mutate(newName.trim());
              }
            }}
          />
          <Button
            className="mt-4 h-14 w-full text-base font-semibold"
            disabled={!newName.trim() || createMut.isPending}
            onClick={() => createMut.mutate(newName.trim())}
          >
            {createMut.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              "Legg til"
            )}
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={!!actionCard} onOpenChange={(v) => !v && setActionCard(null)}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>{actionCard?.name}</SheetTitle>
          </SheetHeader>
          <div className="grid gap-2 pb-2">
            <Button
              className="h-12 justify-start text-base"
              onClick={() => {
                if (actionCard) openLog(actionCard);
                setActionCard(null);
              }}
            >
              Logg ny aktivitet
            </Button>
            {actionCard?.followUp && (
              <>
                <Button
                  variant="outline"
                  className="h-12 justify-start text-base"
                  onClick={() => void snooze(actionCard.followUp!.id, "in_2_days")}
                >
                  Utsett 2 dager
                </Button>
                <Button
                  variant="outline"
                  className="h-12 justify-start text-base"
                  onClick={() => void snooze(actionCard.followUp!.id, "in_3_days")}
                >
                  Utsett 3 dager
                </Button>
                <Button
                  variant="outline"
                  className="h-12 justify-start text-base"
                  onClick={() => void finish(actionCard.followUp!.id)}
                >
                  Merk som ferdig
                </Button>
                <Button
                  variant="ghost"
                  className="h-12 justify-start text-base text-muted-foreground"
                  onClick={() => void drop(actionCard.followUp!.id)}
                >
                  Avslutt oppfølging
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PlaceCard({
  card,
  onLog,
  onActions,
}: {
  card: FieldPlaceCard;
  onLog: () => void;
  onActions: () => void;
}) {
  const dueTone =
    card.section === "due"
      ? "text-amber-700 dark:text-amber-400"
      : "text-muted-foreground";

  return (
    <button
      type="button"
      onClick={onActions}
      onDoubleClick={onLog}
      className="w-full rounded-2xl border border-border bg-card p-4 text-left active:bg-muted/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight">{card.name}</p>
          {card.situation && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {card.situation}
            </p>
          )}
          {card.lastActivityAt && (
            <p className="mt-1 text-xs text-muted-foreground/80">
              Sist: {formatOsloActivityDate(card.lastActivityAt)}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-10 shrink-0 rounded-xl px-3"
          onClick={(e) => {
            e.stopPropagation();
            onLog();
          }}
        >
          Logg
        </Button>
      </div>

      {(card.dueLabel || card.nextAction) && (
        <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2.5">
          {card.dueLabel && (
            <p className={`text-sm font-semibold ${dueTone}`}>
              {card.section === "due"
                ? `Følg opp ${card.dueLabel}`
                : card.section === "waiting"
                  ? `Venter · følg opp ${card.dueLabel}`
                  : `Neste: ${card.dueLabel}`}
            </p>
          )}
          {!card.dueLabel && card.section === "no_plan" && (
            <p className="text-sm font-semibold text-muted-foreground">Ingen plan</p>
          )}
          {card.nextAction && (
            <p className="mt-0.5 text-sm text-foreground/90">{card.nextAction}</p>
          )}
        </div>
      )}
    </button>
  );
}
