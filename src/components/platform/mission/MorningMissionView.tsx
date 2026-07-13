import { useState } from "react";
import {
  Check,
  Mail,
  Clock,
  EyeOff,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
} from "lucide-react";
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
  MorningMissionPayload,
  MorningMissionResponse,
  MorningBriefItemAction,
  MorningBriefActionOptions,
} from "@/lib/morning-mission.types";
import { suggestHintForItem } from "@/lib/mission-hint-suggest";
import { isInvoiceMissionItem, parseInvoiceFromMissionItem } from "@/lib/mission-invoice-action";
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

function MissionItemCard({
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
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.medium}`} />
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
                  <DropdownMenuItem onSelect={() => onAction(item.id, "snoozed", { sourceIds: item.source_ids })}>
                    Utsett til i morgen
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onAction(item.id, "ignored", { sourceIds: item.source_ids })}>
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

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <span>
          {title} ({count})
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="mt-1 space-y-2">{children}</div>}
    </section>
  );
}

function SimpleList({ items }: { items: { label: string }[] }) {
  return (
    <ul className="space-y-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <li key={i} className="rounded-lg bg-muted/40 px-3 py-2">
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function MorningMissionView({
  data,
  loading,
  refreshing,
  busyItemId,
  error,
  onRefresh,
  onAction,
  onComposeInvoice,
}: {
  data: MorningMissionResponse | undefined;
  loading: boolean;
  refreshing: boolean;
  busyItemId: string | null;
  error?: Error | null;
  onRefresh: () => void;
  onAction: (
    itemId: string,
    action: MorningBriefItemAction,
    options?: MorningBriefActionOptions,
  ) => void;
  onComposeInvoice?: (item: MorningMissionItem) => void;
}) {
  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    const isEnvError = error.message.includes("Missing Supabase environment variable");
    return (
      <div className="mt-2 space-y-4">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Kunne ikke laste morgenbrief</p>
          <p className="mt-1">{error.message}</p>
        </div>
        {isEnvError && (
          <section className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Lokal oppsett (én gang)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Åpne Supabase → Project Settings → API</li>
              <li>Kopier <span className="font-mono text-xs">service_role</span>-nøkkelen</li>
              <li>
                Lim inn i <span className="font-mono text-xs">.env</span> som{" "}
                <span className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY=...</span>
              </li>
              <li>Start dev-server på nytt (<span className="font-mono text-xs">Ctrl+C</span>, deretter <span className="font-mono text-xs">npm run dev</span>)</li>
            </ol>
          </section>
        )}
        <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Prøv igjen
        </Button>
      </div>
    );
  }

  const payload: MorningMissionPayload = data?.payload ?? {
    today: [],
    this_week: [],
    waiting: [],
    closed: [],
    noise: [],
    hygiene: [],
  };

  const activeCount =
    payload.today.length + payload.this_week.length + payload.waiting.length;

  return (
    <div className="mt-2">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          {data?.fromCache ? "Dagens brief" : "Ny brief generert"}
          {data?.generatedAt && (
            <span>· {new Date(data.generatedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          Oppdater
        </Button>
      </div>

      {payload.weekly_summary && (
        <p className="mb-4 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
          {payload.weekly_summary}
        </p>
      )}

      {activeCount === 0 ? (
        <section className="rounded-2xl border border-border/60 bg-card p-8 text-center">
          <h2 className="font-heading text-lg font-semibold">Alt ser greit ut i dag.</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Jeg har lest e-post og moduler de siste dagene. Ingenting krever deg akkurat nå.
          </p>
        </section>
      ) : (
        <>
          {payload.today.length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                I dag
              </h2>
              <div className="space-y-3">
                {payload.today.map((item) => (
                  <MissionItemCard
                    key={item.id}
                    item={item}
                    busy={busyItemId === item.id}
                    onAction={onAction}
                    onComposeInvoice={onComposeInvoice}
                  />
                ))}
              </div>
            </section>
          )}

          <CollapsibleSection title="Denne uka" count={payload.this_week.length}>
            {payload.this_week.map((item) => (
              <MissionItemCard
                key={item.id}
                item={item}
                busy={busyItemId === item.id}
                onAction={onAction}
                onComposeInvoice={onComposeInvoice}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Venter på andre" count={payload.waiting.length}>
            {payload.waiting.map((item) => (
              <MissionItemCard
                key={item.id}
                item={item}
                busy={busyItemId === item.id}
                onAction={onAction}
                onComposeInvoice={onComposeInvoice}
              />
            ))}
          </CollapsibleSection>
        </>
      )}

      <CollapsibleSection title="Lukket / ingen handling" count={payload.closed.length}>
        {payload.closed.map((item) => (
          <div key={item.id} className="rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{item.title}</span>
            {item.explanation && <span> — {item.explanation}</span>}
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Støy" count={payload.noise.length}>
        <SimpleList items={payload.noise.map((n) => ({ label: n.label }))} />
      </CollapsibleSection>

      <CollapsibleSection title="Digital hygiene" count={payload.hygiene.length}>
        <SimpleList
          items={payload.hygiene.map((h) => ({
            label: h.count ? `${h.label} (${h.count})` : h.label,
          }))}
        />
      </CollapsibleSection>
    </div>
  );
}
