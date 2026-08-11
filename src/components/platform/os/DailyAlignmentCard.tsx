/**
 * Vision Board & Daily Alignment — morning/evening check-in on Hele livet.
 * Explicit save (no per-keystroke auto-save).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OsCard } from "@/components/platform/os/OsPrimitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getDailyAlignmentFn,
  upsertDailyAlignmentFn,
} from "@/lib/daily-alignment.functions";
import {
  dailyAlignmentQueryKey,
  emptyDailyAlignment,
  type DailyAlignment,
} from "@/lib/daily-alignment.types";
import {
  formatOsloDayLabel,
  osloDayKey,
  shiftOsloDayKey,
} from "@/lib/oslo-week";
import { cn } from "@/lib/utils";

export function NorthStarBanner({ northStar }: { northStar: string }) {
  const text = northStar.trim();
  if (!text) {
    return (
      <div className="lg:col-span-12">
        <p className="rounded-2xl border border-dashed border-border/70 bg-white/25 px-4 py-3 text-sm text-muted-foreground backdrop-blur-sm">
          Sett dagens Nordstjerne under — den én viktigste handlingen.
        </p>
      </div>
    );
  }

  return (
    <div className="lg:col-span-12">
      <div className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-4 shadow-soft backdrop-blur-md sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          Dagens Nordstjerne
        </p>
        <p className="mt-1 font-heading text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
          {text}
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  rows = 2,
  short = false,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  short?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={short ? 1 : rows}
        className={cn(
          "mt-2 rounded-xl bg-background/70 text-sm",
          short && "min-h-[2.75rem] resize-none",
        )}
      />
    </div>
  );
}

function isDirty(draft: DailyAlignment, saved: DailyAlignment | undefined): boolean {
  if (!saved) {
    return Boolean(
      draft.identityEnergy ||
        draft.northStar ||
        draft.serviceFocus ||
        draft.winToday ||
        draft.tomorrowPriorities,
    );
  }
  return (
    draft.identityEnergy !== saved.identityEnergy ||
    draft.northStar !== saved.northStar ||
    draft.serviceFocus !== saved.serviceFocus ||
    draft.winToday !== saved.winToday ||
    draft.tomorrowPriorities !== saved.tomorrowPriorities
  );
}

export function DailyAlignmentCard() {
  const qc = useQueryClient();
  const todayKey = osloDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const [draft, setDraft] = useState<DailyAlignment>(() =>
    emptyDailyAlignment(todayKey),
  );
  const [saveHint, setSaveHint] = useState<"idle" | "saved" | "error">("idle");
  const hydratedFor = useRef<string | null>(null);

  const query = useQuery({
    queryKey: dailyAlignmentQueryKey(dayKey),
    queryFn: () => getDailyAlignmentFn({ data: { dayKey } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    hydratedFor.current = null;
    setSaveHint("idle");
    setDraft(emptyDailyAlignment(dayKey));
  }, [dayKey]);

  useEffect(() => {
    if (!query.data || query.data.dayKey !== dayKey) return;
    if (hydratedFor.current === dayKey) return;
    setDraft(query.data);
    hydratedFor.current = dayKey;
  }, [query.data, dayKey]);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertDailyAlignmentFn({
        data: {
          dayKey,
          patch: {
            identityEnergy: draft.identityEnergy,
            northStar: draft.northStar,
            serviceFocus: draft.serviceFocus,
            winToday: draft.winToday,
            tomorrowPriorities: draft.tomorrowPriorities,
          },
        },
      }),
    onSuccess: (row) => {
      qc.setQueryData(dailyAlignmentQueryKey(row.dayKey), row);
      if (row.dayKey === dayKey) {
        setDraft(row);
        hydratedFor.current = dayKey;
      }
      setSaveHint("saved");
      window.setTimeout(
        () => setSaveHint((s) => (s === "saved" ? "idle" : s)),
        2000,
      );
    },
    onError: () => setSaveHint("error"),
  });

  function setField<K extends keyof DailyAlignment>(
    key: K,
    value: DailyAlignment[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaveHint("idle");
  }

  const dirty = isDirty(draft, query.data);
  const isToday = dayKey === todayKey;
  const canGoForward = dayKey < todayKey;

  return (
    <OsCard
      title="Vision Board & Daily Alignment"
      subtitle="Morgenretning og kveldsplan"
      className="lg:col-span-7"
      tone="glass"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/50 text-foreground transition-colors hover:bg-background"
          onClick={() => setDayKey((k) => shiftOsloDayKey(k, -1))}
          aria-label="Forrige dag"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold text-foreground">
            {formatOsloDayLabel(dayKey)}
          </p>
          <p className="text-[11px] tabular-nums text-muted-foreground">{dayKey}</p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/50 text-foreground transition-colors hover:bg-background disabled:opacity-40"
          onClick={() => setDayKey((k) => shiftOsloDayKey(k, 1))}
          disabled={!canGoForward}
          aria-label="Neste dag"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="mb-3 flex h-5 items-center gap-2 text-xs text-muted-foreground">
        {query.isLoading ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Laster…
          </>
        ) : saveHint === "saved" ? (
          <span className="text-success">Lagret</span>
        ) : saveHint === "error" ? (
          <span className="text-destructive">Kunne ikke lagre</span>
        ) : query.isError ? (
          <span className="text-destructive">
            {query.error instanceof Error
              ? query.error.message.includes("daily_alignments") ||
                query.error.message.toLowerCase().includes("schema")
                ? "Kjør migrasjonen daily_alignments i Supabase."
                : query.error.message
              : "Kunne ikke laste"}
          </span>
        ) : dirty ? (
          <span>Ulagrede endringer</span>
        ) : (
          <span>{isToday ? "I dag" : "Historikk"}</span>
        )}
      </div>

      <div className="space-y-5">
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Morgensjekk
          </h3>
          <Field
            id="align-identity"
            label="Takkemoment & Identitet"
            hint="Hvilken identitet og energi opererer jeg fra i dag?"
            value={draft.identityEnergy}
            onChange={(v) => setField("identityEnergy", v)}
            rows={3}
          />
          <Field
            id="align-north"
            label="Dagens Nordstjerne"
            hint="Hva er den én viktigste handlingen i dag som korter ned avstanden til målet?"
            value={draft.northStar}
            onChange={(v) => setField("northStar", v)}
            short
          />
          <Field
            id="align-service"
            label="Tjenestefokus"
            hint="Hvordan kan jeg hjelpe og gi verdi til kunden/verden i dag?"
            value={draft.serviceFocus}
            onChange={(v) => setField("serviceFocus", v)}
            rows={2}
          />
        </section>

        <section className="space-y-4 border-t border-border/50 pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kveldssjekk / i morgen
          </h3>
          <Field
            id="align-win"
            label="Dagens seier"
            hint="Hva feirer jeg fra i dag?"
            value={draft.winToday}
            onChange={(v) => setField("winToday", v)}
            rows={2}
          />
          <Field
            id="align-tomorrow"
            label="I morgen"
            hint="Hva er de 1–3 viktigste tingene jeg gjør i morgen?"
            value={draft.tomorrowPriorities}
            onChange={(v) => setField("tomorrowPriorities", v)}
            rows={3}
          />
        </section>

        <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-4">
          <Button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending || query.isLoading}
            className="rounded-xl"
          >
            {saveMut.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Lagrer…
              </>
            ) : (
              "Lagre"
            )}
          </Button>
        </div>
      </div>
    </OsCard>
  );
}

/** Banner + card wired to today's north star for the dashboard grid. */
export function DailyAlignmentSection() {
  const todayKey = osloDayKey();
  const query = useQuery({
    queryKey: dailyAlignmentQueryKey(todayKey),
    queryFn: () => getDailyAlignmentFn({ data: { dayKey: todayKey } }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return (
    <>
      <NorthStarBanner northStar={query.data?.northStar ?? ""} />
      <DailyAlignmentCard />
    </>
  );
}
