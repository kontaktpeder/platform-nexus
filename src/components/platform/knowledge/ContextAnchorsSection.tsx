import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Anchor, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getAnchorContexts,
  ensureKnowledgeAnchors,
} from "@/lib/knowledge-anchors.functions";
import type { AnchorEntity } from "@/lib/knowledge/anchor-entities.server";
import { OWNER_CONTEXT_LABEL, ENTITY_TYPE_LABEL } from "@/lib/knowledge/types";
import type { Entity } from "@/lib/knowledge/types";

export function ContextAnchorsSection({
  onOpen,
}: {
  onOpen: (e: Entity) => void;
}) {
  const qc = useQueryClient();
  const fetchAnchors = useServerFn(getAnchorContexts);
  const refresh = useServerFn(ensureKnowledgeAnchors);

  const q = useQuery({
    queryKey: ["knowledge", "anchors"],
    queryFn: () => fetchAnchors() as Promise<AnchorEntity[]>,
  });

  async function handleRefresh() {
    try {
      await refresh();
      toast("Kontekster oppdatert");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feilet");
    }
  }

  const anchors = q.data ?? [];

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Kontekster
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="h-7 gap-1 text-xs text-muted-foreground"
        >
          <RefreshCw className="h-3 w-3" /> Oppdater koblinger
        </Button>
      </div>

      {q.isLoading && (
        <div className="grid place-items-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!q.isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {anchors.map((a) => {
            const orgSlug =
              (a.metadata?.platform_org_slug as string | null | undefined) ?? null;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onOpen(a)}
                className="group flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-border hover:bg-muted/40"
              >
                <div className="flex items-center gap-2">
                  <Anchor className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {OWNER_CONTEXT_LABEL[a.owner_context]}
                  </span>
                </div>
                <div className="font-medium">{a.name}</div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {ENTITY_TYPE_LABEL[a.type]}
                  </span>
                  <span>
                    {a.signal_count} signaler · {a.relationship_count} relasjoner
                  </span>
                </div>
                {a.slug === "gold-of-sicily" && (
                  <div className="text-[11px] text-muted-foreground">
                    {orgSlug
                      ? `Koblet til ${orgSlug}`
                      : "Ingen Platform-org funnet ennå"}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground/70">
                  Systemkontekst — ikke slett
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
