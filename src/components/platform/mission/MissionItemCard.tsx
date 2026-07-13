import { useState } from "react";
import { Check, Mail, Clock, EyeOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  MorningMissionItem,
  MorningBriefItemAction,
  MorningBriefActionOptions,
} from "@/lib/morning-mission.types";
import { suggestHintForItem } from "@/lib/mission-hint-suggest";
import { isInvoiceMissionItem } from "@/lib/mission-invoice-action";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-blue-500",
};

export function MissionItemCard({
  item,
  busy,
  onAction,
  onComposeInvoice,
}: {
  item: MorningMissionItem;
  busy: boolean;
  onAction: (
    itemId: string,
    action: MorningBriefItemAction,
    options?: MorningBriefActionOptions,
  ) => void;
  onComposeInvoice?: (item: MorningMissionItem) => void;
}) {
  const suggestion = suggestHintForItem(item);
  const [doneOpen, setDoneOpen] = useState(false);
  const [remember, setRemember] = useState(suggestion.rememberDefault);
  const [hintText, setHintText] = useState(suggestion.hint.hint_text);

  function submitDone() {
    onAction(item.id, "done", {
      sourceIds: item.source_ids,
      hint: remember
        ? {
            ...suggestion.hint,
            hint_text: hintText.trim() || suggestion.hint.hint_text,
          }
        : undefined,
    });
    setDoneOpen(false);
  }

  return (
    <>
      <article className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.medium}`}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-snug">{item.title}</h3>
            {item.source_label && (
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                {item.source_label}
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">{item.explanation}</p>
            <p className="mt-2 text-sm">
              <span className="font-medium">Neste: </span>
              {item.recommended_action}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {isInvoiceMissionItem(item) && onComposeInvoice && (
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busy}
                  onClick={() => onComposeInvoice(item)}
                >
                  <Mail className="mr-1 h-3 w-3" />
                  Send purring
                </Button>
              )}
              {item.href && (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                >
                  Åpne
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => setDoneOpen(true)}
              >
                <Check className="mr-1 h-3 w-3" />
                Ferdig
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => onAction(item.id, "waiting", { sourceIds: item.source_ids })}
              >
                <Clock className="mr-1 h-3 w-3" />
                Venter
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy}>
                    Mer
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => onAction(item.id, "snoozed", { sourceIds: item.source_ids })}
                  >
                    Utsett til i morgen
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onAction(item.id, "ignored", { sourceIds: item.source_ids })}
                  >
                    <EyeOff className="mr-2 h-3.5 w-3.5" />
                    Ignorer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </article>

      <Dialog open={doneOpen} onOpenChange={setDoneOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Markere som ferdig?</DialogTitle>
            <DialogDescription>
              Dette forsvinner fra listen. Du kan lære Mission å ikke vise lignende ting igjen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={remember}
                onCheckedChange={(v) => setRemember(v === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Husk til neste gang</span>
                <span className="mt-0.5 block text-muted-foreground">
                  Mission bruker dette når den leser e-post og moduler fremover.
                </span>
              </span>
            </label>
            {remember && (
              <Textarea
                value={hintText}
                onChange={(e) => setHintText(e.target.value)}
                rows={3}
                placeholder="F.eks. Jeg har allerede kontaktet Marco på annen måte."
              />
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDoneOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={submitDone} disabled={busy}>
              Ferdig
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
