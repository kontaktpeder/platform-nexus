import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAIL_TONE_LABEL,
  pickDefaultSignatureId,
  type MailTone,
} from "@/lib/mail-compose";
import {
  listMailComposeOptions,
  type MailSender,
  type MailSignature,
} from "@/lib/mail-settings.functions";
import { cn } from "@/lib/utils";

export type MailComposeSelection = {
  fromEmail: string | null;
  fromDisplayName: string | null;
  signatureId: string | null;
  signatureBody: string | null;
  signatureHtml: string | null;
};

type Props = {
  disabled?: boolean;
  suggestedTone?: MailTone | null;
  suggestedFromEmail?: string | null;
  /** Bump to re-apply AI suggestions (e.g. new draft). */
  suggestionKey?: string | number;
  className?: string;
  onChange?: (sel: MailComposeSelection) => void;
};

function senderLabel(s: MailSender): string {
  if (s.displayName) return `${s.displayName} <${s.email}>`;
  return s.email;
}

function signatureLabel(s: MailSignature): string {
  return `${s.name} · ${MAIL_TONE_LABEL[s.tone]}`;
}

/**
 * Avsender (Gmail sendAs) + signatur before send/draft.
 * Parent reads selection via onChange / ref-style callback.
 */
export function MailComposeControls({
  disabled,
  suggestedTone,
  suggestedFromEmail,
  suggestionKey,
  className,
  onChange,
}: Props) {
  const listOpts = useServerFn(listMailComposeOptions);
  const optsQ = useQuery({
    queryKey: ["mail-compose-options"],
    queryFn: () => listOpts() as Promise<{ senders: MailSender[]; signatures: MailSignature[] }>,
    staleTime: 60_000,
  });

  const senders = optsQ.data?.senders ?? [];
  const signatures = optsQ.data?.signatures ?? [];

  const [fromEmail, setFromEmail] = useState<string>("");
  const [signatureId, setSignatureId] = useState<string>("");

  // Apply defaults / AI suggestions when options or suggestions change.
  useEffect(() => {
    if (!optsQ.data) return;
    const { senders: ss, signatures: sigs } = optsQ.data;

    let nextFrom =
      (suggestedFromEmail &&
        ss.find((s) => s.email === suggestedFromEmail.toLowerCase())?.email) ||
      ss.find((s) => s.isDefault)?.email ||
      ss.find((s) => s.isPrimary)?.email ||
      ss[0]?.email ||
      "";

    const nextSig =
      pickDefaultSignatureId(sigs, {
        suggestedTone: suggestedTone ?? null,
        fromEmail: nextFrom || null,
      }) ?? "";

    setFromEmail(nextFrom);
    setSignatureId(nextSig);
  }, [optsQ.data, suggestedTone, suggestedFromEmail, suggestionKey]);

  const selection = useMemo((): MailComposeSelection => {
    const sender = senders.find((s) => s.email === fromEmail) ?? null;
    const sig = signatures.find((s) => s.id === signatureId) ?? null;
    return {
      fromEmail: sender?.email ?? (fromEmail || null),
      fromDisplayName: sender?.displayName ?? null,
      signatureId: sig?.id ?? null,
      signatureBody: sig?.body ?? null,
      signatureHtml: sig?.htmlBody ?? null,
    };
  }, [senders, signatures, fromEmail, signatureId]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(selection);
  }, [selection]);

  const sig = signatures.find((s) => s.id === signatureId) ?? null;
  const sigPreviewHtml = sig?.htmlBody?.trim() || null;
  const sigPreview = selection.signatureBody?.trim() || null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Avsender
          </p>
          {senders.length > 0 ? (
            <Select
              value={fromEmail || undefined}
              onValueChange={setFromEmail}
              disabled={disabled || optsQ.isLoading}
            >
              <SelectTrigger className="h-11 w-full rounded-xl bg-background">
                <SelectValue placeholder="Velg avsender" />
              </SelectTrigger>
              <SelectContent>
                {senders.map((s) => (
                  <SelectItem key={s.email} value={s.email}>
                    {senderLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              {optsQ.isLoading
                ? "Henter Gmail-avsendere…"
                : "Ingen Gmail-avsendere funnet — bruker standardkonto."}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Signatur
          </p>
          {signatures.length > 0 ? (
            <Select
              value={signatureId || undefined}
              onValueChange={setSignatureId}
              disabled={disabled || optsQ.isLoading}
            >
              <SelectTrigger className="h-11 w-full rounded-xl bg-background">
                <SelectValue placeholder="Velg signatur" />
              </SelectTrigger>
              <SelectContent>
                {signatures.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {signatureLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              Ingen signaturer ennå.{" "}
              <Link to="/profil" className="font-medium text-primary underline-offset-2 hover:underline">
                Lag på Profil
              </Link>
            </p>
          )}
        </div>
      </div>

      {suggestedTone && (
        <p className="text-xs text-muted-foreground">
          Foreslått tone: {MAIL_TONE_LABEL[suggestedTone]}
        </p>
      )}

      {sigPreviewHtml ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Signatur forhåndsvisning
          </p>
          <div
            className="max-w-full overflow-hidden text-xs leading-relaxed [&_img]:max-h-10"
            dangerouslySetInnerHTML={{ __html: sigPreviewHtml }}
          />
        </div>
      ) : (
        sigPreview && (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Signatur forhåndsvisning
            </p>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground">
              {sigPreview}
            </pre>
          </div>
        )
      )}
    </div>
  );
}
