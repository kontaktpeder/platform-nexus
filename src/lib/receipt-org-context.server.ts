/** Resolve Knowledge anchor / org profile for receipt AI (per Finance org). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ANCHOR_DEFINITIONS } from "@/lib/knowledge/anchors";
import { ANCHOR_SLUGS, type AnchorSlug } from "@/lib/knowledge/types";

export type ReceiptOrgContext = {
  name: string;
  summary: string;
  ownerContext: string;
  source: "entity" | "anchor_def" | "finance_name";
};

function matchAnchorSlug(orgSlug: string | null | undefined, orgName: string | null | undefined): AnchorSlug | null {
  const slug = (orgSlug ?? "").toLowerCase();
  const name = (orgName ?? "").toLowerCase();
  for (const s of ANCHOR_SLUGS) {
    if (slug === s || slug.includes(s) || name.includes(s.replace(/-/g, " "))) return s;
  }
  if (/gold|sicily|gos/i.test(slug) || /gold of sicily|sicily/i.test(name)) {
    return "gold-of-sicily";
  }
  if (/peder|enk/i.test(slug) || /enk/i.test(name)) return "peder-enk";
  return null;
}

export async function resolveReceiptOrgContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { orgSlug?: string | null; financeOrgName?: string | null },
): Promise<ReceiptOrgContext | null> {
  const orgSlug = input.orgSlug?.trim() || null;
  const financeName = input.financeOrgName?.trim() || null;

  // 1) Live Knowledge entity linked to Platform org slug
  if (orgSlug) {
    const { data: byMeta } = await supabase
      .from("entities")
      .select("name, summary, owner_context, metadata, slug")
      .eq("user_id", userId)
      .contains("metadata", { platform_org_slug: orgSlug } as never)
      .limit(1)
      .maybeSingle();
    if (byMeta?.name) {
      const metaSummary =
        typeof (byMeta.metadata as { industry?: string } | null)?.industry === "string"
          ? (byMeta.metadata as { industry: string }).industry
          : null;
      const summary = [byMeta.summary, metaSummary].filter(Boolean).join(" · ");
      return {
        name: byMeta.name as string,
        summary: summary || ANCHOR_DEFINITIONS["gold-of-sicily"]?.summary || "",
        ownerContext: (byMeta.owner_context as string) || "unknown",
        source: "entity",
      };
    }
  }

  // 2) Anchor entity by reserved slug
  const anchorSlug = matchAnchorSlug(orgSlug, financeName);
  if (anchorSlug) {
    const { data: anchor } = await supabase
      .from("entities")
      .select("name, summary, owner_context")
      .eq("user_id", userId)
      .eq("slug", anchorSlug)
      .maybeSingle();

    let contextExtra = "";
    const { data: ctx } = await supabase
      .from("context_summaries")
      .select("summary")
      .eq("user_id", userId)
      .eq("scope_ref", anchorSlug)
      .order("last_scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (typeof ctx?.summary === "string" && ctx.summary.trim()) {
      contextExtra = ctx.summary.trim().slice(0, 400);
    }

    const def = ANCHOR_DEFINITIONS[anchorSlug];
    const name = (anchor?.name as string) || def.name;
    // Prefer current anchor definition (source of truth) + optional context scan.
    const summary = [def.summary, contextExtra].filter(Boolean).join(" · ");
    return {
      name,
      summary,
      ownerContext: (anchor?.owner_context as string) || def.owner_context,
      source: anchor ? "entity" : "anchor_def",
    };
  }

  // 3) Fallback: Finance display name only
  if (financeName) {
    return {
      name: financeName,
      summary: "Norsk virksomhet — bokfør som driftskostnad, ikke privathusholdning.",
      ownerContext: "unknown",
      source: "finance_name",
    };
  }
  return null;
}

export function buildReceiptSystemPrompt(org: ReceiptOrgContext | null): string {
  const orgBlock = org
    ? [
        `VIRKSOMHET (fra Nexus Knowledge): «${org.name}».`,
        `Profil: ${org.summary}`,
        "Skriv description og category som driftskostnad for DENNE virksomheten — aldri som privat husholdning/dagligvarer hjemme, med mindre profilen eksplisitt er personlig.",
        "Vær konkret: hva ble kjøpt og til hvilket driftsformål (råvarer, emballasje, catering, utstyr, transport, osv.).",
      ].join("\n")
    : "Virksomhetsprofil ukjent — anta norsk bedrift, ikke privathusholdning.";

  return `Du er en regnskapsassistent for norske organisasjoner. Du analyserer kvitteringer/fakturaer og foreslår en finance_entry.
${orgBlock}

Bruk norske MVA-satser (0, 12, 15, 25). amount_net = amount_gross - vat_amount. ISO-dato YYYY-MM-DD. Du skal IKKE bokføre — kun foreslå.

Svar KUN med ett JSON-objekt (ingen markdown, ingen forklaring) på dette skjemaet:
{
  "entry_type": "income" | "expense",
  "entry_date": "YYYY-MM-DD",
  "counterparty": string | null,
  "description": string,
  "category": string | null,
  "category_group": string | null,
  "amount_gross": number,
  "vat_rate": number,
  "vat_amount": number,
  "amount_net": number,
  "payment_status": "paid" | "unpaid" | "partial",
  "invoice_status": "none" | "draft" | "sent" | "overdue" | "paid",
  "pre_company_expense": boolean,
  "notes": string | null,
  "extracted_text": string,
  "confidence": [ { "field": string, "score": number, "note": string | null } ]
}
Bruk rene tall (uten tusenskilletegn). vat_rate som prosent (f.eks. 25 for 25%). Kvitteringer er typisk expense og ofte payment_status paid. Hvis et felt er ukjent, gjett konservativt og sett lav score i confidence.`;
}
