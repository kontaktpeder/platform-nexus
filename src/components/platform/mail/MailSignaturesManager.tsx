import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { MAIL_TONE_LABEL, type MailTone } from "@/lib/mail-compose";
import {
  buildSignatureHtml,
  buildSignaturePlain,
  type MailSignatureMeta,
} from "@/lib/mail-signature-build";
import { resizeImageFile } from "@/lib/resize-image";
import {
  deleteMailSignature,
  listMailComposeOptions,
  upsertMailSignature,
  type MailSignature,
} from "@/lib/mail-settings.functions";

type Draft = {
  name: string;
  tone: MailTone;
  isDefault: boolean;
  preferredFromEmail: string;
  closing: string;
  fullName: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  /** Freeform fallback when fullName empty (legacy). */
  freeBody: string;
};

const EMPTY: Draft = {
  name: "",
  tone: "professional",
  isDefault: false,
  preferredFromEmail: "",
  closing: "Vennlig hilsen",
  fullName: "",
  phone: "",
  email: "",
  website: "",
  logoUrl: "",
  freeBody: "",
};

function draftFromSignature(s: MailSignature): Draft {
  const m = s.meta;
  if (m) {
    return {
      name: s.name,
      tone: s.tone,
      isDefault: s.isDefault,
      preferredFromEmail: s.preferredFromEmail ?? "",
      closing: m.closing || "Vennlig hilsen",
      fullName: m.fullName,
      phone: m.phone ?? "",
      email: m.email ?? "",
      website: m.website ?? "",
      logoUrl: s.logoUrl ?? "",
      freeBody: "",
    };
  }
  return {
    name: s.name,
    tone: s.tone,
    isDefault: s.isDefault,
    preferredFromEmail: s.preferredFromEmail ?? "",
    closing: "Vennlig hilsen",
    fullName: "",
    phone: "",
    email: "",
    website: "",
    logoUrl: s.logoUrl ?? "",
    freeBody: s.body,
  };
}

/** Manage Nexus email signatures on Profil. */
export function MailSignaturesManager() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const listOpts = useServerFn(listMailComposeOptions);
  const upsert = useServerFn(upsertMailSignature);
  const remove = useServerFn(deleteMailSignature);
  const fileRef = useRef<HTMLInputElement>(null);

  const optsQ = useQuery({
    queryKey: ["mail-compose-options"],
    queryFn: () => listOpts(),
    staleTime: 30_000,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [creating, setCreating] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const previewMeta: MailSignatureMeta | null = draft.fullName.trim()
    ? {
        closing: draft.closing,
        fullName: draft.fullName,
        phone: draft.phone,
        email: draft.email,
        website: draft.website,
      }
    : null;

  const previewHtml = useMemo(() => {
    if (previewMeta) return buildSignatureHtml(previewMeta, draft.logoUrl || null);
    const text = draft.freeBody.trim();
    if (!text && !draft.logoUrl) return "";
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    const logo = draft.logoUrl
      ? `<div style="margin-top:14px;"><img src="${draft.logoUrl.replace(/"/g, "")}" alt="" width="120" style="max-width:120px;height:auto;" /></div>`
      : "";
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#222;">${escaped}${logo}</div>`;
  }, [previewMeta, draft.freeBody, draft.logoUrl]);

  const saveMut = useMutation({
    mutationFn: () => {
      const meta = previewMeta;
      return upsert({
        data: {
          id: editingId,
          name: draft.name.trim(),
          tone: draft.tone,
          isDefault: draft.isDefault,
          preferredFromEmail: draft.preferredFromEmail.trim() || null,
          logoUrl: draft.logoUrl.trim() || null,
          meta: meta
            ? {
                closing: meta.closing,
                fullName: meta.fullName,
                phone: meta.phone || undefined,
                email: meta.email || undefined,
                website: meta.website || undefined,
              }
            : null,
          body: meta ? buildSignaturePlain(meta) : draft.freeBody.trim(),
        },
      });
    },
    onSuccess: async () => {
      toast.success(editingId ? "Signatur oppdatert" : "Signatur lagret");
      setCreating(false);
      setEditingId(null);
      setDraft(EMPTY);
      await qc.invalidateQueries({ queryKey: ["mail-compose-options"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Signatur slettet");
      await qc.invalidateQueries({ queryKey: ["mail-compose-options"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onLogoPick(file: File | null) {
    if (!file || !user) return;
    setUploadingLogo(true);
    try {
      const { blob, mimeType, ext } = await resizeImageFile(file, {
        maxWidth: 280,
        maxHeight: 120,
        quality: 0.85,
      });
      const path = `${user.id}/mail-logo-${editingId ?? "new"}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true,
        contentType: mimeType,
        cacheControl: "86400",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      setDraft((d) => ({ ...d, logoUrl: `${pub.publicUrl}?t=${Date.now()}` }));
      toast.success("Logo lastet opp (komprimert)");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Opplasting feilet";
      toast.error(msg);
    } finally {
      setUploadingLogo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function startEdit(s: MailSignature) {
    setCreating(true);
    setEditingId(s.id);
    setDraft(draftFromSignature(s));
  }

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setDraft(EMPTY);
  }

  const signatures = optsQ.data?.signatures ?? [];
  const senders = optsQ.data?.senders ?? [];
  const canSave =
    !!draft.name.trim() &&
    (!!draft.fullName.trim() || !!draft.freeBody.trim()) &&
    !saveMut.isPending;

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">E-postsignaturer</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bygg signatur med navn, t/e/w og lite logo. Velges før send i Fortell, assistent og kontakt.
          </p>
        </div>
        {!creating && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-xl"
            onClick={startCreate}
          >
            <Plus className="h-3.5 w-3.5" />
            Ny
          </Button>
        )}
      </div>

      {optsQ.isLoading ? (
        <p className="text-xs text-muted-foreground">Laster…</p>
      ) : (
        <ul className="space-y-2">
          {signatures.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {s.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {MAIL_TONE_LABEL[s.tone]}
                    {s.isDefault ? " · standard" : ""}
                    {s.htmlBody ? " · HTML" : ""}
                  </span>
                </p>
                {s.htmlBody ? (
                  <div
                    className="mt-2 max-w-full overflow-hidden text-xs [&_a]:text-foreground [&_img]:max-h-10"
                    dangerouslySetInnerHTML={{ __html: s.htmlBody }}
                  />
                ) : (
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                    {s.body}
                  </pre>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg px-2 text-xs"
                  onClick={() => startEdit(s)}
                >
                  Rediger
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg px-2 text-xs text-destructive"
                  disabled={deleteMut.isPending}
                  onClick={() => {
                    if (window.confirm(`Slette «${s.name}»?`)) deleteMut.mutate(s.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
          {signatures.length === 0 && !creating && (
            <li className="text-xs text-muted-foreground">
              Ingen signaturer ennå — lag f.eks. «Gold · profesjonell» med logo.
            </li>
          )}
        </ul>
      )}

      {creating && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.slice(0, 80) }))}
            placeholder="Navn (f.eks. Gold · profesjonell)"
            className="h-11 rounded-xl"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={draft.tone}
              onValueChange={(v) => setDraft((d) => ({ ...d, tone: v as MailTone }))}
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="professional">Profesjonell</SelectItem>
              </SelectContent>
            </Select>
            {senders.length > 0 && (
              <Select
                value={draft.preferredFromEmail || "__none__"}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    preferredFromEmail: v === "__none__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Koblet avsender (valgfritt)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ingen koblet avsender</SelectItem>
                  {senders.map((s) => (
                    <SelectItem key={s.email} value={s.email}>
                      {s.displayName ? `${s.displayName} <${s.email}>` : s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={draft.closing}
              onChange={(e) => setDraft((d) => ({ ...d, closing: e.target.value.slice(0, 80) }))}
              placeholder="Avslutning (Vennlig hilsen)"
              className="h-11 rounded-xl"
            />
            <Input
              value={draft.fullName}
              onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value.slice(0, 120) }))}
              placeholder="Fullt navn"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value.slice(0, 60) }))}
              placeholder="t  Telefon"
              className="h-11 rounded-xl"
            />
            <Input
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value.slice(0, 120) }))}
              placeholder="e  E-post"
              className="h-11 rounded-xl"
            />
            <Input
              value={draft.website}
              onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value.slice(0, 200) }))}
              placeholder="w  Nettside"
              className="h-11 rounded-xl"
            />
          </div>

          {!draft.fullName.trim() && (
            <Textarea
              value={draft.freeBody}
              onChange={(e) =>
                setDraft((d) => ({ ...d, freeBody: e.target.value.slice(0, 4000) }))
              }
              rows={4}
              placeholder={"Eller fri tekst:\nVennlig hilsen\nPeder"}
              className="rounded-xl text-sm"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onLogoPick(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-xl"
              disabled={uploadingLogo}
              onClick={() => fileRef.current?.click()}
            >
              {uploadingLogo ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              {draft.logoUrl ? "Bytt logo" : "Last opp logo"}
            </Button>
            {draft.logoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 rounded-xl text-xs text-muted-foreground"
                onClick={() => setDraft((d) => ({ ...d, logoUrl: "" }))}
              >
                Fjern logo
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">
              Skaleres automatisk (~120px bredde) — ikke full størrelse.
            </p>
          </div>

          {previewHtml && (
            <div className="rounded-xl border border-dashed border-border bg-muted/15 px-3 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Forhåndsvisning
              </p>
              <div
                className="max-w-md overflow-hidden bg-white p-3 text-sm shadow-sm [&_img]:max-h-16"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
              className="rounded border-border"
            />
            Bruk som standard
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-1 rounded-xl"
              onClick={() => {
                setCreating(false);
                setEditingId(null);
                setDraft(EMPTY);
              }}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl"
              disabled={!canSave}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
