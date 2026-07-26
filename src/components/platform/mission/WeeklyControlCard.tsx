import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getCurrentWeeklyPlan,
  saveCurrentWeeklyPlan,
} from "@/lib/weekly-plan.functions";
import { osloWeekKey } from "@/lib/oslo-week";
import {
  emptyWeeklyPlanPayload,
  type WeeklyPlanPayload,
} from "@/lib/weekly-plan.types";

function LineList({
  items,
  placeholder,
  onChange,
  onAdd,
}: {
  items: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <Input
          key={index}
          value={item}
          placeholder={placeholder}
          onChange={(e) => {
            const next = [...items];
            next[index] = e.target.value;
            onChange(next);
          }}
          className="h-11 rounded-xl"
        />
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 gap-1.5 px-2 text-muted-foreground"
        onClick={onAdd}
      >
        <Plus className="h-3.5 w-3.5" />
        Legg til
      </Button>
    </div>
  );
}

export function WeeklyControlCard() {
  const qc = useQueryClient();
  const fetchPlan = useServerFn(getCurrentWeeklyPlan);
  const savePlan = useServerFn(saveCurrentWeeklyPlan);
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<WeeklyPlanPayload>(emptyWeeklyPlanPayload());
  const [dirty, setDirty] = useState(false);

  const query = useQuery({
    queryKey: ["weekly-plan"],
    queryFn: () => fetchPlan(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (query.data && !dirty) {
      setDraft(query.data.payload);
    }
  }, [query.data, dirty]);

  const mutation = useMutation({
    mutationFn: () =>
      savePlan({
        data: {
          weekKey: query.data?.weekKey || osloWeekKey(),
          payload: draft,
        },
      }),
    onSuccess: (saved) => {
      setDraft(saved.payload);
      setDirty(false);
      void qc.setQueryData(["weekly-plan"], saved);
      toast("Ukeplan lagret");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Kunne ikke lagre ukeplan");
    },
  });

  function patch(next: WeeklyPlanPayload) {
    setDraft(next);
    setDirty(true);
  }

  const filledNow = draft.now.filter((n) => n.text.trim()).length;
  const filledWaiting = draft.waiting.filter((w) => w.what.trim()).length;

  return (
    <section
      aria-labelledby="weekly-control"
      className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-muted/40"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">
            Kontrollag
          </p>
          <h2 id="weekly-control" className="text-lg font-semibold">
            Denne uka
            {(() => {
              const key = query.data?.weekKey;
              const m = key ? /^(\d{4})-W(\d+)$/.exec(key) : null;
              const label = m
                ? `Uke ${m[2]} · ${m[1]}`
                : query.data?.weekLabel;
              return label ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {label}
                </span>
              ) : null;
            })()}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Du fyller inn. Systemet husker — ingen AI.
            {filledNow > 0 || filledWaiting > 0
              ? ` · ${filledNow} NÅ · ${filledWaiting} venter`
              : " · Tom — skriv inn for å reflektere"}
          </p>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="space-y-5 border-t border-border px-4 py-4">
          {query.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Laster ukeplan…
            </div>
          )}

          {query.isError && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {query.error instanceof Error
                ? query.error.message
                : "Kunne ikke laste ukeplan"}
              {(query.error instanceof Error &&
                query.error.message.toLowerCase().includes("weekly_plans")) ||
              (query.error instanceof Error &&
                query.error.message.toLowerCase().includes("schema cache"))
                ? " — kjør SQL-migrasjonen for weekly_plans i Supabase."
                : ""}
            </p>
          )}

          {!query.isLoading && !query.isError && (
            <>
              {/* 1. NÅ */}
              <div>
                <h3 className="text-sm font-semibold">1. NÅ — maks 3</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Marker den ene som gir størst effekt hvis alt annet må vente.
                </p>
                <ul className="mt-3 space-y-2">
                  {draft.now.map((item, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <label className="mt-3 flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <input
                          type="radio"
                          name="biggest"
                          checked={item.biggest}
                          onChange={() => {
                            patch({
                              ...draft,
                              now: draft.now.map((n, i) => ({
                                ...n,
                                biggest: i === index,
                              })),
                            });
                          }}
                          className="accent-primary"
                          title="Størst effekt"
                        />
                        Effekt
                      </label>
                      <Textarea
                        value={item.text}
                        placeholder={
                          index === 0
                            ? "F.eks. 1st client — pitch + mail + remind"
                            : `Oppgave ${index + 1}`
                        }
                        rows={2}
                        onChange={(e) => {
                          const now = [...draft.now];
                          now[index] = { ...now[index]!, text: e.target.value };
                          patch({ ...draft, now });
                        }}
                        className="min-h-[2.75rem] flex-1 resize-y rounded-xl"
                      />
                    </li>
                  ))}
                </ul>
              </div>

              {/* 2. VENTER */}
              <div>
                <h3 className="text-sm font-semibold">2. Venter på</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Hva, hvem eier oppfølging, neste dato.
                </p>
                <div className="mt-3 space-y-3">
                  {draft.waiting.map((item, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-[1fr_7rem_8rem]"
                    >
                      <Input
                        value={item.what}
                        placeholder="Hva venter vi på?"
                        onChange={(e) => {
                          const waiting = [...draft.waiting];
                          waiting[index] = {
                            ...waiting[index]!,
                            what: e.target.value,
                          };
                          patch({ ...draft, waiting });
                        }}
                        className="h-11 rounded-xl"
                      />
                      <Input
                        value={item.owner}
                        placeholder="Eier"
                        onChange={(e) => {
                          const waiting = [...draft.waiting];
                          waiting[index] = {
                            ...waiting[index]!,
                            owner: e.target.value,
                          };
                          patch({ ...draft, waiting });
                        }}
                        className="h-11 rounded-xl"
                      />
                      <Input
                        value={item.nextDate}
                        placeholder="Neste dato"
                        onChange={(e) => {
                          const waiting = [...draft.waiting];
                          waiting[index] = {
                            ...waiting[index]!,
                            nextDate: e.target.value,
                          };
                          patch({ ...draft, waiting });
                        }}
                        className="h-11 rounded-xl"
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-1.5 px-2 text-muted-foreground"
                    onClick={() =>
                      patch({
                        ...draft,
                        waiting: [
                          ...draft.waiting,
                          { what: "", owner: "", nextDate: "" },
                        ],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Legg til
                  </Button>
                </div>
              </div>

              {/* 3. REGNVÆR */}
              <div>
                <h3 className="text-sm font-semibold">3. Regnværsliste</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Parkert — ikke start før ukens NÅ er nådd.
                </p>
                <div className="mt-3">
                  <LineList
                    items={draft.rain}
                    placeholder="Parkert oppgave…"
                    onChange={(rain) => patch({ ...draft, rain })}
                    onAdd={() => patch({ ...draft, rain: [...draft.rain, ""] })}
                  />
                </div>
              </div>

              {/* 4. IDÉBANK */}
              <div>
                <h3 className="text-sm font-semibold">4. Idébank</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Skriv ned. Ingen idéer startes før ukens viktigste mål er nådd.
                </p>
                <div className="mt-3">
                  <LineList
                    items={draft.ideas}
                    placeholder="Idé…"
                    onChange={(ideas) => patch({ ...draft, ideas })}
                    onAdd={() =>
                      patch({ ...draft, ideas: [...draft.ideas, ""] })
                    }
                  />
                </div>
              </div>

              {/* 5. LÆRING */}
              <div>
                <h3 className="text-sm font-semibold">5. Læringslogg</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Hva gjorde vi? Hva fungerte? Ellers lærer dere den samme leksa
                  om igjen.
                </p>
                <div className="mt-3 space-y-3">
                  {draft.learning.map((item, index) => (
                    <div
                      key={index}
                      className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3"
                    >
                      <Textarea
                        value={item.did}
                        placeholder="Hva gjorde vi?"
                        rows={2}
                        onChange={(e) => {
                          const learning = [...draft.learning];
                          learning[index] = {
                            ...learning[index]!,
                            did: e.target.value,
                          };
                          patch({ ...draft, learning });
                        }}
                        className="resize-y rounded-xl"
                      />
                      <Textarea
                        value={item.worked}
                        placeholder="Hva fungerte?"
                        rows={2}
                        onChange={(e) => {
                          const learning = [...draft.learning];
                          learning[index] = {
                            ...learning[index]!,
                            worked: e.target.value,
                          };
                          patch({ ...draft, learning });
                        }}
                        className="resize-y rounded-xl"
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-1.5 px-2 text-muted-foreground"
                    onClick={() =>
                      patch({
                        ...draft,
                        learning: [...draft.learning, { did: "", worked: "" }],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Legg til
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  {dirty
                    ? "Ulagrede endringer"
                    : query.data?.updatedAt
                      ? `Sist lagret ${new Date(query.data.updatedAt).toLocaleString("nb-NO")}`
                      : "Ikke lagret ennå"}
                </p>
                <Button
                  type="button"
                  className="h-11 gap-2 rounded-xl px-4"
                  disabled={!dirty || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Lagre uke
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
