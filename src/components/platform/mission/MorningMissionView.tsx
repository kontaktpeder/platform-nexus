import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type {
  MorningMissionItem,
  MorningMissionPayload,
  MorningMissionResponse,
  MorningBriefItemAction,
  MorningBriefActionOptions,
} from "@/lib/morning-mission.types";
import { RelationBriefingSection } from "@/components/platform/relation";
import { projectPayloadToRelationBriefing } from "@/lib/relation/project-briefing";

export function MorningMissionView({
  data,
  loading,
  refreshing,
  busyItemId,
  error,
  onRefresh,
  onAction,
  onComposeInvoice,
}: {
  data: MorningMissionResponse | undefined;
  loading: boolean;
  refreshing: boolean;
  busyItemId: string | null;
  error?: Error | null;
  onRefresh: () => void;
  onAction: (
    itemId: string,
    action: MorningBriefItemAction,
    options?: MorningBriefActionOptions,
  ) => void;
  onComposeInvoice?: (item: MorningMissionItem) => void;
}) {
  const payload: MorningMissionPayload = data?.payload ?? {
    today: [],
    this_week: [],
    waiting: [],
    closed: [],
    noise: [],
    hygiene: [],
  };

  const briefing = useMemo(
    () => projectPayloadToRelationBriefing(payload),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on brief identity
    [data?.briefDate, data?.generatedAt, data?.payload],
  );

  const itemsById = useMemo(() => {
    const map = new Map<string, MorningMissionItem>();
    for (const item of [
      ...payload.today,
      ...payload.this_week,
      ...payload.waiting,
      ...payload.closed,
    ]) {
      map.set(item.id, item);
    }
    return map;
  }, [
    data?.briefDate,
    data?.generatedAt,
    data?.payload,
    payload.today,
    payload.this_week,
    payload.waiting,
    payload.closed,
  ]);

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    const isEnvError = error.message.includes("Missing Supabase environment variable");
    return (
      <div className="mt-2 space-y-4">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Kunne ikke laste morgenbrief</p>
          <p className="mt-1">{error.message}</p>
        </div>
        {isEnvError && (
          <section className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Lokal oppsett (én gang)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Åpne Supabase → Project Settings → API</li>
              <li>
                Kopier <span className="font-mono text-xs">service_role</span>-nøkkelen
              </li>
              <li>
                Lim inn i <span className="font-mono text-xs">.env</span> som{" "}
                <span className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY=...</span>
              </li>
              <li>
                Start dev-server på nytt (<span className="font-mono text-xs">Ctrl+C</span>, deretter{" "}
                <span className="font-mono text-xs">npm run dev</span>)
              </li>
            </ol>
          </section>
        )}
        <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          Prøv igjen
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          {data?.fromCache ? "Dagens brief" : "Ny brief generert"}
          {data?.generatedAt && (
            <span>
              ·{" "}
              {new Date(data.generatedAt).toLocaleTimeString("nb-NO", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          Oppdater
        </Button>
      </div>

      <RelationBriefingSection
        briefing={briefing}
        closedItems={payload.closed}
        itemsById={itemsById}
        busyItemId={busyItemId}
        onAction={onAction}
        onComposeInvoice={onComposeInvoice}
      />
    </div>
  );
}
