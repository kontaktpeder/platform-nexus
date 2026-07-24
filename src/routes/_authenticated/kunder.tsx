import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ChevronRight, Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CUSTOMER_WARMTH_LABEL,
  listCustomers,
  type CustomerListItem,
  type CustomerWarmth,
} from "@/lib/customers.functions";
import { createFieldPlace } from "@/lib/field.functions";

export const Route = createFileRoute("/_authenticated/kunder")({
  head: () => ({ meta: [{ title: "Kunder — Mission" }] }),
  component: KunderPage,
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

function KunderPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listCustomers);
  const runCreate = useServerFn(createFieldPlace);
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const listQ = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchList() as Promise<{ items: CustomerListItem[] }>,
  });

  const items = listQ.data?.items ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        (i.summary ?? "").toLowerCase().includes(needle),
    );
  }, [items, q]);

  const createMut = useMutation({
    mutationFn: (name: string) => runCreate({ data: { name } }),
    onSuccess: async (row) => {
      toast.success(`${row.name} lagt til`);
      setAddOpen(false);
      setNewName("");
      await qc.invalidateQueries({ queryKey: ["customers"] });
      window.location.assign(`/kunder/${row.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <GlobalTopBar
        title="Kunder"
        subtitle={
          items.length
            ? `${items.length} virksomheter i Knowledge`
            : "Company-entities fra Mission"
        }
      />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-3">
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søk virksomhet…"
              className="h-12 pl-9 text-base"
            />
          </div>
          <Button
            className="h-12 shrink-0 rounded-xl px-4"
            variant="outline"
            onClick={() => setAddOpen((v) => !v)}
          >
            Ny
          </Button>
        </div>

        {addOpen && (
          <div className="mb-4 rounded-2xl border border-border bg-card p-3">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="F.eks. Parkteateret"
              className="h-12 text-base"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) createMut.mutate(newName.trim());
              }}
            />
            <Button
              className="mt-2 h-12 w-full text-base"
              disabled={!newName.trim() || createMut.isPending}
              onClick={() => createMut.mutate(newName.trim())}
            >
              {createMut.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Opprett virksomhet"
              )}
            </Button>
          </div>
        )}

        <p className="mb-3 text-xs text-muted-foreground">
          Trykk på en kunde for tidslinje, personer og oppfølging — det du har bygget i Mission.
        </p>

        {listQ.isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {listQ.isError && (
          <p className="py-8 text-sm text-destructive">Kunne ikke hente kunder.</p>
        )}

        {!listQ.isLoading && filtered.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
            <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Ingen virksomheter ennå</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Opprett her, importer i Felt, eller godkjenn forslag i Innboks.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button onClick={() => setAddOpen(true)}>Ny virksomhet</Button>
              <Button variant="outline" asChild>
                <Link to="/field">Åpne Felt</Link>
              </Button>
            </div>
          </div>
        )}

        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.entityId}>
              <Link
                to="/kunder/$entityId"
                params={{ entityId: c.entityId }}
                className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-border bg-card p-4 active:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-semibold leading-tight">{c.name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${warmthClass(c.warmth)}`}
                    >
                      {CUSTOMER_WARMTH_LABEL[c.warmth]}
                    </span>
                  </div>
                  {c.followUp ? (
                    <p
                      className={`mt-1 text-sm ${c.followUp.overdue ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                    >
                      {c.followUp.overdue ? "Følg opp " : "Neste "}
                      {c.followUp.dueLabel}
                      {c.followUp.action ? ` · ${c.followUp.action}` : ""}
                    </p>
                  ) : c.summary ? (
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{c.summary}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      {c.peopleCount} personer · {c.signalCount} signaler
                      {c.isFieldPlace ? " · Felt" : ""}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="h-12 flex-1 gap-2" asChild>
            <Link to="/field">
              <MapPin className="h-4 w-4" /> Felt-tavle
            </Link>
          </Button>
          <Button variant="outline" className="h-12 flex-1" asChild>
            <Link to="/knowledge">Knowledge</Link>
          </Button>
        </div>
      </main>

      <PlatformBottomNav />
    </div>
  );
}
