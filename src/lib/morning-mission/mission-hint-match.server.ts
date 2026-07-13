import type { MorningMissionItem } from "@/lib/morning-mission.types";
import type { MissionHint, MissionHintMatchKind } from "@/lib/mission-hints.types";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";

function extractEmails(text: string): string[] {
  const matches = text.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

export function signalMatchesHint(signal: MissionSignal, hint: MissionHint): boolean {
  const value = hint.match_value.toLowerCase().trim();
  switch (hint.match_kind as MissionHintMatchKind) {
    case "from_email":
      return String(signal.meta?.from_email ?? "").toLowerCase() === value;
    case "to_email": {
      const hay = `${signal.subject} ${signal.snippet} ${signal.meta?.to ?? ""}`.toLowerCase();
      return hay.includes(value);
    }
    case "subject_contains":
      return signal.subject.toLowerCase().includes(value);
    case "tag":
      return signal.tags.includes(value);
    case "source_id":
      return signal.id === value;
    default:
      return false;
  }
}

export function dropSignalsByHints(
  signals: MissionSignal[],
  hints: MissionHint[],
): { kept: MissionSignal[]; dropped: string[] } {
  const dropped: string[] = [];
  const kept = signals.filter((s) => {
    const matched = hints.some((h) => signalMatchesHint(s, h));
    if (matched) dropped.push(s.id);
    return !matched;
  });
  return { kept, dropped };
}

export function suggestHintForItem(
  item: MorningMissionItem,
  signals: MissionSignal[],
): { hint: MissionHint; rememberDefault: boolean } | null {
  const linked = item.source_ids
    .map((id) => signals.find((s) => s.id === id))
    .filter((s): s is MissionSignal => !!s);

  if (linked.length === 0) return null;

  const primary = linked[0];
  const emails = extractEmails(`${item.title} ${item.explanation} ${item.recommended_action} ${primary.snippet}`);

  if (primary.tags.includes("delivery_failure") && emails.length > 0) {
    const to = emails[0];
    return {
      rememberDefault: true,
      hint: {
        match_kind: "to_email",
        match_value: to,
        hint_text: `Jeg har allerede tatt kontakt med ${to} på annen måte. Ikke vis leveringsfeil til denne adressen som noe jeg må gjøre.`,
      },
    };
  }

  if (primary.meta?.from_email) {
    const from = String(primary.meta.from_email).toLowerCase();
    return {
      rememberDefault: true,
      hint: {
        match_kind: "from_email",
        match_value: from,
        hint_text: `Ikke vis e-post fra ${from} som noe jeg må gjøre nå — jeg har allerede håndtert det.`,
      },
    };
  }

  if (primary.tags.includes("unpaid_invoice")) {
    return {
      rememberDefault: false,
      hint: {
        match_kind: "tag",
        match_value: "unpaid_invoice",
        hint_text: "Jeg følger opp ubetalte fakturaer selv — ikke prioriter dette høyt med mindre det er kritisk.",
      },
    };
  }

  return {
    rememberDefault: true,
    hint: {
      match_kind: "source_id",
      match_value: primary.id,
      hint_text: "Jeg trenger ikke å gjøre noe med dette — det er allerede håndtert.",
    },
  };
}
