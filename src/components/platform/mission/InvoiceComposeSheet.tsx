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
import {
  getInvoiceComposeContext,
  generateInvoiceEmailDraft,
  sendInvoiceEmail,
} from "@/lib/invoice-compose.functions";
import type { InvoiceComposeContext } from "@/lib/finance/invoice-compose.server";

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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [instruction, setInstruction] = useState("");
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
        setSubject(result.defaultSubject);
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
        data: { invoiceId, orgSlug, to, subject, body, briefItemId },
      }),
    onSuccess: () => {
      toast.success("E-post sendt");
      onSent?.();
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Kunne ikke sende e-post"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-heading text-lg">Send purring fra Mission</SheetTitle>
          <SheetDescription>
            Forhåndsvis utkastet her. PDF fra Finance legges ved automatisk når du sender.
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
              <p className="mt-1 text-muted-foreground">
                {ctx.storyline.entityName && (
                  <span className="block">Kontekst: {ctx.storyline.entityName}</span>
                )}
                Beløp: {Math.round(ctx.invoice.total).toLocaleString("nb-NO")} kr
                {ctx.invoice.due_date && (
                  <span>
                    {" "}
                    · Forfall{" "}
                    {new Date(ctx.invoice.due_date).toLocaleDateString("nb-NO")}
                  </span>
                )}
              </p>
              {ctx.storyline.events.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                  {ctx.storyline.events.slice(0, 5).map((e, i) => (
                    <li key={i}>
                      {e.at ? new Date(e.at).toLocaleDateString("nb-NO") : "?"} — {e.label}
                      {e.source === "gmail" && e.snippet ? `: ${e.snippet.slice(0, 60)}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="inv-to">Til</Label>
                <Input id="inv-to" value={to} onChange={(e) => setTo(e.target.value)} />
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
                Sjekk mottaker, emne og tekst. E-posten sendes fra din Gmail når du bekrefter.
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
