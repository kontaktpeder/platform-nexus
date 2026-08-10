/**
 * Mail senders (Gmail sendAs) + Nexus-managed signatures.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MailTone } from "@/lib/mail-compose";
import {
  buildSignatureHtml,
  buildSignaturePlain,
  parseMailSignatureMeta,
  type MailSignatureMeta,
} from "@/lib/mail-signature-build";

export type MailSignature = {
  id: string;
  name: string;
  tone: MailTone;
  body: string;
  htmlBody: string | null;
  logoUrl: string | null;
  meta: MailSignatureMeta | null;
  isDefault: boolean;
  preferredFromEmail: string | null;
  sortOrder: number;
};

export type MailSender = {
  email: string;
  displayName: string | null;
  isPrimary: boolean;
  isDefault: boolean;
};

export type MailComposeOptions = {
  senders: MailSender[];
  signatures: MailSignature[];
};

const Tone = z.enum(["casual", "professional"]);

const MetaSchema = z.object({
  closing: z.string().max(80),
  fullName: z.string().min(1).max(120),
  phone: z.string().max(60).optional(),
  email: z.string().max(120).optional(),
  website: z.string().max(200).optional(),
});

function mapSignature(row: {
  id: string;
  name: string;
  tone: string;
  body: string;
  html_body?: string | null;
  logo_url?: string | null;
  meta?: unknown;
  is_default: boolean;
  preferred_from_email: string | null;
  sort_order: number;
}): MailSignature {
  return {
    id: row.id,
    name: row.name,
    tone: (row.tone === "casual" ? "casual" : "professional") as MailTone,
    body: row.body,
    htmlBody: row.html_body?.trim() || null,
    logoUrl: row.logo_url?.trim() || null,
    meta: parseMailSignatureMeta(row.meta),
    isDefault: row.is_default,
    preferredFromEmail: row.preferred_from_email,
    sortOrder: row.sort_order,
  };
}

const SIG_SELECT =
  "id, name, tone, body, html_body, logo_url, meta, is_default, preferred_from_email, sort_order";

export const listMailComposeOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MailComposeOptions> => {
    const { supabase, userId } = context;

    const [{ data: sigRows, error: sigErr }, senders] = await Promise.all([
      supabase
        .from("mail_signatures" as never)
        .select(SIG_SELECT)
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      import("@/lib/inbox/gmail.server")
        .then((g) => g.listGmailSendAs())
        .catch(() => [] as MailSender[]),
    ]);

    if (sigErr) throw sigErr;

    const signatures = ((sigRows ?? []) as Array<{
      id: string;
      name: string;
      tone: string;
      body: string;
      html_body: string | null;
      logo_url: string | null;
      meta: unknown;
      is_default: boolean;
      preferred_from_email: string | null;
      sort_order: number;
    }>).map(mapSignature);

    return {
      senders: senders.map((s) => ({
        email: s.email,
        displayName: s.displayName,
        isPrimary: s.isPrimary,
        isDefault: s.isDefault,
      })),
      signatures,
    };
  });

export const upsertMailSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        name: z.string().min(1).max(80),
        tone: Tone,
        /** Legacy / freeform plain body (used when meta omitted). */
        body: z.string().max(4000).optional(),
        meta: MetaSchema.nullable().optional(),
        logoUrl: z.string().max(2000).nullable().optional(),
        htmlBody: z.string().max(20000).nullable().optional(),
        isDefault: z.boolean().optional(),
        preferredFromEmail: z.string().email().nullable().optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      })
      .refine((d) => !!(d.meta?.fullName?.trim() || d.body?.trim()), {
        message: "Signatur trenger navn eller tekst",
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; signature: MailSignature }> => {
    const { supabase, userId } = context;
    const isDefault = !!data.isDefault;

    if (isDefault) {
      await supabase
        .from("mail_signatures" as never)
        .update({ is_default: false } as never)
        .eq("user_id", userId)
        .eq("is_default", true);
    }

    const meta = data.meta
      ? {
          closing: data.meta.closing.trim() || "Vennlig hilsen",
          fullName: data.meta.fullName.trim(),
          phone: data.meta.phone?.trim() || "",
          email: data.meta.email?.trim() || "",
          website: data.meta.website?.trim() || "",
        }
      : null;

    const logoUrl = data.logoUrl?.trim() || null;
    let body = (data.body ?? "").trim();
    let htmlBody = (data.htmlBody ?? "").trim() || null;

    if (meta) {
      body = buildSignaturePlain(meta);
      htmlBody = buildSignatureHtml(meta, logoUrl);
    } else if (!htmlBody && body) {
      // Plain legacy: optional logo under escaped text
      const { escapeHtml } = await import("@/lib/mail-signature-build");
      const escaped = escapeHtml(body).replace(/\n/g, "<br>\n");
      htmlBody = logoUrl
        ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#222;">${escaped}<div style="margin-top:14px;"><img src="${escapeHtml(logoUrl)}" alt="" width="120" style="display:block;max-width:120px;height:auto;border:0;" /></div></div>`
        : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#222;">${escaped}</div>`;
    }

    if (!body) throw new Error("Signaturtekst mangler");

    const payload = {
      user_id: userId,
      name: data.name.trim().slice(0, 80),
      tone: data.tone,
      body: body.slice(0, 4000),
      html_body: htmlBody ? htmlBody.slice(0, 20000) : null,
      logo_url: logoUrl,
      meta: meta,
      is_default: isDefault,
      preferred_from_email: data.preferredFromEmail?.trim().toLowerCase() || null,
      sort_order: data.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: row, error } = await supabase
        .from("mail_signatures" as never)
        .update(payload as never)
        .eq("id", data.id)
        .eq("user_id", userId)
        .select(SIG_SELECT)
        .single();
      if (error) throw error;
      return { ok: true, signature: mapSignature(row as never) };
    }

    const { data: row, error } = await supabase
      .from("mail_signatures" as never)
      .insert(payload as never)
      .select(SIG_SELECT)
      .single();
    if (error) throw error;
    return { ok: true, signature: mapSignature(row as never) };
  });

export const deleteMailSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("mail_signatures" as never)
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });
