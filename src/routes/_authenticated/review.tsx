import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Users, Link2, Compass, CheckCircle2, XCircle, GitMerge, RefreshCw } from "lucide-react";
import { TopBar } from "@/components/platform/TopBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listReviewFeed,
  acceptEntitySuggestionV2,
  rejectEntitySuggestion,
  mergeEntitySuggestion,
  acceptRelationSuggestion,
  rejectRelationSuggestion,
  type ReviewFeed,
  type ReviewItem,
  type ReviewEntityItem,
  type ReviewRelationItem,
} from "@/lib/review.functions";
import { OWNER_CONTEXT_LABEL, ENTITY_TYPE_LABEL, RELATIONSHIP_LABEL, type OwnerContext } from "@/lib/knowledge/types";
import { parseNewRawSignals } from "@/lib/parse-signals.functions";
import { ingestRecentSignals } from "@/lib/ingest.functions";

export const Route = createFileRoute("/_authenticated/review")({
  component: ReviewPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-sm">Ikke funnet.</div>,
});

const OWNER_OPTIONS: (OwnerContext | "unknown")[] = ["unknown", "personal", "peder-enk", "gold-of-sicily"];

function ReviewPage() {
  const fetchFeed = useServerFn(listReviewFeed);
  const qc = useQueryClient();
  const query = useQuery<ReviewFeed>({
    queryKey: ["review-feed"],
    queryFn: () => fetchFeed() as Promise<ReviewFeed>,
  });

  const runIngest = useServerFn(ingestRecentSignals);
  const runParse = useServerFn(parseNewRawSignals);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null);

  const runFullPipeline = async () => {
    setRunningPipeline(true);
    setPipelineMsg(null);
    try {
      const ing = await runIngest({ data: {} });
      const parse = await runParse({ data: { limit: 20 } });
      const g = (ing as { gmail?: { inserted?: number } }).gmail?.inserted ?? 0;
      const s = (ing as { slack?: { inserted?: number } }).slack?.inserted ?? 0;
      setPipelineMsg(
        `Hentet ${g + s} nye signaler · Parsed ${parse.parsed}/${parse.scanned} · ${parse.entitySuggestions} entity-forslag · ${parse.relationSuggestions} relasjons-forslag`,
      );
      await qc.invalidateQueries({ queryKey: ["review-feed"] });
    } catch (err) {
      setPipelineMsg(err instanceof Error ? err.message : "Feil ved pipeline");
    } finally {
      setRunningPipeline(false);
    }
  };

  const items = query.data?.items ?? [];
  const counts = query.data?.counts ?? { total: 0, entities: 0, relations: 0, context: 0 };
  const existingEntities = query.data?.existingEntities ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar
        title="Review"
        subtitle="AI-innboks — ingenting skrives før du godkjenner"
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6 pb-28 sm:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />{counts.total} åpne</Badge>
          <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" />{counts.entities} entiteter</Badge>
          <Badge variant="secondary" className="gap-1"><Compass className="h-3 w-3" />{counts.context} kontekst</Badge>
          <Badge variant="secondary" className="gap-1"><Link2 className="h-3 w-3" />{counts.relations} relasjoner</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["review-feed"] })}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Oppdater
            </Button>
            <Button size="sm" onClick={runFullPipeline} disabled={runningPipeline}>
              {runningPipeline ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              Kjør inntak + parse
            </Button>
          </div>
        </div>
        {pipelineMsg && (
          <div className="mb-4 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {pipelineMsg}
          </div>
        )}

        {query.isLoading && (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {query.error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(query.error as Error).message}
          </div>
        )}
        {!query.isLoading && items.length === 0 && (
          <EmptyReview onRun={runFullPipeline} running={runningPipeline} />
        )}

        <ul className="space-y-3">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              {item.kind === "entity" ? (
                <EntityReviewCard item={item} existingEntities={existingEntities} />
              ) : (
                <RelationReviewCard item={item} />
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function EmptyReview({ onRun, running }: { onRun: () => void; running: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
      <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Alt er gjennomgått.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Kjør inntak + parse for å oppdage nye entiteter og relasjoner fra Gmail og Slack.
      </p>
      <Button size="sm" className="mt-4" onClick={onRun} disabled={running}>
        {running ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
        Kjør nå
      </Button>
    </div>
  );
}

function KindBadge({ item }: { item: ReviewItem }) {
  if (item.kind === "relation") return <Badge className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/10">Relasjon</Badge>;
  const e = item as ReviewEntityItem;
  if (e.ownerContext) return <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/10">Kontekst</Badge>;
  return <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">Entitet</Badge>;
}

function SourceBadge({ signal }: { signal: ReviewEntityItem["signal"] | ReviewRelationItem["signal"] }) {
  if (!signal) return null;
  const label = signal.source.charAt(0).toUpperCase() + signal.source.slice(1);
  const meta = signal.metadata ?? {};
  const sourceType = typeof meta.source_type === "string" ? meta.source_type : null;
  const channelName = typeof meta.channel_name === "string" ? meta.channel_name : null;
  return (
    <>
      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{label}</Badge>
      {channelName && (
        <Badge variant="outline" className="text-[10px]">#{channelName}</Badge>
      )}
      {sourceType === "slack_channel" && (
        <Badge className="bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/10 text-[10px]" variant="secondary">
          kanal-whitelist
        </Badge>
      )}
    </>
  );
}

function ConfidenceChip({ level }: { level: "low" | "medium" | "high" | number | null }) {
  let label = "";
  let cls = "bg-muted text-muted-foreground";
  if (typeof level === "string") {
    label = level === "high" ? "Høy" : level === "medium" ? "Middels" : "Lav";
    cls = level === "high" ? "bg-emerald-500/10 text-emerald-700"
      : level === "medium" ? "bg-amber-500/10 text-amber-700"
      : "bg-muted text-muted-foreground";
  } else if (typeof level === "number") {
    label = `${Math.round(level * 100)}%`;
    cls = level >= 0.75 ? "bg-emerald-500/10 text-emerald-700"
      : level >= 0.5 ? "bg-amber-500/10 text-amber-700"
      : "bg-muted text-muted-foreground";
  } else {
    return null;
  }
  return <Badge className={`${cls} hover:${cls}`} variant="secondary">{label}</Badge>;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">{children}</div>;
}

function EntityReviewCard({ item, existingEntities }: { item: ReviewEntityItem; existingEntities: { id: string; name: string; type: string }[] }) {
  const qc = useQueryClient();
  const accept = useServerFn(acceptEntitySuggestionV2);
  const reject = useServerFn(rejectEntitySuggestion);
  const merge = useServerFn(mergeEntitySuggestion);

  const [ownerContext, setOwnerContext] = useState<OwnerContext>(
    (item.ownerContext ?? "unknown") as OwnerContext,
  );
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [pending, setPending] = useState<null | "accept" | "reject" | "merge">(null);
  const [err, setErr] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["review-feed"] });

  const mAccept = useMutation({
    mutationFn: () => accept({ data: { suggestionId: item.id, ownerContext } }),
    onMutate: () => { setPending("accept"); setErr(null); },
    onSuccess: () => invalidate(),
    onError: (e: Error) => setErr(e.message),
    onSettled: () => setPending(null),
  });
  const mReject = useMutation({
    mutationFn: () => reject({ data: { suggestionId: item.id } }),
    onMutate: () => { setPending("reject"); setErr(null); },
    onSuccess: () => invalidate(),
    onError: (e: Error) => setErr(e.message),
    onSettled: () => setPending(null),
  });
  const mMerge = useMutation({
    mutationFn: () => merge({ data: { suggestionId: item.id, targetEntityId: mergeTarget } }),
    onMutate: () => { setPending("merge"); setErr(null); },
    onSuccess: () => { setMergeOpen(false); invalidate(); },
    onError: (e: Error) => setErr(e.message),
    onSettled: () => setPending(null),
  });

  const candidates = useMemo(
    () => existingEntities.filter((e) => e.type === item.proposedType),
    [existingEntities, item.proposedType],
  );

  return (
    <CardShell>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <KindBadge item={item} />
        <Badge variant="outline">{ENTITY_TYPE_LABEL[item.proposedType]}</Badge>
        <ConfidenceChip level={item.confidence} />
        <SourceBadge source={item.signal?.source} />
        <span className="ml-auto text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("nb-NO")}</span>
      </div>
      <h3 className="text-base font-semibold leading-tight">{item.proposedName}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
      {item.signal?.summary && (
        <p className="mt-2 line-clamp-2 rounded bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          {item.signal.summary}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">Kontekst</label>
        <select
          value={ownerContext}
          onChange={(e) => setOwnerContext(e.target.value as OwnerContext)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          {OWNER_OPTIONS.map((o) => (
            <option key={o} value={o}>{OWNER_CONTEXT_LABEL[o]}</option>
          ))}
        </select>
      </div>

      {mergeOpen && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/40 p-2">
          <label className="text-xs text-muted-foreground">Slå sammen med</label>
          <select
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">Velg entitet …</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMergeOpen(false)}>Avbryt</Button>
            <Button
              size="sm"
              disabled={!mergeTarget || pending === "merge"}
              onClick={() => mMerge.mutate()}
            >
              {pending === "merge" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <GitMerge className="mr-1 h-3.5 w-3.5" />}
              Slå sammen
            </Button>
          </div>
        </div>
      )}

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => mAccept.mutate()} disabled={pending !== null}>
          {pending === "accept" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
          Opprett
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMergeOpen((v) => !v)} disabled={pending !== null || candidates.length === 0}>
          <GitMerge className="mr-1 h-3.5 w-3.5" /> Slå sammen
        </Button>
        <Button size="sm" variant="ghost" onClick={() => mReject.mutate()} disabled={pending !== null}>
          <XCircle className="mr-1 h-3.5 w-3.5" /> Ignorer
        </Button>
      </div>
    </CardShell>
  );
}

function RelationReviewCard({ item }: { item: ReviewRelationItem }) {
  const qc = useQueryClient();
  const accept = useServerFn(acceptRelationSuggestion);
  const reject = useServerFn(rejectRelationSuggestion);
  const [pending, setPending] = useState<null | "accept" | "reject">(null);
  const [err, setErr] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["review-feed"] });

  const bothResolved = item.fromResolved && item.toResolved;

  const mAccept = useMutation({
    mutationFn: () => accept({ data: { suggestionId: item.id } }),
    onMutate: () => { setPending("accept"); setErr(null); },
    onSuccess: () => invalidate(),
    onError: (e: Error) => setErr(e.message),
    onSettled: () => setPending(null),
  });
  const mReject = useMutation({
    mutationFn: () => reject({ data: { suggestionId: item.id } }),
    onMutate: () => { setPending("reject"); setErr(null); },
    onSuccess: () => invalidate(),
    onError: (e: Error) => setErr(e.message),
    onSettled: () => setPending(null),
  });

  return (
    <CardShell>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <KindBadge item={item} />
        <Badge variant="outline">{RELATIONSHIP_LABEL[item.relationType]}</Badge>
        <ConfidenceChip level={item.confidence} />
        <SourceBadge source={item.signal?.source} />
        <span className="ml-auto text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("nb-NO")}</span>
      </div>
      <p className="text-sm">
        <span className="font-semibold">{item.from.label}</span>
        <span className="mx-2 text-muted-foreground">{RELATIONSHIP_LABEL[item.relationType]}</span>
        <span className="font-semibold">{item.to.label}</span>
      </p>
      {item.reason && <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>}
      {!bothResolved && (
        <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
          Godkjenn tilhørende entitets-forslag først.
        </p>
      )}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => mAccept.mutate()} disabled={pending !== null || !bothResolved}>
          {pending === "accept" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
          Godkjenn
        </Button>
        <Button size="sm" variant="ghost" onClick={() => mReject.mutate()} disabled={pending !== null}>
          <XCircle className="mr-1 h-3.5 w-3.5" /> Avvis
        </Button>
        <Link
          to="/knowledge"
          className="ml-auto text-xs text-muted-foreground hover:underline"
        >
          Knowledge →
        </Link>
      </div>
    </CardShell>
  );
}
