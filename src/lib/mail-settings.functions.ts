/**
 * Mail senders (Gmail sendAs) + Nexus-managed signatures.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MailTone } from "@/lib/mail-compose";

export type MailSignature = {
  id: string;
  name: string;
  tone: MailTone;
  body: string;
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

function mapSignature(row: {
  id: string;
  name: string;
  tone: string;
  body: string;
  is_default: boolean;
  preferred_from_email: string | null;
  sort_order: number;
}): MailSignature {
  return {
    id: row.id,
    name: row.name,
    tone: (row.tone === "casual" ? "casual" : "professional") as MailTone,
    body: row.body,
    isDefault: row.is_default,
    preferredFromEmail: row.preferred_from_email,
    sortOrder: row.sort_order,
  };
}

export const listMailComposeOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MailComposeOptions> => {
    const { supabase, userId } = context;

    const [{ data: sigRows, error: sigErr }, senders] = await Promise.all([
      supabase
        .from("mail_signatures" as never)
        .select("id, name, tone, body, is_default, preferred_from_email, sort_order")
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
        body: z.string().min(1).max(4000),
        isDefault: z.boolean().optional(),
        preferredFromEmail: z.string().email().nullable().optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
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

    const payload = {
      user_id: userId,
      name: data.name.trim().slice(0, 80),
      tone: data.tone,
      body: data.body.trim().slice(0, 4000),
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
        .select("id, name, tone, body, is_default, preferred_from_email, sort_order")
        .single();
      if (error) throw error;
      return { ok: true, signature: mapSignature(row as never) };
    }

    const { data: row, error } = await supabase
      .from("mail_signatures" as never)
      .insert(payload as never)
      .select("id, name, tone, body, is_default, preferred_from_email, sort_order")
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
