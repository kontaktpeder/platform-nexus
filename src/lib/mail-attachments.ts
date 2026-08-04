/** Shared client/server attachment payload for Gmail compose/reply. */

export type MailAttachmentPayload = {
  filename: string;
  mimeType: string;
  /** Standard base64 (not url-safe). */
  dataBase64: string;
};

export const MAIL_ATTACHMENT_MAX_FILES = 5;
export const MAIL_ATTACHMENT_MAX_BYTES_EACH = 7 * 1024 * 1024;
export const MAIL_ATTACHMENT_MAX_BYTES_TOTAL = 15 * 1024 * 1024;

export function validateMailAttachments(files: MailAttachmentPayload[]): string | null {
  if (files.length > MAIL_ATTACHMENT_MAX_FILES) {
    return `Maks ${MAIL_ATTACHMENT_MAX_FILES} vedlegg`;
  }
  let total = 0;
  for (const f of files) {
    const name = f.filename?.trim();
    if (!name) return "Vedlegg mangler filnavn";
    if (!f.dataBase64?.trim()) return `Tom fil: ${name}`;
    const approx = Math.floor((f.dataBase64.length * 3) / 4);
    if (approx > MAIL_ATTACHMENT_MAX_BYTES_EACH) {
      return `${name} er for stor (maks 7 MB)`;
    }
    total += approx;
  }
  if (total > MAIL_ATTACHMENT_MAX_BYTES_TOTAL) {
    return "Samlet vedlegg for stort (maks 15 MB)";
  }
  return null;
}

export function attachmentPayloadSchemaShape() {
  return {
    filename: true as const,
    mimeType: true as const,
    dataBase64: true as const,
  };
}
