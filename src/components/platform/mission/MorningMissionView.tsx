import { Loader2, RefreshCw, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  MorningMissionItem,
  MorningMissionPayload,
  MorningMissionResponse,
  MorningBriefItemAction,
  MorningBriefActionOptions,
} from "@/lib/morning-mission.types";
import { WeeklyPlanBoard } from "@/components/platform/mission/WeeklyPlanBoard";
import { DailyPlanSection } from "@/components/platform/mission/DailyPlanSection";

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <span>
          {title} ({count})
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="mt-1 space-y-2">{children}</div>}
    </section>
  );
}

function SimpleList({ items }: { items: { label: string }[] }) {
  return (
    <ul className="space-y-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <li key={i} className="rounded-lg bg-muted/40 px-3 py-2">
          {item.label}
        </li>
      ))}
    </ul>
  );
}

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

  const payload: MorningMissionPayload = data?.payload ?? {
    today: [],
    this_week: [],
    waiting: [],
    closed: [],
    noise: [],
    hygiene: [],
  };

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

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
        <WeeklyPlanBoard
          summary={payload.weekly_summary}
          items={payload.this_week}
          slackStatus={payload.slack_status}
        />

        <DailyPlanSection
          today={payload.today}
          waiting={payload.waiting}
          busyItemId={busyItemId}
          onAction={onAction}
          onComposeInvoice={onComposeInvoice}
        />
      </div>

      <CollapsibleSection title="Lukket / ingen handling" count={payload.closed.length}>
        {payload.closed.map((item) => (
          <div
            key={item.id}
            className="rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
          >
            <span className="font-medium text-foreground">{item.title}</span>
            {item.explanation && <span> — {item.explanation}</span>}
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Støy" count={payload.noise.length}>
        <SimpleList items={payload.noise.map((n) => ({ label: n.label }))} />
      </CollapsibleSection>

      <CollapsibleSection title="Digital hygiene" count={payload.hygiene.length}>
        <SimpleList
          items={payload.hygiene.map((h) => ({
            label: h.count ? `${h.label} (${h.count})` : h.label,
          }))}
        />
      </CollapsibleSection>
    </div>
  );
}
