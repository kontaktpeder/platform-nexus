/** Nexus-side receipt AI (same Gemini as Mission) — Entry-compatible suggestion for Finance. */
import { generateText } from "ai";
import { z } from "zod";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";

const ConfidenceItem = z.object({
  field: z.string(),
  score: z.number(),
  note: z.string().nullable().optional(),
});

export const ReceiptSuggestionSchema = z.object({
  entry_type: z.enum(["income", "expense"]),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  counterparty: z.string().nullable(),
  description: z.string().min(1),
  category: z.string().nullable(),
  category_group: z.string().nullable(),
  amount_gross: z.number(),
  vat_rate: z.number(),
  vat_amount: z.number(),
  amount_net: z.number(),
  payment_status: z.enum(["paid", "unpaid", "partial"]),
  invoice_status: z.enum(["none", "draft", "sent", "overdue", "paid"]),
  pre_company_expense: z.boolean(),
  notes: z.string().nullable(),
  extracted_text: z.string().optional(),
  confidence: z.array(ConfidenceItem).optional(),
});

export type ReceiptSuggestion = z.infer<typeof ReceiptSuggestionSchema>;

const SYSTEM_PROMPT = `Du er en regnskapsassistent for norske organisasjoner. Du analyserer kvitteringer/fakturaer og foreslår en finance_entry. Bruk norske MVA-satser (0, 12, 15, 25). amount_net = amount_gross - vat_amount. ISO-dato YYYY-MM-DD. Du skal IKKE bokføre — kun foreslå.

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

function extractJson(raw: string): unknown {
  let s = (raw ?? "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const i = s.indexOf("{");
    const j = s.lastIndexOf("}");
    if (i !== -1 && j > i) s = s.slice(i, j + 1);
  }
  return JSON.parse(s);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function scanReceiptWithGemini(input: {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}): Promise<ReceiptSuggestion> {
  if (!getGeminiApiKey()) {
    throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY)");
  }
  if (input.bytes.length === 0) throw new Error("Tom fil");
  if (input.bytes.length > 25 * 1024 * 1024) throw new Error("Fil for stor (maks 25 MB)");

  const mime = (input.mimeType || "application/octet-stream").split(";")[0].trim();
  const base64 = bytesToBase64(input.bytes);
  const intro = `Analyser vedlagt ${mime === "application/pdf" ? "PDF" : "bilde"} (filnavn: ${input.fileName}) og returner JSON-objektet. Dette er ÉN kvittering/ett bilag.`;

  const content: Array<Record<string, unknown>> = [{ type: "text", text: intro }];
  if (mime === "application/pdf") {
    content.push({
      type: "file",
      data: `data:${mime};base64,${base64}`,
      mediaType: mime,
    });
  } else {
    content.push({
      type: "image",
      image: `data:${mime};base64,${base64}`,
    });
  }

  const result = await generateText({
    model: getGeminiModel("flash"),
    // Gemini rejects role:"system" in messages — use top-level system like rest of Nexus.
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: content as never }],
  });

  let parsed: unknown;
  try {
    parsed = extractJson(result.text);
  } catch {
    throw new Error("AI returnerte ugyldig JSON");
  }
  const validated = ReceiptSuggestionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      "AI-format ugyldig: " +
        validated.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "),
    );
  }
  return validated.data;
}
