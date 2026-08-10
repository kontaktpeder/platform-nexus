/**
 * Vision Board & Daily Alignment — morning/evening check-in on Hele livet.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OsCard } from "@/components/platform/os/OsPrimitives";
import { Textarea } from "@/components/ui/textarea";
import {
  getDailyAlignmentFn,
  upsertDailyAlignmentFn,
} from "@/lib/daily-alignment.functions";
import {
  dailyAlignmentQueryKey,
  emptyDailyAlignment,
  type DailyAlignment,
  type DailyAlignmentPatch,
} from "@/lib/daily-alignment.types";
import {
  formatOsloDayLabel,
  osloDayKey,
  shiftOsloDayKey,
} from "@/lib/oslo-week";
import { cn } from "@/lib/utils";

const SAVE_DEBOUNCE_MS = 500;

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

export function DailyAlignmentCard() {
  const qc = useQueryClient();
  const todayKey = osloDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const [draft, setDraft] = useState<DailyAlignment>(() =>
    emptyDailyAlignment(todayKey),
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<DailyAlignmentPatch>({});

  const query = useQuery({
    queryKey: dailyAlignmentQueryKey(dayKey),
    queryFn: () => getDailyAlignmentFn({ data: { dayKey } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  useEffect(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingPatch.current = {};
    setSaveState("idle");
  }, [dayKey]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const saveMut = useMutation({
    mutationFn: (args: { dayKey: string; patch: DailyAlignmentPatch }) =>
      upsertDailyAlignmentFn({ data: args }),
    onMutate: () => setSaveState("saving"),
    onSuccess: (row) => {
      qc.setQueryData(dailyAlignmentQueryKey(row.dayKey), row);
      if (row.dayKey === dayKey) setDraft(row);
      setSaveState("saved");
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
    },
    onError: () => setSaveState("error"),
  });

  function scheduleSave(patch: DailyAlignmentPatch) {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const p = pendingPatch.current;
      pendingPatch.current = {};
      saveMut.mutate({ dayKey, patch: p });
    }, SAVE_DEBOUNCE_MS);
  }

  function patchField<K extends keyof DailyAlignmentPatch>(
    key: K,
    value: NonNullable<DailyAlignmentPatch[K]>,
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    scheduleSave({ [key]: value });
  }

  const isToday = dayKey === todayKey;
  const canGoForward = dayKey < todayKey;

  return (
    <OsCard
      title="Vision Board & Daily Alignment"
      subtitle="Morgenretning og kveldsplan — auto-lagres"
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
        ) : saveState === "saving" ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Lagrer…
          </>
        ) : saveState === "saved" ? (
          <span className="text-success">Lagret</span>
        ) : saveState === "error" ? (
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
            onChange={(v) => patchField("identityEnergy", v)}
            rows={3}
          />
          <Field
            id="align-north"
            label="Dagens Nordstjerne"
            hint="Hva er den én viktigste handlingen i dag som korter ned avstanden til målet?"
            value={draft.northStar}
            onChange={(v) => patchField("northStar", v)}
            short
          />
          <Field
            id="align-service"
            label="Tjenestefokus"
            hint="Hvordan kan jeg hjelpe og gi verdi til kunden/verden i dag?"
            value={draft.serviceFocus}
            onChange={(v) => patchField("serviceFocus", v)}
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
            onChange={(v) => patchField("winToday", v)}
            rows={2}
          />
          <Field
            id="align-tomorrow"
            label="I morgen"
            hint="Hva er de 1–3 viktigste tingene jeg gjør i morgen?"
            value={draft.tomorrowPriorities}
            onChange={(v) => patchField("tomorrowPriorities", v)}
            rows={3}
          />
        </section>
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
