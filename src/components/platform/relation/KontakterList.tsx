import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ChevronRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformSheet } from "@/components/platform/sheet";
import { RelationAvatar } from "@/components/platform/relation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tryOpenSheet } from "@/lib/sheetGate";
import {
  CUSTOMER_ORG_FILTERS,
  CUSTOMER_ORG_FILTER_LABEL,
  CUSTOMER_WARMTH_LABEL,
  listCustomers,
  ownerContextFromOrgSlug,
  type CustomerListItem,
  type CustomerOrgFilter,
  type CustomerWarmth,
} from "@/lib/customers.functions";
import { createFieldPlace } from "@/lib/field.functions";
import { useResolvedLastWorkspace } from "@/lib/last-workspace.hooks";
import type { OwnerContext } from "@/lib/knowledge/types";
import { cn } from "@/lib/utils";

const ORG_FILTER_KEY = "mission:kontakterOrgFilter";
const LEGACY_ORG_FILTER_KEY = "mission:kunderOrgFilter";
type TypeFilter = "all" | "person" | "company";

function warmthDot(w: CustomerWarmth): string {
  switch (w) {
    case "warm":
      return "bg-emerald-500";
    case "waiting":
      return "bg-amber-500";
    case "cold":
      return "bg-sky-500";
    default:
      return "bg-muted-foreground/40";
  }
}

function readStoredOrgFilter(): CustomerOrgFilter | null {
  if (typeof window === "undefined") return null;
  try {
    const v =
      window.localStorage.getItem(ORG_FILTER_KEY) ??
      window.localStorage.getItem(LEGACY_ORG_FILTER_KEY);
    if (v && (CUSTOMER_ORG_FILTERS as readonly string[]).includes(v)) {
      return v as CustomerOrgFilter;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredOrgFilter(filter: CustomerOrgFilter) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORG_FILTER_KEY, filter);
  } catch {
    /* ignore */
  }
}

/** Contact catalog list — stays mounted under detail sheet / desktop pane. */
export function KontakterList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchList = useServerFn(listCustomers);
  const runCreate = useServerFn(createFieldPlace);
  const lastWs = useResolvedLastWorkspace();
  const selectedEntityId = useRouterState({
    select: (s) => {
      const m = s.location.pathname.match(/^\/kontakter\/([^/]+)/);
      return m?.[1] ?? null;
    },
  });
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<CustomerOrgFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [filterReady, setFilterReady] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const stored = readStoredOrgFilter();
    if (stored) {
      setOrgFilter(stored);
      setFilterReady(true);
      return;
    }
    if (lastWs.isFetched) {
      const fromWs = ownerContextFromOrgSlug(lastWs.data?.orgSlug);
      if (fromWs) setOrgFilter(fromWs);
      setFilterReady(true);
    }
  }, [lastWs.isFetched, lastWs.data?.orgSlug]);

  const listQ = useQuery({
    queryKey: ["customers"],
    queryFn: () =>
      fetchList() as Promise<{
        items: CustomerListItem[];
        countsByOrg: Record<CustomerOrgFilter, number>;
      }>,
  });

  const items = listQ.data?.items ?? [];
  const counts = listQ.data?.countsByOrg;

  const filtered = useMemo(() => {
    const byOrg =
      orgFilter === "all" ? items : items.filter((i) => i.ownerContext === orgFilter);
    const byType =
      typeFilter === "all" ? byOrg : byOrg.filter((i) => i.entityType === typeFilter);
    const needle = q.trim().toLowerCase();
    if (!needle) return byType;
    return byType.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        (i.summary ?? "").toLowerCase().includes(needle) ||
        (i.companyName ?? "").toLowerCase().includes(needle),
    );
  }, [items, orgFilter, typeFilter, q]);

  const createOwnerContext: OwnerContext =
    orgFilter !== "all" && orgFilter !== "unknown" ? orgFilter : "gold-of-sicily";

  const createMut = useMutation({
    mutationFn: (name: string) =>
      runCreate({ data: { name, ownerContext: createOwnerContext } }),
    onSuccess: async (row) => {
      toast.success(`${row.name} lagt til`);
      setAddOpen(false);
      setNewName("");
      await qc.invalidateQueries({ queryKey: ["customers"] });
      void navigate({ to: "/kontakter/$entityId", params: { entityId: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function selectOrg(next: CustomerOrgFilter) {
    setOrgFilter(next);
    writeStoredOrgFilter(next);
  }

  const subtitleCount =
    orgFilter === "all" ? items.length : (counts?.[orgFilter] ?? filtered.length);

  return (
    <>
      <GlobalTopBar
        title="Kontakter"
        subtitle={
          items.length
            ? `${subtitleCount} i ${CUSTOMER_ORG_FILTER_LABEL[orgFilter]}`
            : "Personer og selskaper"
        }
      />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-6 pt-3 md:mx-0 md:max-w-none md:px-3">
        <div className="mb-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Søk kontakt…"
                className="h-12 pl-9 text-base"
              />
            </div>
            <Button
              className="h-12 shrink-0 rounded-xl px-4"
              variant="outline"
              onClick={() => tryOpenSheet(() => setAddOpen(true))}
            >
              Ny
            </Button>
          </div>

          {filterReady && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CUSTOMER_ORG_FILTERS.map((f) => {
                const n = counts?.[f];
                const active = orgFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => selectOrg(f)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {CUSTOMER_ORG_FILTER_LABEL[f]}
                    {typeof n === "number" ? ` · ${n}` : ""}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-1.5">
            {(
              [
                ["all", "Alle"],
                ["person", "Personer"],
                ["company", "Selskaper"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTypeFilter(id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  typeFilter === id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {listQ.isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {listQ.isError && (
          <p className="py-8 text-sm text-destructive">Kunne ikke hente kontakter.</p>
        )}

        {!listQ.isLoading && filtered.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
            <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">
              {items.length === 0 ? "Ingen kontakter ennå" : "Ingen i denne org"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length === 0
                ? "Opprett her, eller fang et notat fra Hjem."
                : "Bytt filter, eller opprett ny under aktiv org."}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button onClick={() => tryOpenSheet(() => setAddOpen(true))}>Ny kontakt</Button>
              {items.length > 0 && orgFilter !== "all" && (
                <Button variant="outline" onClick={() => selectOrg("all")}>
                  Vis alle
                </Button>
              )}
            </div>
          </div>
        )}

        <ul className="space-y-2 md:space-y-1">
          {filtered.map((c) => {
            const selected = selectedEntityId === c.entityId;
            return (
              <li key={c.entityId}>
                <Link
                  to="/kontakter/$entityId"
                  params={{ entityId: c.entityId }}
                  className={cn(
                    "flex min-h-[4.25rem] items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors active:bg-muted/60",
                    selected
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-card hover:bg-muted/40",
                    "md:min-h-0 md:rounded-xl md:py-2.5",
                  )}
                  aria-current={selected ? "page" : undefined}
                >
                  <RelationAvatar
                    name={c.name}
                    entityType={c.entityType}
                    imageUrl={c.imageUrl}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-semibold leading-tight md:text-sm">
                        {c.name}
                      </p>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${warmthDot(c.warmth)}`}
                        title={CUSTOMER_WARMTH_LABEL[c.warmth]}
                        aria-label={CUSTOMER_WARMTH_LABEL[c.warmth]}
                      />
                    </div>
                    {c.companyName ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.companyName}</p>
                    ) : orgFilter === "all" && c.ownerContext !== "unknown" ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {CUSTOMER_ORG_FILTER_LABEL[c.ownerContext]}
                      </p>
                    ) : null}
                    {c.followUp ? (
                      <p
                        className={`mt-1 truncate text-sm md:text-xs ${c.followUp.overdue ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                      >
                        {c.followUp.overdue ? "Følg opp " : "Neste "}
                        {c.followUp.dueLabel}
                        {c.followUp.action ? ` · ${c.followUp.action}` : ""}
                      </p>
                    ) : c.summary ? (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground md:text-xs">
                        {c.summary}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground/80">
                        {c.entityType === "company"
                          ? `${c.peopleCount} personer · ${c.signalCount} signaler`
                          : `${c.signalCount} signaler`}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground md:hidden" />
                </Link>
              </li>
            );
          })}
        </ul>
      </main>

      {addOpen && (
        <PlatformSheet
          onClose={() => setAddOpen(false)}
          size="sheet"
          detents={["full"]}
          zClassName="z-[60]"
        >
          <div className="flex min-h-0 flex-1 flex-col px-5 pb-6" data-sheet-scroll>
            <h2 className="mb-1 text-lg font-semibold">Ny kontakt</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Opprettes under{" "}
              {CUSTOMER_ORG_FILTER_LABEL[createOwnerContext as CustomerOrgFilter] ??
                "Gold of Sicily"}
            </p>
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
              className="mt-4 h-12 w-full text-base"
              disabled={!newName.trim() || createMut.isPending}
              onClick={() => createMut.mutate(newName.trim())}
            >
              {createMut.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Opprett kontakt"
              )}
            </Button>
          </div>
        </PlatformSheet>
      )}
    </>
  );
}
