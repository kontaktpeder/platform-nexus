import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mail, Paperclip, Send, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getInvoiceComposeContext,
  generateInvoiceEmailDraft,
  sendInvoiceEmail,
} from "@/lib/invoice-compose.functions";
import type { InvoiceComposeContext } from "@/lib/finance/invoice-compose.server";
import { formatEmailList, parseEmailList } from "@/lib/email-recipients";

export type InvoiceComposeSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  orgSlug: string;
  briefItemId?: string;
  onSent?: () => void;
};

export function InvoiceComposeSheet({
  open,
  onOpenChange,
  invoiceId,
  orgSlug,
  briefItemId,
  onSent,
}: InvoiceComposeSheetProps) {
  const fetchCtx = useServerFn(getInvoiceComposeContext);
  const genDraft = useServerFn(generateInvoiceEmailDraft);
  const doSend = useServerFn(sendInvoiceEmail);

  const [ctx, setCtx] = useState<InvoiceComposeContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [instruction, setInstruction] = useState("");
  const [replyInThread, setReplyInThread] = useState(true);
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => {
    if (!open) {
      setCtx(null);
      setBody("");
      setConfirmSend(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchCtx({ data: { invoiceId, orgSlug } })
      .then((result) => {
        if (cancelled) return;
        setCtx(result);
        setTo(result.defaultTo);
        setCc(result.defaultCc);
        setSubject(result.defaultSubject);
        setReplyInThread(result.useReplyInThread);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Kunne ikke laste faktura");
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId, orgSlug, fetchCtx, onOpenChange]);

  const generate = useMutation({
    mutationFn: () =>
      genDraft({
        data: {
          invoiceId,
          orgSlug,
          to,
          cc: cc.trim() || undefined,
          subject,
          instruction: instruction.trim() || undefined,
        },
      }),
    onSuccess: (r) => setBody(r.body),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Kunne ikke generere utkast"),
  });

  const send = useMutation({
    mutationFn: () =>
      doSend({
        data: {
          invoiceId,
          orgSlug,
          to,
          cc: cc.trim() || undefined,
          subject,
          body,
          briefItemId,
          replyInThread: replyInThread && !!ctx?.replyThread,
          threadId: ctx?.replyThread?.threadId,
          inReplyTo: ctx?.replyThread?.rfcMessageId,
          references: ctx?.replyThread?.references,
        },
      }),
    onSuccess: () => {
      toast.success("E-post sendt");
      onSent?.();
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Kunne ikke sende e-post"),
  });

  function addRecipient(email: string) {
    const current = parseEmailList(to);
    if (current.includes(email.toLowerCase())) return;
    setTo(formatEmailList([...current, email]));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-heading text-lg">Send purring fra Mission</SheetTitle>
          <SheetDescription>
            Legg til flere mottakere og svar i samme tråd. PDF vedlegges når du sender.
          </SheetDescription>
        </SheetHeader>

        {loading || !ctx ? (
          <div className="grid flex-1 place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <section className="rounded-xl border bg-muted/30 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {ctx.storyline.escalationLabel}
              </p>
              <p className="mt-1 font-medium">
                {ctx.invoice.customer_name} ·{" "}
                {ctx.invoice.invoice_number ? `#${ctx.invoice.invoice_number}` : "faktura"}
              </p>
              {ctx.replyThread && (
                <p className="mt-2 rounded-md bg-background/80 px-2 py-1.5 text-xs text-muted-foreground">
                  Fant tråd: {ctx.replyThread.label}
                </p>
              )}
            </section>

            <div className="space-y-3">
              {ctx.replyThread && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={replyInThread}
                    onCheckedChange={(v) => setReplyInThread(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Svar i samme Gmail-tråd</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      E-posten havner i lenken du har hatt med Vår, Bernhard og andre i tråden.
                    </span>
                  </span>
                </label>
              )}

              <div className="space-y-1">
                <Label htmlFor="inv-to">Til (flere adresser med komma)</Label>
                <Input
                  id="inv-to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="faktura@kunde.no, bernhard@..., vaar@..."
                  className="font-mono text-xs"
                />
                {ctx.replyThread && ctx.replyThread.participantEmails.length > 1 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ctx.replyThread.participantEmails.map((email) => (
                      <button
                        key={email}
                        type="button"
                        className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                        onClick={() => addRecipient(email)}
                      >
                        + {email}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="inv-cc">Kopi (valgfritt)</Label>
                <Input
                  id="inv-cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="epost@eksempel.no, ..."
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inv-subject">Emne</Label>
                <Input
                  id="inv-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inv-instruction">Ekstra instruks (valgfritt)</Label>
                <Input
                  id="inv-instruction"
                  placeholder="F.eks. Nevn at neste steg er inkasso"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-1"
                  disabled={generate.isPending}
                  onClick={() => generate.mutate()}
                >
                  {generate.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  Generer forslag
                </Button>
              </div>

              <div className="space-y-1">
                <Label htmlFor="inv-body">Forhåndsvisning</Label>
                <Textarea
                  id="inv-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[220px] font-sans text-sm"
                  placeholder="Generer forslag, eller skriv selv."
                />
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" />
                Vedlegg: {ctx.pdfFilename}
              </div>
            </div>

            <section className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Mail className="h-4 w-4" />
                Forhåndsvisning før sending
              </div>
              <p className="mt-1 text-muted-foreground">
                Sjekk mottakere, emne og tekst. Ingenting sendes før du trykker Send nå.
              </p>
            </section>
          </>
        )}

        <SheetFooter className="flex-col gap-2 sm:flex-row">
          {!confirmSend ? (
            <Button
              type="button"
              disabled={!body.trim() || !to || send.isPending || loading}
              onClick={() => setConfirmSend(true)}
            >
              <Send className="mr-1 h-4 w-4" />
              Gå videre til sending
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setConfirmSend(false)}>
                Tilbake
              </Button>
              <Button
                type="button"
                disabled={send.isPending || !body.trim()}
                onClick={() => send.mutate()}
              >
                {send.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                Send nå
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
