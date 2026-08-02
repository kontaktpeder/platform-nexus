// Ask the Nexus assistant to dig through Gmail and contacts, then act.
// Drafts are previewed/edited/sent in Nexus. Contact suggestions are opt-in.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, Loader2, Send, Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createContactFromSuggestion,
  runInboxAssistant,
  sendAssistantDraft,
  type AssistantResult,
  type SuggestedContact,
} from "@/lib/inbox-assistant.functions";

const PLACEHOLDER =
  "F.eks: Søk Brygg i Storgata Oslo på nett, finn daglig leder og opprett kontakt. " +
  "Eller: se mailene jeg har sendt om nettsider — hva bør jeg gjøre?";

function suggestionKey(c: SuggestedContact): string {
  return c.email ?? `name:${c.entityType}:${c.name.toLowerCase()}:${c.orgNr ?? ""}`;
}

export function InboxAssistantCard() {
  const qc = useQueryClient();
  const runAssistant = useServerFn(runInboxAssistant);
  const runCreate = useServerFn(createContactFromSuggestion);
  const runSendDraft = useServerFn(sendAssistantDraft);

  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [createdIds, setCreatedIds] = useState<Record<string, string>>({});
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftSent, setDraftSent] = useState(false);
  const [gmailDraftUrl, setGmailDraftUrl] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (text: string) =>
      runAssistant({ data: { instruction: text } }) as Promise<AssistantResult>,
    onSuccess: (res) => {
      setResult(res);
      setCreatedIds({});
      setDraftSent(false);
      setGmailDraftUrl(null);
      if (res.draft) {
        setDraftTo(res.draft.to);
        setDraftSubject(res.draft.subject);
        setDraftBody(res.draft.body);
        toast.success("Utkast klart — les gjennom før du sender");
      } else {
        setDraftTo("");
        setDraftSubject("");
        setDraftBody("");
      }
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
          role: c.role,
          phone: c.phone,
          website: c.website,
          orgNr: c.orgNr,
          address: c.address,
          relateToCompanyName: c.relateToCompanyName,
        },
      }),
    onMutate: (c) => setCreatingKey(suggestionKey(c)),
    onSuccess: async (res, c) => {
      setCreatedIds((prev) => ({ ...prev, [suggestionKey(c)]: res.entityId }));
      toast.success(
        res.created ? `${res.name} lagt til i Kontakter` : `${res.name} finnes allerede`,
      );
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setCreatingKey(null),
  });

  const sendMut = useMutation({
    mutationFn: (mode: "send" | "draft") =>
      runSendDraft({
        data: {
          to: draftTo.trim(),
          subject: draftSubject.trim(),
          body: draftBody.trim(),
          mode,
        },
      }),
    onSuccess: (res) => {
      if (res.mode === "send") {
        setDraftSent(true);
        toast.success(`E-post sendt til ${draftTo}`);
      } else {
        setGmailDraftUrl(res.openUrl);
        toast.success("Utkast lagret i Gmail");
        if (res.openUrl) window.open(res.openUrl, "_blank", "noopener");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit() {
    const text = instruction.trim();
    if (!text || mut.isPending) return;
    setResult(null);
    setCreatedIds({});
    setDraftSent(false);
    setGmailDraftUrl(null);
    mut.mutate(text);
  }

  const canSend =
    !!draftTo.trim() &&
    !!draftSubject.trim() &&
    !!draftBody.trim() &&
    !draftSent &&
    !sendMut.isPending;

  const pendingSuggestions =
    result?.suggestedContacts.filter((c) => !createdIds[suggestionKey(c)]) ?? [];

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Assistent</h2>
          <p className="text-xs text-muted-foreground">
            Innboks, Brreg og nett. Utkast vises her — du sender selv.
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

          {(result.draft || draftTo || draftSubject || draftBody) && (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {draftSent ? "Sendt" : "E-postutkast"}
              </p>
              <Input
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                placeholder="Til"
                disabled={draftSent}
                className="h-11 rounded-xl bg-background"
              />
              <Input
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
                placeholder="Emne"
                disabled={draftSent}
                maxLength={300}
                className="h-11 rounded-xl bg-background"
              />
              <Textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Melding…"
                disabled={draftSent}
                rows={8}
                className="rounded-xl bg-background text-base"
              />
              {!draftSent ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1 gap-2 rounded-xl"
                    disabled={!canSend}
                    onClick={() => sendMut.mutate("draft")}
                  >
                    {sendMut.isPending && sendMut.variables === "draft" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    Lagre i Gmail
                  </Button>
                  <Button
                    type="button"
                    className="h-11 flex-1 gap-2 rounded-xl"
                    disabled={!canSend}
                    onClick={() => {
                      if (window.confirm(`Sende e-posten til ${draftTo} nå?`)) {
                        sendMut.mutate("send");
                      }
                    }}
                  >
                    {sendMut.isPending && sendMut.variables === "send" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send nå
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sendt til {draftTo}.</p>
              )}
              {gmailDraftUrl && (
                <a
                  href={gmailDraftUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                >
                  Åpne i Gmail <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {(pendingSuggestions.length > 0 || Object.keys(createdIds).length > 0) && (
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nye kontakter
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Relevante for denne oppgaven, men ikke i Nexus ennå.
              </p>
              <ul className="space-y-2">
                {(result.suggestedContacts ?? []).map((c) => {
                  const key = suggestionKey(c);
                  const entityId = createdIds[key];
                  const busy = creatingKey === key && createMut.isPending;
                  const metaBits = [
                    c.role,
                    c.email,
                    c.orgNr ? `Org.nr ${c.orgNr}` : null,
                    c.reason,
                  ].filter(Boolean);
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {metaBits.join(" · ") || c.entityType}
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
