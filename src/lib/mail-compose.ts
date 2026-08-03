/** Shared mail compose helpers (client + server safe). */

export type MailTone = "casual" | "professional";

export const MAIL_TONE_LABEL: Record<MailTone, string> = {
  casual: "Casual",
  professional: "Profesjonell",
};

/** Strip trailing AI sign-offs — Nexus appends the real signature. */
export function stripTrailingSignOff(body: string): string {
  let text = body.replace(/\s+$/u, "");
  const patterns = [
    /\n+(vennlig hilsen|med vennlig hilsen|beste hilsen|hilsen|mvh|mvh\.|regards|best regards|kind regards)\s*[.,!]?\s*$/iu,
  ];
  for (const re of patterns) {
    text = text.replace(re, "");
  }
  return text.replace(/\s+$/u, "");
}

/** Append signature body once (blank line before). */
export function appendMailSignature(
  body: string,
  signatureBody: string | null | undefined,
): string {
  const base = stripTrailingSignOff(body);
  const sig = (signatureBody ?? "").trim();
  if (!sig) return base;
  if (base.endsWith(sig)) return base;
  return `${base}\n\n${sig}`;
}

export function pickDefaultSignatureId<
  T extends { id: string; tone: MailTone; isDefault: boolean; preferredFromEmail: string | null },
>(
  signatures: T[],
  opts?: {
    suggestedTone?: MailTone | null;
    fromEmail?: string | null;
  },
): string | null {
  if (!signatures.length) return null;
  const from = opts?.fromEmail?.trim().toLowerCase() || null;
  const tone = opts?.suggestedTone ?? null;

  if (from && tone) {
    const match = signatures.find(
      (s) => s.tone === tone && s.preferredFromEmail?.toLowerCase() === from,
    );
    if (match) return match.id;
  }
  if (tone) {
    const byTone = signatures.find((s) => s.tone === tone);
    if (byTone) return byTone.id;
  }
  if (from) {
    const byFrom = signatures.find((s) => s.preferredFromEmail?.toLowerCase() === from);
    if (byFrom) return byFrom.id;
  }
  const def = signatures.find((s) => s.isDefault);
  return def?.id ?? signatures[0]?.id ?? null;
}
