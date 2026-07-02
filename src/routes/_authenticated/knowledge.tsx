import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Link2, X, Sparkles, Wand2, Check, Clock } from "lucide-react";
import { TopBar } from "@/components/platform/TopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  listEntities,
  createEntity,
  updateEntity,
  deleteEntity,
  listRelationships,
  createRelationship,
  deleteRelationship,
  listSignalsForEntity,
  linkSignalToEntity,
  unlinkSignal,
  seedKnowledgeDemo,
} from "@/lib/knowledge.functions";
import {
  suggestKnowledgeEntities,
  listEntitySuggestions,
  acceptEntitySuggestion,
  ignoreEntitySuggestion,
  snoozeEntitySuggestion,
  type EntitySuggestion,
} from "@/lib/knowledge-suggestions.functions";
import { CLUSTER_KIND_LABEL } from "@/lib/knowledge/suggestion-clusters";
import type {
  Entity,
  EntityRelationship,
  EntityRelationshipKind,
  EntitySignal,
  EntityType,
} from "@/lib/knowledge/types";
import {
  ENTITY_TYPES,
  ENTITY_TYPE_LABEL,
  RELATIONSHIP_KINDS,
  RELATIONSHIP_LABEL,
} from "@/lib/knowledge/types";


export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge — Platform Core" }] }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const qc = useQueryClient();
  const fetchEntities = useServerFn(listEntities);
  const seed = useServerFn(seedKnowledgeDemo);

  const entitiesQ = useQuery({
    queryKey: ["knowledge", "entities"],
    queryFn: () => fetchEntities({ data: {} }) as Promise<Entity[]>,
  });

  const [selected, setSelected] = useState<Entity | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const entities = entitiesQ.data ?? [];
  const grouped = groupByType(entities);

  async function handleSeed() {
    try {
      const res = (await seed()) as { seeded: boolean };
      toast(res.seeded ? "Demo-data lagt til" : "Har allerede entiteter");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar title="Knowledge" subtitle="People, companies, projects" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            How Platform understands your world.
          </p>
          <div className="flex gap-2">
            {entities.length === 0 && (
              <Button variant="outline" size="sm" onClick={handleSeed} className="gap-1">
                <Sparkles className="h-4 w-4" /> Seed demo
              </Button>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" /> New
                </Button>
              </DialogTrigger>
              <CreateEntityDialog
                onCreated={() => {
                  setCreateOpen(false);
                  qc.invalidateQueries({ queryKey: ["knowledge"] });
                }}
              />
            </Dialog>
          </div>
        </div>

        {entitiesQ.isLoading && (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!entitiesQ.isLoading && entities.length === 0 && (
          <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
            No entities yet. Create one, or seed demo data.
          </div>
        )}

        <CommitmentsSection />

        <SuggestionsSection />




        <div className="space-y-6">
          {ENTITY_TYPES.map((t) =>
            (grouped[t] ?? []).length > 0 ? (
              <section key={t}>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {ENTITY_TYPE_LABEL[t]}
                </h2>
                <ul className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-card">
                  {grouped[t]!.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(e)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">{e.name}</div>
                          {e.summary && (
                            <div className="truncate text-xs text-muted-foreground">
                              {e.summary}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {e.importance}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/settings" className="hover:underline">
            ← Back to Settings
          </Link>
        </div>
      </main>

      <EntityDrawer
        entity={selected}
        entities={entities}
        onClose={() => setSelected(null)}
      />
      <PlatformBottomNav />
    </div>
  );
}

function groupByType(entities: Entity[]): Partial<Record<EntityType, Entity[]>> {
  const out: Partial<Record<EntityType, Entity[]>> = {};
  for (const e of entities) {
    (out[e.type] ??= []).push(e);
  }
  return out;
}

// ─── Create entity dialog ───────────────────────────────────────────────────

function CreateEntityDialog({ onCreated }: { onCreated: () => void }) {
  const create = useServerFn(createEntity);
  const [type, setType] = useState<EntityType>("company");
  const [name, setName] = useState("");
  const [importance, setImportance] = useState(50);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await create({ data: { type, name: name.trim(), importance } });
      toast("Opprettet");
      setName("");
      setImportance(50);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New entity</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as EntityType)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ENTITY_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <Label>Importance: {importance}</Label>
          <Slider
            className="mt-2"
            value={[importance]}
            min={0}
            max={100}
            step={5}
            onValueChange={(v) => setImportance(v[0])}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={busy || !name.trim()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Entity drawer (detail + relationships + signals) ───────────────────────

function EntityDrawer({
  entity,
  entities,
  onClose,
}: {
  entity: Entity | null;
  entities: Entity[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fetchRels = useServerFn(listRelationships);
  const fetchSignals = useServerFn(listSignalsForEntity);
  const update = useServerFn(updateEntity);
  const del = useServerFn(deleteEntity);
  const createRel = useServerFn(createRelationship);
  const delRel = useServerFn(deleteRelationship);
  const linkSig = useServerFn(linkSignalToEntity);
  const unlinkSig = useServerFn(unlinkSignal);

  const open = !!entity;
  const id = entity?.id ?? null;

  const relQ = useQuery({
    queryKey: ["knowledge", "rels", id],
    queryFn: () => fetchRels({ data: { entityId: id! } }) as Promise<EntityRelationship[]>,
    enabled: !!id,
  });
  const sigQ = useQuery({
    queryKey: ["knowledge", "signals", id],
    queryFn: () => fetchSignals({ data: { entityId: id! } }) as Promise<EntitySignal[]>,
    enabled: !!id,
  });

  const [summary, setSummary] = useState(entity?.summary ?? "");
  const [importance, setImportance] = useState(entity?.importance ?? 50);
  const [dirty, setDirty] = useState(false);

  // Reset local edits when entity changes.
  if (entity && !dirty && (summary !== (entity.summary ?? "") || importance !== entity.importance)) {
    // Only sync on entity switch; small heuristic to avoid overwriting user edits.
  }
  const entityKey = entity?.id ?? null;
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (entityKey !== lastKey) {
    setLastKey(entityKey);
    setSummary(entity?.summary ?? "");
    setImportance(entity?.importance ?? 50);
    setDirty(false);
  }

  async function save() {
    if (!entity) return;
    try {
      await update({
        data: { id: entity.id, summary: summary.slice(0, 500), importance },
      });
      toast("Lagret");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    }
  }

  async function handleDelete() {
    if (!entity) return;
    if (!confirm(`Slette «${entity.name}»?`)) return;
    try {
      await del({ data: { id: entity.id } });
      toast("Slettet");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    }
  }

  // Add relationship
  const [relTarget, setRelTarget] = useState<string>("");
  const [relKind, setRelKind] = useState<EntityRelationshipKind>("related_to");
  async function addRel() {
    if (!entity || !relTarget) return;
    try {
      await createRel({
        data: { fromEntityId: entity.id, toEntityId: relTarget, kind: relKind },
      });
      setRelTarget("");
      qc.invalidateQueries({ queryKey: ["knowledge", "rels", entity.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    }
  }

  // Link signal manually
  const [sigRef, setSigRef] = useState("");
  const [sigSource, setSigSource] = useState("gmail");
  const [sigType, setSigType] = useState("message.received");
  async function addSignal() {
    if (!entity || !sigRef.trim()) return;
    try {
      await linkSig({
        data: {
          entityId: entity.id,
          source: sigSource,
          signalType: sigType,
          externalRef: sigRef.trim(),
        },
      });
      setSigRef("");
      qc.invalidateQueries({ queryKey: ["knowledge", "signals", entity.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    }
  }

  const rels = relQ.data ?? [];
  const signals = sigQ.data ?? [];
  const otherEntities = entities.filter((e) => e.id !== entity?.id);
  const entityById = new Map(entities.map((e) => [e.id, e]));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {entity && (
          <>
            <SheetHeader>
              <SheetTitle>{entity.name}</SheetTitle>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {ENTITY_TYPE_LABEL[entity.type]}
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <div>
                <Label>Summary</Label>
                <Textarea
                  className="mt-1"
                  value={summary}
                  onChange={(e) => {
                    setSummary(e.target.value);
                    setDirty(true);
                  }}
                  maxLength={500}
                  placeholder="Short rolling context…"
                />
                <div className="mt-1 text-right text-xs text-muted-foreground">
                  {summary.length}/500
                </div>
              </div>
              <div>
                <Label>Importance: {importance}</Label>
                <Slider
                  className="mt-2"
                  value={[importance]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) => {
                    setImportance(v[0]);
                    setDirty(true);
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={save} disabled={!dirty} size="sm">
                  Save
                </Button>
                <Button
                  onClick={handleDelete}
                  variant="outline"
                  size="sm"
                  className="ml-auto gap-1 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Relationships</h3>
                <ul className="mb-3 space-y-1 text-sm">
                  {rels.length === 0 && (
                    <li className="text-xs text-muted-foreground">Ingen relasjoner.</li>
                  )}
                  {rels.map((r) => {
                    const from = entityById.get(r.from_entity_id);
                    const to = entityById.get(r.to_entity_id);
                    return (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                      >
                        <span className="truncate">
                          <span className="font-medium">{from?.name ?? "?"}</span>{" "}
                          <span className="text-muted-foreground">
                            {RELATIONSHIP_LABEL[r.kind]}
                          </span>{" "}
                          <span className="font-medium">{to?.name ?? "?"}</span>
                        </span>
                        <button
                          type="button"
                          aria-label="Fjern"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={async () => {
                            await delRel({ data: { id: r.id } });
                            qc.invalidateQueries({
                              queryKey: ["knowledge", "rels", entity.id],
                            });
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="grid grid-cols-1 gap-2 rounded-md border border-dashed border-border/60 p-2 sm:grid-cols-[1fr_auto_auto]">
                  <Select value={relTarget} onValueChange={setRelTarget}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick entity…" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherEntities.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={relKind}
                    onValueChange={(v) => setRelKind(v as EntityRelationshipKind)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIP_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {RELATIONSHIP_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addRel} disabled={!relTarget} size="sm">
                    Add
                  </Button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
                  <Link2 className="h-4 w-4" /> Signals
                </h3>
                <ul className="mb-3 space-y-1 text-sm">
                  {signals.length === 0 && (
                    <li className="text-xs text-muted-foreground">Ingen signaler.</li>
                  )}
                  {signals.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-start justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">
                          {s.source} · {s.signal_type}
                        </div>
                        <div className="truncate font-mono text-xs">{s.external_ref}</div>
                        {s.snippet && (
                          <div className="text-xs text-muted-foreground">{s.snippet}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label="Unlink"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          await unlinkSig({ data: { externalRef: s.external_ref } });
                          qc.invalidateQueries({
                            queryKey: ["knowledge", "signals", entity.id],
                          });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="space-y-2 rounded-md border border-dashed border-border/60 p-2">
                  <Input
                    placeholder="external_ref (e.g. gmail:abc123)"
                    value={sigRef}
                    onChange={(e) => setSigRef(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="source"
                      value={sigSource}
                      onChange={(e) => setSigSource(e.target.value)}
                    />
                    <Input
                      placeholder="signal_type"
                      value={sigType}
                      onChange={(e) => setSigType(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={addSignal}
                    disabled={!sigRef.trim()}
                    size="sm"
                    className="w-full"
                  >
                    Link signal
                  </Button>
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Knowledge suggestions (v2) ─────────────────────────────────────────────

function SuggestionsSection() {
  const qc = useQueryClient();
  const list = useServerFn(listEntitySuggestions);
  const scan = useServerFn(suggestKnowledgeEntities);
  const [scanning, setScanning] = useState(false);

  const q = useQuery({
    queryKey: ["knowledge", "suggestions", "pending"],
    queryFn: () =>
      list({ data: { status: "pending" } }) as Promise<EntitySuggestion[]>,
  });

  async function runScan() {
    setScanning(true);
    try {
      const rows = (await scan()) as EntitySuggestion[];
      qc.setQueryData(["knowledge", "suggestions", "pending"], rows);
      toast(rows.length > 0 ? `${rows.length} nye forslag` : "Ingen nye forslag");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Skanning feilet");
    } finally {
      setScanning(false);
    }
  }

  const suggestions = q.data ?? [];

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Forslag
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={runScan}
          disabled={scanning}
          className="h-7 gap-1 text-xs"
        >
          {scanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          Skann etter forslag
        </Button>
      </div>

      {q.isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-6 text-center text-xs text-muted-foreground">
          Laster…
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
          Ingen nye forslag. Koble signaler manuelt eller vent til flere gjentatte avsendere.
        </div>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SuggestionCard({ suggestion }: { suggestion: EntitySuggestion }) {
  const qc = useQueryClient();
  const accept = useServerFn(acceptEntitySuggestion);
  const ignore = useServerFn(ignoreEntitySuggestion);
  const snooze = useServerFn(snoozeEntitySuggestion);
  const [busy, setBusy] = useState<"accept" | "ignore" | "snooze" | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["knowledge", "suggestions"] });
    qc.invalidateQueries({ queryKey: ["knowledge", "entities"] });
    qc.invalidateQueries({ queryKey: ["global-mission"] });
  }

  async function doAccept() {
    setBusy("accept");
    try {
      const res = (await accept({ data: { suggestionId: suggestion.id } })) as {
        entity: Entity;
        linkedCount: number;
      };
      toast(
        `Opprettet ${res.entity.name}${res.linkedCount ? ` — koblet ${res.linkedCount} signaler` : ""}`,
      );
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    } finally {
      setBusy(null);
    }
  }

  async function doIgnore() {
    setBusy("ignore");
    try {
      await ignore({ data: { suggestionId: suggestion.id } });
      toast("Ignorert");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    } finally {
      setBusy(null);
    }
  }

  async function doSnooze() {
    setBusy("snooze");
    try {
      await snooze({ data: { suggestionId: suggestion.id, preset: "week" } });
      toast("Utsatt i 1 uke");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    } finally {
      setBusy(null);
    }
  }

  const kind = suggestion.metadata?.cluster_kind;
  const kindLabel = kind ? CLUSTER_KIND_LABEL[kind] : "Signal";
  const confBadge =
    suggestion.confidence === "high"
      ? "bg-emerald-500/15 text-emerald-600"
      : suggestion.confidence === "medium"
        ? "bg-amber-500/15 text-amber-600"
        : "bg-muted text-muted-foreground";

  return (
    <li className="rounded-2xl border border-border/60 bg-card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{suggestion.proposed_name}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {ENTITY_TYPE_LABEL[suggestion.proposed_type]}
            </span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${confBadge}`}>
              {suggestion.confidence}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</p>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {suggestion.example_count} signaler · {kindLabel}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={doAccept} disabled={!!busy} className="h-8 gap-1">
          {busy === "accept" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Opprett
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={doSnooze}
          disabled={!!busy}
          className="h-8 gap-1"
        >
          {busy === "snooze" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Clock className="h-3.5 w-3.5" />
          )}
          Ikke nå
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={doIgnore}
          disabled={!!busy}
          className="h-8 gap-1 text-muted-foreground"
        >
          {busy === "ignore" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
          Ignorer
        </Button>
      </div>
    </li>
  );
}

