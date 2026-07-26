import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RelationCard } from "@/components/platform/relation/RelationCard";
import {
  RelationFilterChips,
  type RelationListFilter,
} from "@/components/platform/relation/RelationFilterChips";
import { GmailReplyDrawer } from "@/components/platform/mission/GmailReplyDrawer";
import { parseGmailMessageIdFromKey } from "@/components/platform/mission/useGmailMessageId";
import { isInvoiceMissionItem } from "@/lib/mission-invoice-action";
import type { RelationBriefing, RelationCardModel } from "@/lib/relation/types";
import type {
  MorningBriefItemAction,
  MorningBriefActionOptions,
  MorningMissionItem,
} from "@/lib/morning-mission.types";

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

function closedToCards(items: MorningMissionItem[]): RelationCardModel[] {
  return items.map((item) => ({
    id: item.id,
    entityId: item.entity_id ?? null,
    entityType: item.entity_type ?? null,
    name: item.relation_name ?? item.title,
    subtitle: item.relation_subtitle ?? null,
    whyNow: item.explanation,
    nextAction: item.recommended_action,
    status: "quiet" as const,
    ownerContext: item.owner_context ?? null,
    sourceKind: item.source_kind ?? null,
    sourceLabel: item.source_label ?? null,
    imageUrl: item.image_url ?? null,
    href: item.href ?? (item.entity_id ? `/kontakter/${item.entity_id}` : null),
    priority: item.priority,
    briefItemId: item.id,
  }));
}

export function RelationBriefingSection({
  briefing,
  closedItems = [],
  itemsById,
  busyItemId,
  onAction,
  onComposeInvoice,
}: {
  briefing: RelationBriefing;
  closedItems?: MorningMissionItem[];
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
  const [filter, setFilter] = useState<RelationListFilter>("all");
  const [reply, setReply] = useState<{
    messageId: string;
    itemId: string;
    sourceIds: string[];
    subject?: string;
    sender?: string;
    snippet?: string;
  } | null>(null);

  const doneCards = useMemo(() => closedToCards(closedItems), [closedItems]);

  const activeCards = useMemo(() => {
    const list: RelationCardModel[] = [];
    if (briefing.startHere) list.push(briefing.startHere);
    list.push(...briefing.needsFollowUp, ...briefing.upcoming, ...briefing.unresolved);
    return list;
  }, [briefing]);

  const quietCards = useMemo(
    () => [...briefing.system, ...activeCards.filter((c) => c.status === "quiet")],
    [briefing.system, activeCards],
  );

  const counts = useMemo(() => {
    const waiting = activeCards.filter((c) => c.status === "waiting_on_me").length;
    const upcoming = activeCards.filter(
      (c) => c.status === "upcoming" || c.status === "waiting_on_them",
    ).length;
    return {
      all: activeCards.length,
      waiting_on_me: waiting,
      upcoming,
      quiet: quietCards.length,
      done: doneCards.length,
    } satisfies Partial<Record<RelationListFilter, number>>;
  }, [activeCards, quietCards, doneCards]);

  const visible = useMemo(() => {
    if (filter === "done") return { featured: null as RelationCardModel | null, rest: doneCards };
    if (filter === "quiet") return { featured: null, rest: quietCards };
    if (filter === "waiting_on_me") {
      const rest = activeCards.filter((c) => c.status === "waiting_on_me");
      return { featured: null, rest };
    }
    if (filter === "upcoming") {
      const rest = activeCards.filter(
        (c) => c.status === "upcoming" || c.status === "waiting_on_them",
      );
      return { featured: null, rest };
    }
    // all — keep Start her featured when present
    const rest = activeCards.filter((c) => c.id !== briefing.startHere?.id);
    return { featured: briefing.startHere, rest };
  }, [filter, activeCards, quietCards, doneCards, briefing.startHere]);

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
    const canAct = filter !== "done" && !!item && !busy;
    return (
      <RelationCard
        key={card.id}
        card={card}
        featured={featured}
        primaryLabel={primaryLabelFor(card, item)}
        onPrimary={canAct ? () => handlePrimary(card) : undefined}
        onDone={canAct ? () => handleDone(card) : undefined}
      />
    );
  }

  const empty =
    !visible.featured &&
    visible.rest.length === 0 &&
    filter === "all" &&
    activeCards.length === 0 &&
    quietCards.length === 0 &&
    doneCards.length === 0;

  const sectionTitle =
    filter === "all"
      ? "Viktigste relasjoner i dag"
      : filter === "waiting_on_me"
        ? "Venter på meg"
        : filter === "upcoming"
          ? "Kommende"
          : filter === "quiet"
            ? "Ingen aktivitet"
            : "Fullført i dag";

  return (
    <div className="min-w-0" aria-label="Relasjonsbrief">
      <header className="mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Hvem trenger deg
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Relasjonen eier kortet — trykk for å handle, ikke bare se.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-1 mb-4 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <RelationFilterChips value={filter} onChange={setFilter} counts={counts} />
      </div>

      <h3 className="mb-3 text-base font-semibold text-foreground">{sectionTitle}</h3>

      {empty ? (
        <div className="rounded-2xl border border-border/60 bg-card p-6 text-center shadow-sm">
          <p className="text-sm font-medium">Ingen som trenger deg akkurat nå.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Når mail, Slack eller Felt knyttes til en kontakt, lander det her.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.featured && renderCard(visible.featured, true)}
          {visible.rest.map((card) => renderCard(card))}
          {visible.featured === null && visible.rest.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Ingen i denne listen.
            </p>
          )}
        </div>
      )}

      {filter === "all" && briefing.unresolved.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          {briefing.unresolved.length} uavklart
          {briefing.unresolved.length === 1 ? "" : "e"} — bruk filter eller Review.
        </p>
      )}

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
