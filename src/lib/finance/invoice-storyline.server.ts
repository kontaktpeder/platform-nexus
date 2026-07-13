// Storyline for invoice compose — entity signals + Gmail history to recipient.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

export type StorylineEvent = {
  at: string | null;
  label: string;
  snippet: string | null;
  source: "entity" | "gmail";
};

export type InvoiceStoryline = {
  entityId: string | null;
  entityName: string | null;
  events: StorylineEvent[];
  escalationLevel: 1 | 2 | 3;
  escalationLabel: string;
  suggestedTone: string;
};

const PAYMENT_KEYWORDS =
  /purring|betal|faktura|invoice|payment|inkasso|betalings|forfall|kr\s*\d/i;

function detectEscalation(events: StorylineEvent[]): Pick<
  InvoiceStoryline,
  "escalationLevel" | "escalationLabel" | "suggestedTone"
> {
  const paymentEvents = events.filter(
    (e) => PAYMENT_KEYWORDS.test(`${e.label} ${e.snippet ?? ""}`),
  );
  const n = paymentEvents.length;
  if (n >= 2) {
    return {
      escalationLevel: 3,
      escalationLabel: "Siste purring før videre tiltak",
      suggestedTone:
        "Skriv en tydelig, profesjonell siste purring. Nevn at saken kan oversendes inkasso/skatteetaten dersom betaling ikke mottas snart. Ikke tru — vær faktisk og rolig.",
    };
  }
  if (n === 1) {
    return {
      escalationLevel: 2,
      escalationLabel: "Oppfølging etter tidligere henvendelse",
      suggestedTone:
        "Skriv en tydelig purring som refererer til at du allerede har tatt kontakt. Be om betaling innen kort frist.",
    };
  }
  return {
    escalationLevel: 1,
    escalationLabel: "Første purring",
    suggestedTone: "Skriv en vennlig, profesjonell betalingspåminnelse på norsk.",
  };
}

export async function buildInvoiceStoryline(input: {
  supabase: DB;
  userId: string;
  customerName: string;
  customerEmail: string | null;
  ownerContextSlug?: string | null;
}): Promise<InvoiceStoryline> {
  let entityId: string | null = null;
  let entityName: string | null = null;

  if (input.ownerContextSlug) {
    const { data: entity } = await input.supabase
      .from("entities")
      .select("id, name")
      .eq("user_id", input.userId)
      .eq("slug", input.ownerContextSlug)
      .maybeSingle();
    if (entity) {
      entityId = entity.id as string;
      entityName = entity.name as string;
    }
  }

  const events: StorylineEvent[] = [];

  if (entityId) {
    const { data: signals } = await input.supabase
      .from("entity_signals")
      .select("source, signal_type, snippet, occurred_at, external_ref")
      .eq("user_id", input.userId)
      .eq("entity_id", entityId)
      .order("occurred_at", { ascending: false })
      .limit(15);
    for (const s of signals ?? []) {
      events.push({
        at: (s.occurred_at as string) ?? null,
        label: `${s.source as string}: ${s.signal_type as string}`,
        snippet: (s.snippet as string) ?? null,
        source: "entity",
      });
    }
  }

  if (input.customerEmail) {
    const { searchGmailInvolvingEmail } = await import("@/lib/inbox/gmail-search.server");
    const gmail = await searchGmailInvolvingEmail(input.customerEmail, 8).catch(() => []);
    for (const g of gmail) {
      events.push({
        at: g.occurredAt,
        label: g.subject,
        snippet: g.snippet,
        source: "gmail",
      });
    }
  }

  events.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return tb - ta;
  });

  const escalation = detectEscalation(events);
  return {
    entityId,
    entityName: entityName ?? input.customerName,
    events: events.slice(0, 12),
    ...escalation,
  };
}
