/** Build plain + HTML email signatures (client + server safe). */

export type MailSignatureMeta = {
  closing: string;
  fullName: string;
  phone?: string;
  email?: string;
  website?: string;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeWebsite(raw: string): { href: string; label: string } | null {
  const t = raw.trim();
  if (!t) return null;
  const href = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  const label = t.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return { href, label };
}

export function parseMailSignatureMeta(raw: unknown): MailSignatureMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fullName = typeof o.fullName === "string" ? o.fullName.trim() : "";
  if (!fullName) return null;
  return {
    closing: typeof o.closing === "string" ? o.closing.trim() : "Vennlig hilsen",
    fullName,
    phone: typeof o.phone === "string" ? o.phone.trim() : "",
    email: typeof o.email === "string" ? o.email.trim() : "",
    website: typeof o.website === "string" ? o.website.trim() : "",
  };
}

/** Plain-text signature body. */
export function buildSignaturePlain(meta: MailSignatureMeta): string {
  const lines: string[] = [];
  const closing = meta.closing.trim() || "Vennlig hilsen";
  lines.push(closing.endsWith(",") ? closing : `${closing},`);
  lines.push("");
  lines.push(meta.fullName.trim());
  const phone = meta.phone?.trim();
  const email = meta.email?.trim();
  const web = meta.website?.trim();
  if (phone || email || web) {
    lines.push("");
    if (phone) lines.push(`t  ${phone}`);
    if (email) lines.push(`e  ${email}`);
    if (web) {
      const w = normalizeWebsite(web);
      if (w) lines.push(`w  ${w.label}`);
    }
  }
  return lines.join("\n").trim();
}

/** Compact HTML signature (table-based for email clients). */
export function buildSignatureHtml(
  meta: MailSignatureMeta,
  logoUrl?: string | null,
): string {
  const closing = escapeHtml(
    (meta.closing.trim() || "Vennlig hilsen").replace(/,$/, "") + ",",
  );
  const name = escapeHtml(meta.fullName.trim());
  const phone = meta.phone?.trim();
  const email = meta.email?.trim();
  const web = normalizeWebsite(meta.website ?? "");
  const logo = (logoUrl ?? "").trim();

  const contactRows: string[] = [];
  if (phone) {
    contactRows.push(
      `<tr><td style="padding:1px 0;color:#888;font-size:12px;width:18px;vertical-align:top;">t</td><td style="padding:1px 0;color:#333;font-size:13px;">${escapeHtml(phone)}</td></tr>`,
    );
  }
  if (email) {
    contactRows.push(
      `<tr><td style="padding:1px 0;color:#888;font-size:12px;width:18px;vertical-align:top;">e</td><td style="padding:1px 0;font-size:13px;"><a href="mailto:${escapeHtml(email)}" style="color:#333;text-decoration:none;">${escapeHtml(email)}</a></td></tr>`,
    );
  }
  if (web) {
    contactRows.push(
      `<tr><td style="padding:1px 0;color:#888;font-size:12px;width:18px;vertical-align:top;">w</td><td style="padding:1px 0;font-size:13px;"><a href="${escapeHtml(web.href)}" style="color:#333;text-decoration:none;">${escapeHtml(web.label)}</a></td></tr>`,
    );
  }

  const contactBlock =
    contactRows.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border-collapse:collapse;">${contactRows.join("")}</table>`
      : "";

  const logoBlock = logo
    ? `<div style="margin-top:14px;"><img src="${escapeHtml(logo)}" alt="" width="120" style="display:block;max-width:120px;height:auto;border:0;outline:none;" /></div>`
    : "";

  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#222;">`,
    `<p style="margin:0 0 12px 0;">${closing}</p>`,
    `<p style="margin:0;font-weight:600;font-size:15px;color:#111;">${name}</p>`,
    contactBlock,
    logoBlock,
    `</div>`,
  ].join("");
}

/** Escape plain body to simple HTML paragraphs (no signature). */
export function plainBodyToHtml(body: string): string {
  const escaped = escapeHtml(body.replace(/\s+$/u, ""))
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "<br>\n");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222;">${escaped}</div>`;
}
