// Ask the Nexus assistant to dig through Gmail and contacts, then act.
// Long-running: the agent searches, reads threads and may create a draft.
// Missing contacts found in Gmail are offered as one-click create suggestions.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, Loader2, Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  createContactFromSuggestion,
  runInboxAssistant,
  type AssistantResult,
  type SuggestedContact,
} from "@/lib/inbox-assistant.functions";

const PLACEHOLDER =
  "F.eks: Les trådene mellom meg og Marit om bryllupet 15. august og finn ut " +
  "om hun ga meg en kjøreplan. Hvis ja: lag en mail til lydteknikeren " +
  "(oeklandsound.music@gmail.com) med kjøreplanen.";

export function InboxAssistantCard() {
  const qc = useQueryClient();
  const runAssistant = useServerFn(runInboxAssistant);
  const runCreate = useServerFn(createContactFromSuggestion);
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [createdIds, setCreatedIds] = useState<Record<string, string>>({});
  const [creatingEmail, setCreatingEmail] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (text: string) =>
      runAssistant({ data: { instruction: text } }) as Promise<AssistantResult>,
    onSuccess: (res) => {
      setResult(res);
      setCreatedIds({});
      if (res.draft) toast.success("Utkast klart i Gmail");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: (c: SuggestedContact) =>
      runCreate({
        data: {
          name: c.name,
          email: c.email,
          entityType: c.entityType,
        },
      }),
    onMutate: (c) => setCreatingEmail(c.email),
    onSuccess: async (res, c) => {
      setCreatedIds((prev) => ({ ...prev, [c.email]: res.entityId }));
      toast.success(
        res.created ? `${res.name} lagt til i Kontakter` : `${res.name} finnes allerede`,
      );
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setCreatingEmail(null),
  });

  function submit() {
    const text = instruction.trim();
    if (!text || mut.isPending) return;
    setResult(null);
    setCreatedIds({});
    mut.mutate(text);
  }

  const pendingSuggestions = result?.suggestedContacts.filter((c) => !createdIds[c.email]) ?? [];

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Assistent</h2>
          <p className="text-xs text-muted-foreground">
            Leser innboks og kontakter, lager utkast — sender aldri selv.
          </p>
        </div>
      </div>

      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={3}
        maxLength={2000}
        className="rounded-xl text-base"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {mut.isPending ? "Søker, leser tråder og skriver …" : "⌘+Enter for å kjøre"}
        </p>
        <Button
          type="button"
          className="h-10 gap-2 rounded-xl px-4"
          disabled={!instruction.trim() || mut.isPending}
          onClick={submit}
        >
          {mut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Kjør
        </Button>
      </div>

      {result && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</p>

          {result.draft && (
            <a
              href={result.draft.openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm font-medium text-primary"
            >
              <span className="min-w-0 truncate">
                Utkast til {result.draft.to}: {result.draft.subject}
              </span>
              <ExternalLink className="h-4 w-4 shrink-0" />
            </a>
          )}

          {(pendingSuggestions.length > 0 || Object.keys(createdIds).length > 0) && (
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nye kontakter
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Funnet i Gmail, men ikke i Nexus ennå. Opprett dem for å sende mail og koble tråder
                direkte herfra neste gang.
              </p>
              <ul className="space-y-2">
                {(result.suggestedContacts ?? []).map((c) => {
                  const entityId = createdIds[c.email];
                  const busy = creatingEmail === c.email && createMut.isPending;
                  return (
                    <li
                      key={c.email}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.email}
                          {c.reason ? ` · ${c.reason}` : ""}
                        </p>
                      </div>
                      {entityId ? (
                        <Link
                          to="/kontakter/$entityId"
                          params={{ entityId }}
                          className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-primary"
                        >
                          Åpne
                        </Link>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 shrink-0 gap-1.5 rounded-xl"
                          disabled={busy}
                          onClick={() => createMut.mutate(c)}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="h-3.5 w-3.5" />
                          )}
                          Opprett
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {result.steps.length > 0 && (
            <details className="rounded-xl bg-muted/30 px-3 py-2">
              <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                Slik gikk assistenten frem ({result.steps.length} steg)
              </summary>
              <ol className="mt-2 space-y-1.5">
                {result.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">{s.label}</span>
                      {s.detail ? ` — ${s.detail}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
