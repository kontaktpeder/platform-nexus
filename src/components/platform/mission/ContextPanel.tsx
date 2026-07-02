import { useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Loader2 } from "lucide-react";
import type { ContextSummary } from "@/lib/context/context.types";

export function ContextPanel({
  global,
  entity,
  onRefresh,
  refreshing,
}: {
  global: ContextSummary | null;
  entity: ContextSummary | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!global && !entity) return null;

  const primary = entity ?? global;
  if (!primary) return null;

  return (
    <section className="mb-4 rounded-2xl border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Det jeg vet så langt
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-foreground/90">
            {primary.summary}
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 flex-none text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-none text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/60 px-4 py-3">
          {entity && (
            <ContextBlock label={`Kontekst · ${entity.scope_ref ?? "enhet"}`} s={entity} />
          )}
          {global && (!entity || global.id !== entity.id) && (
            <ContextBlock label="Global oversikt" s={global} />
          )}
          {onRefresh && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                {refreshing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Oppdater kontekst
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ContextBlock({ label, s }: { label: string; s: ContextSummary }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <p className="text-sm text-foreground/90">{s.summary}</p>
      {s.key_facts.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {s.key_facts.slice(0, 6).map((f, i) => (
            <li key={i}>· {f}</li>
          ))}
        </ul>
      )}
      {s.open_questions.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs italic text-muted-foreground/80">
          {s.open_questions.slice(0, 3).map((q, i) => (
            <li key={i}>? {q}</li>
          ))}
        </ul>
      )}
      {s.suggested_next_focus && (
        <div className="mt-2 text-xs text-foreground/80">
          Neste fokus: {s.suggested_next_focus}
        </div>
      )}
    </div>
  );
}
