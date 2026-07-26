import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { RelationCard } from "@/components/platform/relation";
import { GmailReplyDrawer } from "@/components/platform/mission/GmailReplyDrawer";
import { parseGmailMessageIdFromKey } from "@/components/platform/mission/useGmailMessageId";
import { isInvoiceMissionItem } from "@/lib/mission-invoice-action";
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

function gmailMessageIdFromItem(item: MorningMissionItem | undefined): string | null {
  if (!item) return null;
  for (const sid of item.source_ids) {
    const id = parseGmailMessageIdFromKey(sid);
    if (id) return id;
  }
  return parseGmailMessageIdFromKey(item.id);
}

function primaryLabelFor(card: RelationCardModel, item?: MorningMissionItem): string {
  if (item && isInvoiceMissionItem(item)) return "Send purring";
  if (gmailMessageIdFromItem(item) || card.sourceKind === "gmail") return "Svar på e-post";
  if (card.sourceKind === "finance") return "Åpne Finance";
  if (card.sourceKind === "slack") return "Åpne Slack";
  if (card.sourceKind === "felt") return "Logg i Felt";
  if (card.sourceKind === "work") return "Åpne Work";
  if (card.status === "new_unconfirmed") return "Bekreft kontakt";
  if (card.entityId) return "Åpne kontakt";
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
  const navigate = useNavigate();
  const [reply, setReply] = useState<{
    messageId: string;
    itemId: string;
    sourceIds: string[];
    subject?: string;
    sender?: string;
    snippet?: string;
  } | null>(null);

  function itemFor(card: RelationCardModel): MorningMissionItem | undefined {
    return itemsById.get(card.briefItemId ?? card.id);
  }

  function isBusy(card: RelationCardModel): boolean {
    return busyItemId === (card.briefItemId ?? card.id);
  }

  function handlePrimary(card: RelationCardModel) {
    const item = itemFor(card);

    if (item && onComposeInvoice && isInvoiceMissionItem(item)) {
      onComposeInvoice(item);
      return;
    }

    const gmailId = gmailMessageIdFromItem(item);
    if (gmailId) {
      setReply({
        messageId: gmailId,
        itemId: item!.id,
        sourceIds: item!.source_ids,
        subject: item?.title ?? card.name,
        sender: item?.source_label ?? card.subtitle ?? undefined,
        snippet: item?.explanation ?? card.whyNow,
      });
      return;
    }

    if (card.href?.startsWith("http")) {
      window.open(card.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (item?.href?.startsWith("http")) {
      window.open(item.href, "_blank", "noopener,noreferrer");
      return;
    }

    if (card.sourceKind === "felt") {
      if (card.entityId) {
        void navigate({ to: "/kontakter/$entityId", params: { entityId: card.entityId } });
      } else {
        void navigate({ to: "/field" });
      }
      return;
    }

    if (card.status === "new_unconfirmed") {
      void navigate({ to: "/review" });
      return;
    }

    if (card.entityId) {
      void navigate({ to: "/kontakter/$entityId", params: { entityId: card.entityId } });
      return;
    }

    if (card.href) {
      window.location.assign(card.href);
    }
  }

  function handleDone(card: RelationCardModel) {
    const item = itemFor(card);
    if (!item) return;
    onAction(item.id, "done", { sourceIds: item.source_ids });
  }

  function renderCard(card: RelationCardModel, featured = false) {
    const item = itemFor(card);
    const busy = isBusy(card);
    return (
      <RelationCard
        key={card.id}
        card={card}
        featured={featured}
        primaryLabel={primaryLabelFor(card, item)}
        onPrimary={busy ? undefined : () => handlePrimary(card)}
        onDone={item && !busy ? () => handleDone(card) : undefined}
      />
    );
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
          Relasjonen eier kortet — trykk for å handle, ikke bare se.
        </p>
      </header>

      {briefing.startHere && renderCard(briefing.startHere, true)}

      <Section title="Trenger oppfølging" count={briefing.needsFollowUp.length}>
        {briefing.needsFollowUp.map((card) => renderCard(card))}
      </Section>

      <Section title="Kommende" count={briefing.upcoming.length} defaultOpen={false}>
        {briefing.upcoming.map((card) => renderCard(card))}
      </Section>

      <Section title="Uavklart" count={briefing.unresolved.length} defaultOpen={false}>
        {briefing.unresolved.map((card) => renderCard(card))}
      </Section>

      <Section title="System" count={briefing.system.length} defaultOpen={false}>
        {briefing.system.map((card) => (
          <RelationCard key={card.id} card={card} />
        ))}
      </Section>

      {reply && (
        <GmailReplyDrawer
          open={!!reply}
          onOpenChange={(open) => {
            if (!open) setReply(null);
          }}
          messageId={reply.messageId}
          fallbackSubject={reply.subject}
          fallbackSender={reply.sender}
          fallbackSnippet={reply.snippet}
          onSaved={({ markHandled }) => {
            if (markHandled) {
              onAction(reply.itemId, "done", { sourceIds: reply.sourceIds });
            }
            setReply(null);
          }}
        />
      )}
    </div>
  );
}
