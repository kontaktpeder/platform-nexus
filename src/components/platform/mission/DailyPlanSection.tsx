import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type {
  MorningMissionItem,
  MorningBriefItemAction,
  MorningBriefActionOptions,
} from "@/lib/morning-mission.types";
import { MissionItemCard } from "@/components/platform/mission/MissionItemCard";

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
    <section className="mt-6">
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
      {open && <div className="mt-1 space-y-3">{children}</div>}
    </section>
  );
}

export function DailyPlanSection({
  today,
  waiting,
  busyItemId,
  onAction,
  onComposeInvoice,
}: {
  today: MorningMissionItem[];
  waiting: MorningMissionItem[];
  busyItemId: string | null;
  onAction: (
    itemId: string,
    action: MorningBriefItemAction,
    options?: MorningBriefActionOptions,
  ) => void;
  onComposeInvoice?: (item: MorningMissionItem) => void;
}) {
  const dailyCount = today.length + waiting.length;

  return (
    <section aria-label="Dagsplan" className="min-w-0">
      <header className="mb-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          I dag
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {dailyCount === 0
            ? "Ingenting krever deg akkurat nå."
            : `${today.length} ${today.length === 1 ? "ting" : "ting"} å gjøre i dag`}
        </p>
      </header>

      {today.length > 0 ? (
        <div className="space-y-3">
          {today.map((item) => (
            <MissionItemCard
              key={item.id}
              item={item}
              busy={busyItemId === item.id}
              onAction={onAction}
              onComposeInvoice={onComposeInvoice}
            />
          ))}
        </div>
      ) : dailyCount === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-6 text-center shadow-sm">
          <p className="text-sm font-medium">Alt ser greit ut i dag.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sjekk ukeplanen for det som gjelder resten av uka.
          </p>
        </div>
      ) : null}

      <CollapsibleSection title="Venter på andre" count={waiting.length} defaultOpen={today.length === 0}>
        {waiting.map((item) => (
          <MissionItemCard
            key={item.id}
            item={item}
            busy={busyItemId === item.id}
            onAction={onAction}
            onComposeInvoice={onComposeInvoice}
          />
        ))}
      </CollapsibleSection>
    </section>
  );
}
