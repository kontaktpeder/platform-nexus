import type { MorningMissionItem } from "@/lib/morning-mission.types";
import type { MissionHint } from "@/lib/mission-hints.types";

function extractEmails(text: string): string[] {
  const matches = text.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

export function suggestHintForItem(item: MorningMissionItem): {
  hint: MissionHint;
  rememberDefault: boolean;
} {
  const blob = `${item.title} ${item.explanation} ${item.recommended_action}`;
  const emails = extractEmails(blob);

  if (item.title.toLowerCase().includes("kom aldri fram") && emails.length > 0) {
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

  if (item.title.toLowerCase().includes("ubetalt faktura")) {
    return {
      rememberDefault: false,
      hint: {
        match_kind: "tag",
        match_value: "unpaid_invoice",
        hint_text:
          "Jeg følger opp ubetalte fakturaer selv — ikke prioriter dette høyt med mindre det er kritisk.",
      },
    };
  }

  return {
    rememberDefault: true,
    hint: {
      match_kind: "source_id",
      match_value: item.source_ids[0] ?? item.id,
      hint_text: "Jeg trenger ikke å gjøre noe med dette — det er allerede håndtert.",
    },
  };
}
