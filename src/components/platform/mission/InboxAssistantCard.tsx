// Ask the Nexus assistant to dig through Gmail and contacts, then act.
// Long-running: the agent searches, reads threads and may create a draft.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { runInboxAssistant, type AssistantResult } from "@/lib/inbox-assistant.functions";

const PLACEHOLDER =
  "F.eks: Les trådene mellom meg og Marit om bryllupet 15. august og finn ut " +
  "om hun ga meg en kjøreplan. Hvis ja: lag en mail til lydteknikeren " +
  "(oeklandsound.music@gmail.com) med kjøreplanen.";

export function InboxAssistantCard() {
  const runAssistant = useServerFn(runInboxAssistant);
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<AssistantResult | null>(null);

  const mut = useMutation({
    mutationFn: (text: string) =>
      runAssistant({ data: { instruction: text } }) as Promise<AssistantResult>,
    onSuccess: (res) => {
      setResult(res);
      if (res.draft) toast.success("Utkast klart i Gmail");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit() {
    const text = instruction.trim();
    if (!text || mut.isPending) return;
    setResult(null);
    mut.mutate(text);
  }

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
