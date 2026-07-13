import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Link2, X, Sparkles, Wand2, Check, Clock } from "lucide-react";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
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
import {
  scanCommitments,
  listCommitments,
  approveCommitment,
  markCommitmentDone,
  dismissCommitment,
} from "@/lib/knowledge-commitments.functions";
import {
  runContextScan,
  listContextSummaries,
} from "@/lib/context-scan.functions";
import type { ContextSummary } from "@/lib/context/context.types";
import {
  COMMITMENT_CONFIDENCE_LABEL,
  type UserCommitment,
} from "@/lib/knowledge/commitment.types";
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
import { ContextAnchorsSection } from "@/components/platform/knowledge/ContextAnchorsSection";


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
      <GlobalTopBar title="Kunnskap" subtitle="Personer, selskaper og prosjekter" />
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

        <ContextAnchorsSection onOpen={setSelected} />

        <ContextSection />

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
              {entity.metadata?.is_anchor === true && (
                <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                  Dette er en kontekst-anchor for Relationship Engine. Slug og
                  type er reservert.
                </div>
              )}
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
                {entity.metadata?.is_anchor !== true && (
                  <Button
                    onClick={handleDelete}
                    variant="outline"
                    size="sm"
                    className="ml-auto gap-1 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                )}
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

// ─── Commitments (Knowledge v3) ──────────────────────────────────────────────

function CommitmentsSection() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listCommitments);
  const runScan = useServerFn(scanCommitments);
  const runApprove = useServerFn(approveCommitment);
  const runDone = useServerFn(markCommitmentDone);
  const runDismiss = useServerFn(dismissCommitment);

  const [tab, setTab] = useState<"suggested" | "open" | "done">("suggested");
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["knowledge", "commitments", tab],
    queryFn: () =>
      fetchList({ data: { status: [tab] } }) as Promise<UserCommitment[]>,
  });
  const items = q.data ?? [];

  async function doScan() {
    setScanning(true);
    try {
      const res = (await runScan()) as { detected: number };
      toast(`Skannet — ${res.detected} nye forpliktelser`);
      qc.invalidateQueries({ queryKey: ["knowledge", "commitments"] });
      qc.invalidateQueries({ queryKey: ["global-mission"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Skanning feilet");
    } finally {
      setScanning(false);
    }
  }

  async function withBusy(id: string, fn: () => Promise<unknown>, label: string) {
    setBusyId(id);
    try {
      await fn();
      toast(label);
      qc.invalidateQueries({ queryKey: ["knowledge", "commitments"] });
      qc.invalidateQueries({ queryKey: ["global-mission"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-border/60 bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Forpliktelser</h2>
          <p className="text-xs text-muted-foreground">
            Løfter fra Gmail og Slack. Godta for å få dem i Mission når de forfaller.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={doScan}
          disabled={scanning}
          className="gap-1"
        >
          {scanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          Skan
        </Button>
      </header>

      <div className="mb-3 flex gap-1">
        {(["suggested", "open", "done"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "default" : "ghost"}
            onClick={() => setTab(t)}
            className="h-7 px-3 text-xs"
          >
            {t === "suggested" ? "Foreslått" : t === "open" ? "Åpen" : "Ferdig"}
          </Button>
        ))}
      </div>

      {q.isLoading && (
        <div className="grid place-items-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!q.isLoading && items.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Ingen forpliktelser her ennå.
        </p>
      )}

      <ul className="space-y-2">
        {items.map((c) => (
          <li
            key={c.id}
            className="rounded-xl border border-border/60 bg-background p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{c.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{c.source}</span>
                  {c.due_date && <span>· Forfaller {c.due_date}</span>}
                  <span>· {COMMITMENT_CONFIDENCE_LABEL[c.confidence]}</span>
                </div>
                {c.reason && (
                  <p className="mt-1 text-xs text-muted-foreground">{c.reason}</p>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {tab === "suggested" && (
                <>
                  <Button
                    size="sm"
                    disabled={busyId === c.id}
                    onClick={() =>
                      withBusy(
                        c.id,
                        () => runApprove({ data: { id: c.id } }),
                        "Godtatt",
                      )
                    }
                    className="h-7 px-3 text-xs"
                  >
                    Godta
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === c.id}
                    onClick={() =>
                      withBusy(
                        c.id,
                        () => runDismiss({ data: { id: c.id } }),
                        "Avvist",
                      )
                    }
                    className="h-7 px-3 text-xs"
                  >
                    Avvis
                  </Button>
                </>
              )}
              {tab === "open" && (
                <>
                  <Button
                    size="sm"
                    disabled={busyId === c.id}
                    onClick={() =>
                      withBusy(
                        c.id,
                        () => runDone({ data: { id: c.id } }),
                        "Merket som ferdig",
                      )
                    }
                    className="h-7 gap-1 px-3 text-xs"
                  >
                    <Check className="h-3.5 w-3.5" /> Ferdig
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === c.id}
                    onClick={() =>
                      withBusy(
                        c.id,
                        () => runDismiss({ data: { id: c.id } }),
                        "Avvist",
                      )
                    }
                    className="h-7 px-3 text-xs"
                  >
                    Skjul
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Context Scan v1 ────────────────────────────────────────────────────────

function ContextSection() {
  const qc = useQueryClient();
  const list = useServerFn(listContextSummaries);
  const scan = useServerFn(runContextScan);
  const [scanning, setScanning] = useState(false);

  const q = useQuery({
    queryKey: ["context", "summaries"],
    queryFn: () => list({ data: {} }) as Promise<ContextSummary[]>,
  });
  const summaries = q.data ?? [];
  const global = summaries.find((s) => s.scope_type === "global") ?? null;
  const workspaces = summaries.filter((s) => s.scope_type === "workspace");
  const entities = summaries.filter(
    (s) => s.scope_type === "entity" || s.scope_type === "project",
  );
  const lastScan =
    summaries.length > 0
      ? summaries
          .map((s) => s.last_scanned_at)
          .sort()
          .slice(-1)[0]
      : null;

  async function doScan() {
    setScanning(true);
    try {
      const res = (await scan()) as {
        scanned: number;
        global: number;
        workspaces: number;
        entities: number;
      };
      toast(
        `Kontekst oppdatert (${res.scanned} kort · ${res.workspaces} arbeidsflater, ${res.entities} enheter)`,
      );
      qc.invalidateQueries({ queryKey: ["context"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Skanning feilet");
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-border/60 bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Kontekst</h2>
          <p className="text-xs text-muted-foreground">
            Rullende forståelseskort bygget fra signalene dine — bruker samme
            data som Mission.
          </p>
          {lastScan && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Sist skannet {lastScan.slice(0, 16).replace("T", " ")}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={doScan}
          disabled={scanning}
          className="gap-1"
        >
          {scanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          Kjør context scan
        </Button>
      </header>

      {q.isLoading && (
        <div className="grid place-items-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!q.isLoading && summaries.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Kjør en scan for å bygge kontekstkort fra det du allerede har koblet.
        </p>
      )}

      {summaries.length > 0 && (
        <div className="space-y-5">
          {global && (
            <div>
              <SectionLabel>Global oversikt</SectionLabel>
              <ContextCard title="Alle organisasjoner" s={global} />
            </div>
          )}
          {workspaces.length > 0 && (
            <div>
              <SectionLabel>Arbeidsflater</SectionLabel>
              <div className="space-y-2">
                {workspaces.map((s) => (
                  <ContextCard key={s.id} title={s.scope_ref ?? "Arbeidsflate"} s={s} />
                ))}
              </div>
            </div>
          )}
          {entities.length > 0 && (
            <div>
              <SectionLabel>Enheter</SectionLabel>
              <div className="space-y-2">
                {entities.map((s) => (
                  <ContextCard key={s.id} title={s.scope_ref ?? "Enhet"} s={s} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

function ContextCard({ title, s }: { title: string; s: ContextSummary }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </div>
        <div className="text-[10px] text-muted-foreground/80">
          Sist skannet {s.last_scanned_at.slice(0, 16).replace("T", " ")}
        </div>
      </div>
      {s.included_sources.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {s.included_sources.map((src) => (
            <span
              key={src}
              className="rounded-full border border-border/60 px-1.5 py-px text-[10px] text-muted-foreground"
            >
              {src}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-foreground/90">{s.summary}</p>
      {s.key_facts.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {s.key_facts.slice(0, 8).map((f, i) => (
            <li key={i}>· {f}</li>
          ))}
        </ul>
      )}
      {s.open_questions.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs italic text-muted-foreground/80">
          {s.open_questions.slice(0, 3).map((qq, i) => (
            <li key={i}>? {qq}</li>
          ))}
        </ul>
      )}
      {s.suggested_next_focus && (
        <div className="mt-2 text-xs text-foreground/80">
          Neste fokus: {s.suggested_next_focus}
        </div>
      )}
    </div>
  );
}



