import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Save, ExternalLink, Loader2 } from "lucide-react";
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
import {
  getGmailReplyContext,
  generateGmailReplyDraft,
  saveGmailDraft,
} from "@/lib/gmail-reply.functions";

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

  // Load context lazily when the drawer opens.
  const loadContext = async () => {
    if (ctx || ctxLoading) return;
    setCtxLoading(true);
    try {
      const result = await fetchCtx({ data: { messageId } });
      setCtx(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load message";
      toast.error(msg);
    } finally {
      setCtxLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSavedUrl(null);
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
      toast.error(e instanceof Error ? e.message : "Could not generate reply"),
  });

  const save = useMutation({
    mutationFn: async () => doSave({ data: { messageId, body: reply } }),
    onSuccess: (r) => {
      setSavedUrl(r.openUrl);
      toast.success("Draft saved to Gmail");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not save draft"),
  });

  const subject = ctx?.subject ?? fallbackSubject ?? "";
  const senderName = ctx?.senderName ?? fallbackSender ?? "";
  const senderEmail = ctx?.senderEmail ?? "";
  const snippet = ctx?.snippet ?? fallbackSnippet ?? "";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle className="font-heading text-lg">Draft reply</SheetTitle>
          <SheetDescription>
            AI helps you draft. Nothing is sent — we save it as a Gmail draft you
            can review and send from Gmail.
          </SheetDescription>
        </SheetHeader>

        <section className="rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Subject
          </div>
          <div className="mt-0.5 font-medium">
            {ctxLoading && !ctx ? "Loading…" : subject || "(no subject)"}
          </div>
          <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
            From
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
                Context
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                {snippet}
              </p>
            </>
          )}
        </section>

        <div className="space-y-2">
          <Label htmlFor="reply-instruction">Instruction (optional)</Label>
          <Input
            id="reply-instruction"
            placeholder="e.g. Politely decline, propose Tuesday 14:00"
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
            Generate suggested reply
          </Button>
        </div>

        <div className="flex-1 space-y-2">
          <Label htmlFor="reply-body">Reply</Label>
          <Textarea
            id="reply-body"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write your reply, or generate a suggestion above."
            className="min-h-[260px] resize-y font-sans text-sm"
            maxLength={20000}
          />
          <p className="text-xs text-muted-foreground">
            Nothing is sent. Saving creates a Gmail draft you can review in Gmail.
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
                Mark handled & close
              </Button>
              <Button asChild>
                <a href={savedUrl} target="_blank" rel="noreferrer">
                  Open draft in Gmail <ExternalLink className="ml-1 h-4 w-4" />
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
              Save Gmail draft
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
