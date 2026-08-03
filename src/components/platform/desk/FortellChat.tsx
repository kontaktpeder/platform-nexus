import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, ExternalLink, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  runFortell,
  type FortellResult,
  type FortellWorkProposal,
} from "@/lib/fortell.functions";
import { sendAssistantDraft } from "@/lib/inbox-assistant.functions";
import { readWorkSession, startWorkSession } from "@/lib/work-session";

/**
 * Desk-only Fortell surface — 3 tools with human confirmation.
 * Keep separate from mobile /hjem capture CTAs.
 */
export function FortellChat() {
  const run = useServerFn(runFortell);
  const sendDraft = useServerFn(sendAssistantDraft);

  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<FortellResult | null>(null);
  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftDone, setDraftDone] = useState(false);
  const [gmailUrl, setGmailUrl] = useState<string | null>(null);
  const [workStarted, setWorkStarted] = useState(false);
  const [activeSession, setActiveSession] = useState(() =>
    typeof window !== "undefined" ? readWorkSession() : null,
  );

  const mut = useMutation({
    mutationFn: (text: string) =>
      run({ data: { instruction: text } }) as Promise<FortellResult>,
    onSuccess: (res) => {
      setResult(res);
      setDraftDone(false);
      setGmailUrl(null);
      setWorkStarted(false);
      if (res.draft) {
        setDraftTo(res.draft.to);
        setDraftSubject(res.draft.subject);
        setDraftBody(res.draft.body);
      } else {
        setDraftTo("");
        setDraftSubject("");
        setDraftBody("");
      }
      setActiveSession(readWorkSession());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: (mode: "send" | "draft") =>
      sendDraft({
        data: {
          to: draftTo.trim(),
          subject: draftSubject.trim(),
          body: draftBody.trim(),
          mode,
        },
      }),
    onSuccess: (res, mode) => {
      setDraftDone(true);
      if (res.mode === "draft" && res.openUrl) {
        setGmailUrl(res.openUrl);
        toast.success("Utkast lagret i Gmail");
        window.open(res.openUrl, "_blank", "noopener,noreferrer");
      } else if (mode === "send") {
        toast.success("E-post sendt");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit() {
    const text = instruction.trim();
    if (!text || mut.isPending) return;
    setResult(null);
    mut.mutate(text);
  }

  function confirmWork(proposal: FortellWorkProposal) {
    try {
      const session = startWorkSession({
        organizationId: proposal.organizationId,
        organizationName: proposal.organizationName,
        projectId: proposal.projectId,
        projectName: proposal.projectName,
        rateId: proposal.rateId,
        rateName: proposal.rateName,
        hourlyRate: proposal.hourlyRate,
        comment: proposal.comment,
      });
      setActiveSession(session);
      setWorkStarted(true);
      toast.success(`Økt startet · ${proposal.projectName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke starte økt");
    }
  }

  const canSendDraft =
    !!draftTo.trim() &&
    !!draftSubject.trim() &&
    !!draftBody.trim() &&
    !draftDone &&
    !sendMut.isPending;

  const proposal = result?.workProposal ?? null;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Fortell Nexus</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Én inngang · tre handlinger
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Les kontakt, foreslå arbeidsøkt, lag mailutkast. Du bekrefter før noe skjer.
        </p>
      </header>

      {activeSession && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
          <Clock className="h-4 w-4 text-primary" />
          <span>
            Aktiv økt · {activeSession.projectName} · {activeSession.organizationName}
          </span>
        </div>
      )}

      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={
          "F.eks. «Hva vet vi om Kari?», «Start økt på Drift», «Skriv mail til kari@… om tilbud»"
        }
        rows={5}
        maxLength={2000}
        className="min-h-[8rem] resize-none rounded-2xl border-border bg-card p-4 text-base leading-relaxed shadow-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {mut.isPending ? "Tenker og bruker verktøy…" : "⌘+Enter for å sende"}
        </p>
        <Button
          type="button"
          className="h-11 gap-2 rounded-xl px-5"
          disabled={!instruction.trim() || mut.isPending}
          onClick={submit}
        >
          {mut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {mut.isPending ? "Jobber…" : "Fortell"}
        </Button>
      </div>

      {result && (
        <div className="space-y-4 border-t border-border pt-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</p>

          {result.steps.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {result.steps.map((s, i) => (
                <li key={`${s.label}-${i}`}>
                  {s.label}
                  {s.detail ? ` · ${s.detail}` : ""}
                </li>
              ))}
            </ul>
          )}

          {proposal && !workStarted && (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Bekreft arbeidsøkt
              </p>
              <p className="text-sm">
                <span className="font-medium">{proposal.projectName}</span>
                {" · "}
                {proposal.organizationName}
                {proposal.rateName ? ` · ${proposal.rateName}` : ""}
                {proposal.hourlyRate != null ? ` (${proposal.hourlyRate} kr)` : ""}
              </p>
              {proposal.comment && (
                <p className="text-xs text-muted-foreground">{proposal.comment}</p>
              )}
              <Button
                type="button"
                className="h-11 gap-2 rounded-xl"
                onClick={() => confirmWork(proposal)}
              >
                <Clock className="h-4 w-4" />
                Start økt nå
              </Button>
            </div>
          )}

          {workStarted && (
            <p className="text-sm font-medium text-primary">Økt startet.</p>
          )}

          {(result.draft || draftTo || draftSubject || draftBody) && (
            <div className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {draftDone ? "E-post" : "Bekreft e-postutkast"}
              </p>
              <Input
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                placeholder="Til"
                disabled={draftDone}
                className="h-11 rounded-xl bg-background"
              />
              <Input
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
                placeholder="Emne"
                disabled={draftDone}
                maxLength={300}
                className="h-11 rounded-xl bg-background"
              />
              <Textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Melding…"
                disabled={draftDone}
                rows={7}
                className="rounded-xl bg-background text-base"
              />
              {!draftDone ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1 gap-2 rounded-xl"
                    disabled={!canSendDraft}
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
                    disabled={!canSendDraft}
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
              ) : gmailUrl ? (
                <a
                  href={gmailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Åpne i Gmail <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">Sendt.</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
