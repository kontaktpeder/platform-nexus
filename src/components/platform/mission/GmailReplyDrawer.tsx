import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Save, ExternalLink, Loader2, Unlink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MailAttachmentsField } from "@/components/platform/mail/MailAttachmentsField";
import {
  getGmailReplyContext,
  generateGmailReplyDraft,
  saveGmailDraft,
} from "@/lib/gmail-reply.functions";
import type { MailAttachmentPayload } from "@/lib/mail-attachments";

export type GmailReplyDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  // Fallbacks used while the full context is loading.
  fallbackSubject?: string;
  fallbackSender?: string;
  fallbackSnippet?: string;
  onSaved?: (result: { openUrl: string; markHandled: boolean }) => void;
};

type ReplyContext = {
  messageId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  unsubscribe: {
    mailto: string | null;
    url: string | null;
    oneClickUrl?: string | null;
    oneClick?: boolean;
    raw: string | null;
  };
};

export function GmailReplyDrawer({
  open,
  onOpenChange,
  messageId,
  fallbackSubject,
  fallbackSender,
  fallbackSnippet,
  onSaved,
}: GmailReplyDrawerProps) {
  const fetchCtx = useServerFn(getGmailReplyContext);
  const genReply = useServerFn(generateGmailReplyDraft);
  const doSave = useServerFn(saveGmailDraft);

  const [ctx, setCtx] = useState<ReplyContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [instruction, setInstruction] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MailAttachmentPayload[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const loadContext = async () => {
    if (ctxLoading) return;
    if (loadedFor === messageId && ctx) return;
    setCtxLoading(true);
    try {
      const result = (await fetchCtx({ data: { messageId } })) as ReplyContext;
      setCtx(result);
      setLoadedFor(messageId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kunne ikke hente meldingen";
      toast.error(msg);
    } finally {
      setCtxLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSavedUrl(null);
      setReply("");
      setInstruction("");
      setAttachments([]);
      if (loadedFor !== messageId) setCtx(null);
      void loadContext();
    }
    onOpenChange(next);
  };

  const generate = useMutation({
    mutationFn: async () => {
      const source = ctx ?? {
        subject: fallbackSubject ?? "",
        senderName: fallbackSender ?? "",
        snippet: fallbackSnippet ?? "",
      };
      return genReply({
        data: {
          subject: source.subject,
          senderName: source.senderName,
          snippet: source.snippet,
          instruction: instruction.trim() || undefined,
        },
      });
    },
    onSuccess: (r) => setReply(r.reply),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Kunne ikke lage utkast"),
  });

  const save = useMutation({
    mutationFn: async () =>
      doSave({
        data: {
          messageId,
          body: reply,
          attachments: attachments.length ? attachments : undefined,
        },
      }),
    onSuccess: (r) => {
      setSavedUrl(r.openUrl);
      toast.success("Utkast lagret i Gmail");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre utkast"),
  });

  const subject = ctx?.subject ?? fallbackSubject ?? "";
  const senderName = ctx?.senderName ?? fallbackSender ?? "";
  const senderEmail = ctx?.senderEmail ?? "";
  const snippet = ctx?.snippet ?? fallbackSnippet ?? "";
  const unsub = ctx?.unsubscribe;
  const hasUnsub = !!(unsub?.mailto || unsub?.url || unsub?.oneClickUrl);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle className="font-heading text-lg">Svar</SheetTitle>
          <SheetDescription>
            Beskriv hvordan du vil svare — AI lager utkast. Ingenting sendes før du
            godkjenner i Gmail.
          </SheetDescription>
        </SheetHeader>

        <section className="rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Emne
          </div>
          <div className="mt-0.5 font-medium">
            {ctxLoading && !ctx ? "Laster…" : subject || "(uten emne)"}
          </div>
          <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
            Fra
          </div>
          <div className="mt-0.5">
            {senderName}
            {senderEmail && (
              <span className="text-muted-foreground"> · {senderEmail}</span>
            )}
          </div>
          {snippet && (
            <>
              <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
                Utdrag
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                {snippet}
              </p>
            </>
          )}
        </section>

        {hasUnsub && (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <Unlink className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 dark:text-amber-200" />
              <div className="min-w-0 space-y-1.5">
                <p className="font-medium text-amber-950 dark:text-amber-100">
                  Avmelding funnet
                </p>
                <p className="text-xs text-muted-foreground">
                  Du kan melde deg av nyhetsbrevet uten å svare på mailen.
                </p>
                {unsub?.mailto && (
                  <a
                    href={`mailto:${unsub.mailto}`}
                    className="block truncate text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {unsub.mailto}
                  </a>
                )}
                {unsub?.url && (
                  <a
                    href={unsub.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Åpne avmeldingslenke
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {!unsub?.url && unsub?.oneClickUrl && (
                  <p className="text-xs text-muted-foreground">
                    One-click-avmelding finnes — bruk «Meld av» på køkortet (POST).
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="space-y-2">
          <Label htmlFor="reply-instruction">Hvordan vil du svare?</Label>
          <Input
            id="reply-instruction"
            placeholder="F.eks. Takk, foreslå tirsdag 14:00 — eller avvis politisk"
            value={instruction}
            maxLength={500}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={generate.isPending || (ctxLoading && !ctx)}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            Lag utkast
          </Button>
        </div>

        <div className="flex-1 space-y-2">
          <Label htmlFor="reply-body">Svarutkast</Label>
          <Textarea
            id="reply-body"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Skriv selv, eller lag utkast over."
            className="min-h-[220px] resize-y font-sans text-sm"
            maxLength={20000}
          />
          <MailAttachmentsField
            value={attachments}
            onChange={setAttachments}
            disabled={save.isPending || !!savedUrl}
            onError={(m) => toast.error(m)}
          />
          <p className="text-xs text-muted-foreground">
            Ingenting sendes herfra. «Lagre» lager et Gmail-utkast du kan sende derfra.
          </p>
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-row">
          {savedUrl ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onSaved?.({ openUrl: savedUrl, markHandled: true });
                  onOpenChange(false);
                }}
              >
                Ferdig & lukk
              </Button>
              <Button asChild>
                <a href={savedUrl} target="_blank" rel="noreferrer">
                  Åpne i Gmail <ExternalLink className="ml-1 h-4 w-4" />
                </a>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={save.isPending || reply.trim().length === 0}
              onClick={() => save.mutate()}
            >
              {save.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Lagre Gmail-utkast
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
