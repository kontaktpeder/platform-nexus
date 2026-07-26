import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { StartHereBlock, RelationCard } from "@/components/platform/relation";
import type { RelationBriefing, RelationCardModel } from "@/lib/relation/types";
import type {
  MorningBriefItemAction,
  MorningBriefActionOptions,
  MorningMissionItem,
} from "@/lib/morning-mission.types";

function Section({
  title,
  count,
  defaultOpen = true,
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
    <section className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left"
      >
        <h2 className="text-sm font-semibold text-foreground">
          {title}{" "}
          <span className="font-normal text-muted-foreground">({count})</span>
        </h2>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </section>
  );
}

function primaryLabelFor(card: RelationCardModel): string {
  if (card.sourceKind === "gmail") return "Svar på e-post";
  if (card.sourceKind === "finance") return "Åpne Finance";
  if (card.status === "new_unconfirmed") return "Bekreft kontakt";
  return "Gå til handling";
}

export function RelationBriefingSection({
  briefing,
  itemsById,
  busyItemId,
  onAction,
  onComposeInvoice,
}: {
  briefing: RelationBriefing;
  itemsById: Map<string, MorningMissionItem>;
  busyItemId: string | null;
  onAction: (
    itemId: string,
    action: MorningBriefItemAction,
    options?: MorningBriefActionOptions,
  ) => void;
  onComposeInvoice?: (item: MorningMissionItem) => void;
}) {
  function handlePrimary(card: RelationCardModel) {
    const itemId = card.briefItemId ?? card.id;
    const item = itemsById.get(itemId);
    if (item && onComposeInvoice && /faktura|invoice/i.test(`${item.title} ${item.id}`)) {
      onComposeInvoice(item);
      return;
    }
    if (card.href?.startsWith("http")) {
      window.open(card.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (item) {
      // Soft default: mark path via recommended action UI — open detail if linked.
      if (card.entityId) {
        window.location.assign(`/kontakter/${card.entityId}`);
        return;
      }
      onAction(item.id, "done", { sourceIds: item.source_ids });
    }
  }

  const empty =
    !briefing.startHere &&
    briefing.needsFollowUp.length === 0 &&
    briefing.upcoming.length === 0 &&
    briefing.unresolved.length === 0 &&
    briefing.system.length === 0;

  if (empty) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-6 text-center shadow-sm">
        <p className="text-sm font-medium">Ingen som trenger deg akkurat nå.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Når mail, Slack eller Felt knyttes til en kontakt, lander det her.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0" aria-label="Relasjonsbrief">
      <header className="mb-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Hvem trenger deg
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Relasjonen eier kortet — kilden er bare metadata.
        </p>
      </header>

      {briefing.startHere && (
        <StartHereBlock
          card={briefing.startHere}
          primaryLabel={primaryLabelFor(briefing.startHere)}
          onPrimary={
            busyItemId === (briefing.startHere.briefItemId ?? briefing.startHere.id)
              ? undefined
              : () => handlePrimary(briefing.startHere!)
          }
        />
      )}

      <Section title="Trenger oppfølging" count={briefing.needsFollowUp.length}>
        {briefing.needsFollowUp.map((card) => (
          <RelationCard
            key={card.id}
            card={card}
            primaryLabel={primaryLabelFor(card)}
            onPrimary={
              busyItemId === (card.briefItemId ?? card.id)
                ? undefined
                : () => handlePrimary(card)
            }
          />
        ))}
      </Section>

      <Section title="Kommende" count={briefing.upcoming.length} defaultOpen={false}>
        {briefing.upcoming.map((card) => (
          <RelationCard key={card.id} card={card} primaryLabel={primaryLabelFor(card)} />
        ))}
      </Section>

      <Section title="Uavklart" count={briefing.unresolved.length} defaultOpen={false}>
        {briefing.unresolved.map((card) => (
          <RelationCard
            key={card.id}
            card={card}
            primaryLabel={primaryLabelFor(card)}
            onPrimary={() => {
              if (card.href) window.location.assign(card.href);
            }}
          />
        ))}
      </Section>

      <Section title="System" count={briefing.system.length} defaultOpen={false}>
        {briefing.system.map((card) => (
          <RelationCard key={card.id} card={card} />
        ))}
      </Section>
    </div>
  );
}
