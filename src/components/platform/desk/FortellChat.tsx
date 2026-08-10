import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Clock,
  ExternalLink,
  FileSignature,
  Link2,
  Loader2,
  Mic,
  MicOff,
  Send,
  Square,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  MailComposeControls,
  type MailComposeSelection,
} from "@/components/platform/mail/MailComposeControls";
import { MailAttachmentsField } from "@/components/platform/mail/MailAttachmentsField";
import { MailDraftBodyField } from "@/components/platform/mail/MailDraftBodyField";
import { NexusMark } from "@/components/platform/NexusMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import {
  applyFortellContactProposal,
  applyFortellControlAgreement,
  runFortell,
  type FortellAgreementProposal,
  type FortellChatMessage,
  type FortellContactProposal,
  type FortellRelationProposal,
  type FortellResult,
  type FortellWorkProposal,
} from "@/lib/fortell.functions";
import {
  applySuggestedRelation,
  sendAssistantDraft,
} from "@/lib/inbox-assistant.functions";
import { stripTrailingSignOff } from "@/lib/mail-compose";
import type { MailAttachmentPayload } from "@/lib/mail-attachments";
import { getLastWorkspace } from "@/lib/last-workspace";
import { listConnectedModuleOrgs } from "@/lib/module-orgs.functions";
import { fetchWorkTimerCatalog, syncTimeEntryToWork } from "@/lib/work-timer.functions";
import {
  BREAK_OPTIONS,
  markPendingSynced,
  readWorkSession,
  startWorkSession,
  stopWorkSession,
} from "@/lib/work-session";
import {
  clearFortellThread,
  readFortellThread,
  writeFortellThread,
} from "@/lib/fortell-thread";
import {
  getActiveFortellThread,
  startNewFortellThread,
} from "@/lib/fortell-thread.functions";

const RELATION_KIND_LABEL: Record<FortellRelationProposal["kind"], string> = {
  member_of: "jobber i",
  works_on: "jobber på",
  customer_of: "kunde av",
  owns: "eier",
  blocked_by: "blokkert av",
  related_to: "relatert til",
};

function relationKey(r: FortellRelationProposal): string {
  return [r.fromName, r.kind, r.toName]
    .map((n) => n.toLowerCase())
    .join("|");
}

/**
 * Desk-only Fortell surface — tools with human confirmation.
 * ChatGPT-style thread; history on server + local cache.
 * Soft prefs auto-merge into personal context; hard writes still confirm.
 */
export function FortellChat() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const run = useServerFn(runFortell);
  const loadThread = useServerFn(getActiveFortellThread);
  const newThread = useServerFn(startNewFortellThread);
  const applyContact = useServerFn(applyFortellContactProposal);
  const applyAgreement = useServerFn(applyFortellControlAgreement);
  const applyRelation = useServerFn(applySuggestedRelation);
  const sendDraft = useServerFn(sendAssistantDraft);
  const runSync = useServerFn(syncTimeEntryToWork);
  const listOrgs = useServerFn(listConnectedModuleOrgs);
  const runCatalog = useServerFn(fetchWorkTimerCatalog);
  const lastWs = useMemo(() => getLastWorkspace(), []);

  const [instruction, setInstruction] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [history, setHistory] = useState<FortellChatMessage[]>(() =>
    typeof window !== "undefined" ? readFortellThread() : [],
  );
  const [result, setResult] = useState<FortellResult | null>(null);
  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<MailAttachmentPayload[]>([]);
  const [draftDone, setDraftDone] = useState(false);
  const [gmailUrl, setGmailUrl] = useState<string | null>(null);
  const [workStarted, setWorkStarted] = useState(false);
  const [workStopNote, setWorkStopNote] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [startComment, setStartComment] = useState("");
  const [startProjectId, setStartProjectId] = useState("");
  const [startRateId, setStartRateId] = useState("");
  const [stopComment, setStopComment] = useState("");
  const [stopProjectId, setStopProjectId] = useState("");
  const [stopRateId, setStopRateId] = useState("");
  const [stopBreakMin, setStopBreakMin] = useState("0");
  const [contactApplied, setContactApplied] = useState(false);
  const [agreementApplied, setAgreementApplied] = useState(false);
  const [agreementOpenUrl, setAgreementOpenUrl] = useState<string | null>(null);
  const [appliedRelations, setAppliedRelations] = useState<Record<string, true>>({});
  const [applyingRelationKey, setApplyingRelationKey] = useState<string | null>(null);
  const [draftSuggestionKey, setDraftSuggestionKey] = useState(0);
  const mailSelRef = useRef<MailComposeSelection>({
    fromEmail: null,
    fromDisplayName: null,
    signatureId: null,
    signatureBody: null,
    signatureHtml: null,
  });
  const [activeSession, setActiveSession] = useState(() =>
    typeof window !== "undefined" ? readWorkSession() : null,
  );

  const speech = useSpeechToText({
    lang: "nb-NO",
    onError: (message) => toast.error(message),
  });

  useEffect(() => {
    writeFortellThread(history);
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    void loadThread()
      .then((payload) => {
        if (cancelled) return;
        setThreadId(payload.threadId);
        if (payload.messages.length > 0) {
          setHistory(payload.messages.slice(-32));
        }
      })
      .catch(() => {
        // Keep local cache if server history is unavailable
      });
    return () => {
      cancelled = true;
    };
  }, [loadThread]);

  function appendTranscript(chunk: string) {
    setInstruction((prev) => {
      const base = prev.trimEnd();
      if (!base) return chunk;
      const needsSpace = !/\s$/.test(base);
      return `${base}${needsSpace ? " " : ""}${chunk}`;
    });
  }

  function toggleSpeech() {
    if (speech.listening) {
      speech.stop();
      return;
    }
    speech.start(appendTranscript);
  }

  const mut = useMutation({
    mutationFn: (text: string) => {
      const session = readWorkSession();
      return run({
        data: {
          instruction: text,
          threadId,
          history: history.slice(-16),
          preferredOrgSlug:
            session?.platformOrgSlug ?? lastWs?.orgSlug ?? null,
          activeSession: session
            ? {
                projectName: session.projectName,
                organizationName: session.organizationName,
                startedAt: session.startedAt,
                platformOrgSlug:
                  session.platformOrgSlug ?? lastWs?.orgSlug ?? null,
              }
            : null,
        },
      }) as Promise<FortellResult>;
    },
    onSuccess: (res) => {
      speech.stop();
      if (res.threadId) setThreadId(res.threadId);
      setHistory((prev) =>
        [...prev, { role: "assistant" as const, content: res.answer }].slice(-32),
      );
      setResult(res);
      setDraftDone(false);
      setGmailUrl(null);
      setDraftAttachments([]);
      setWorkStarted(false);
      setWorkStopNote(null);
      setContactApplied(false);
      setAgreementApplied(false);
      setAgreementOpenUrl(null);
      setAppliedRelations({});
      setApplyingRelationKey(null);
      setInstruction("");
      setStartComment(res.workProposal?.comment?.trim() || "");
      setStartProjectId(res.workProposal?.projectId ?? "");
      setStartRateId(res.workProposal?.rateId ?? "");
      const sess = readWorkSession();
      setStopComment(sess?.comment?.trim() || "");
      setStopProjectId(sess?.projectId ?? "");
      setStopRateId(sess?.rateId ?? "");
      setStopBreakMin(String(res.stopProposal?.breakMinutes ?? 0));
      if (res.manualSignalSaved) {
        void qc.invalidateQueries({ queryKey: ["desk-queue"] });
        toast.success("Signal lagret i køen");
      }
      if (res.draft) {
        setDraftTo(res.draft.to);
        setDraftSubject(res.draft.subject);
        setDraftBody(stripTrailingSignOff(res.draft.body));
        setDraftSuggestionKey((k) => k + 1);
      } else {
        setDraftTo("");
        setDraftSubject("");
        setDraftBody("");
      }
      setActiveSession(readWorkSession());
    },
    onError: (e: Error) => {
      setHistory((prev) =>
        prev.length > 0 && prev[prev.length - 1]?.role === "user"
          ? prev.slice(0, -1)
          : prev,
      );
      toast.error(e.message);
    },
  });

  const sendMut = useMutation({
    mutationFn: (mode: "send" | "draft") => {
      const sel = mailSelRef.current;
      return sendDraft({
        data: {
          to: draftTo.trim(),
          subject: draftSubject.trim(),
          body: draftBody.trim(),
          mode,
          fromEmail: sel.fromEmail,
          fromDisplayName: sel.fromDisplayName,
          signatureBody: sel.signatureBody,
          signatureHtml: sel.signatureHtml,
          attachments: draftAttachments.length ? draftAttachments : undefined,
        },
      });
    },
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

  const contactMut = useMutation({
    mutationFn: (p: FortellContactProposal) =>
      applyContact({
        data: {
          entityId: p.entityId,
          email: p.email,
          role: p.role,
          phone: p.phone,
          website: p.website,
          orgNr: p.orgNr,
          address: p.address,
          industry: p.industry,
          summary: p.summary,
        },
      }),
    onSuccess: async (res) => {
      setContactApplied(true);
      toast.success(`Oppdatert ${res.name}`);
      await navigate({
        to: "/kontakter/$entityId",
        params: { entityId: res.entityId },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const agreementMut = useMutation({
    mutationFn: (p: FortellAgreementProposal) =>
      applyAgreement({
        data: {
          mode: p.mode,
          agreementId: p.agreementId,
          title: p.title,
          body: p.body,
          agreementType: p.agreementType,
          counterpartyName: p.counterpartyName,
          platformOrgSlug: p.platformOrgSlug,
          reason: p.reason,
        },
      }),
    onSuccess: (res) => {
      setAgreementApplied(true);
      setAgreementOpenUrl(res.openUrl);
      toast.success(
        res.mode === "update"
          ? `Oppdatert i Control: ${res.title}`
          : `Sendt til Control: ${res.title}`,
      );
      if (res.openUrl) {
        window.open(res.openUrl, "_blank", "noopener,noreferrer");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const relationMut = useMutation({
    mutationFn: (r: FortellRelationProposal) =>
      applyRelation({
        data: {
          fromName: r.fromName,
          toName: r.toName,
          kind: r.kind,
          role: r.role,
          fromEntityId: r.fromEntityId,
          toEntityId: r.toEntityId,
        },
      }),
    onMutate: (r) => setApplyingRelationKey(relationKey(r)),
    onSuccess: (res, r) => {
      setAppliedRelations((prev) => ({ ...prev, [relationKey(r)]: true }));
      toast.success(`Relasjon lagret · ${res.fromName} → ${res.toName}`);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setApplyingRelationKey(null),
  });

  function submit() {
    const text = instruction.trim();
    if (!text || mut.isPending) return;
    speech.stop();
    setResult(null);
    setInstruction("");
    setHistory((prev) =>
      [...prev, { role: "user" as const, content: text }].slice(-32),
    );
    mut.mutate(text);
  }

  const hasChat = history.length > 0 || !!result || mut.isPending;
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [history, result, mut.isPending]);

  const workCatalogSlug =
    result?.workProposal?.platformOrgSlug ??
    activeSession?.platformOrgSlug ??
    lastWs?.orgSlug ??
    null;

  const catalogQ = useQuery({
    queryKey: ["work-timer-catalog", workCatalogSlug, "fortell"],
    enabled: !!(result?.workProposal || result?.stopProposal || activeSession),
    queryFn: () =>
      runCatalog({ data: { orgSlug: workCatalogSlug } }) as Promise<{
        connected: boolean;
        org: { id: string; name: string } | null;
        projects: Array<{ id: string; name: string }>;
        rates: Array<{ id: string; name: string; amount: number }>;
        error: string | null;
      }>,
    staleTime: 30_000,
  });

  const catalogProjects = catalogQ.data?.projects ?? [];
  const catalogRates = catalogQ.data?.rates ?? [];

  useEffect(() => {
    if (!catalogProjects.length) return;
    if (startProjectId && !catalogProjects.some((p) => p.id === startProjectId)) {
      setStartProjectId(catalogProjects[0]!.id);
    }
    if (stopProjectId && !catalogProjects.some((p) => p.id === stopProjectId)) {
      setStopProjectId(catalogProjects[0]!.id);
    }
  }, [catalogProjects, startProjectId, stopProjectId]);

  function confirmWork(proposal: FortellWorkProposal) {
    const project =
      catalogProjects.find((p) => p.id === startProjectId) ??
      (proposal.projectId
        ? { id: proposal.projectId, name: proposal.projectName }
        : null);
    if (!project) {
      toast.error("Velg prosjekt");
      return;
    }
    const rate =
      catalogRates.find((r) => r.id === startRateId) ??
      (proposal.rateId
        ? {
            id: proposal.rateId,
            name: proposal.rateName ?? "Sats",
            amount: proposal.hourlyRate ?? 0,
          }
        : null);
    try {
      const session = startWorkSession({
        organizationId: proposal.organizationId,
        organizationName: proposal.organizationName,
        projectId: project.id,
        projectName: project.name,
        rateId: rate?.id ?? null,
        rateName: rate?.name ?? null,
        hourlyRate: rate ? Number(rate.amount) : null,
        comment: startComment.trim() || proposal.comment,
        platformOrgSlug: proposal.platformOrgSlug,
      });
      setActiveSession(session);
      setStopComment(startComment.trim() || proposal.comment?.trim() || "");
      setStopProjectId(project.id);
      setStopRateId(rate?.id ?? "");
      setWorkStarted(true);
      toast.success(`Økt startet · ${project.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke starte økt");
    }
  }

  async function resolveWorkOrgSlug(preferred: string | null | undefined): Promise<string | null> {
    if (preferred?.trim()) return preferred.trim();
    if (lastWs?.orgSlug) return lastWs.orgSlug;
    try {
      const res = (await listOrgs({ data: { moduleSlug: "work" } })) as {
        orgs: Array<{ platformOrgSlug: string }>;
      };
      return res.orgs[0]?.platformOrgSlug ?? null;
    } catch {
      return null;
    }
  }

  async function confirmStop(breakMinutes: number) {
    const sessionBefore = readWorkSession();
    if (!sessionBefore) {
      toast.error("Ingen aktiv økt å avslutte");
      return;
    }
    const project =
      catalogProjects.find((p) => p.id === stopProjectId) ??
      (sessionBefore.projectId
        ? { id: sessionBefore.projectId, name: sessionBefore.projectName }
        : null);
    if (!project) {
      toast.error("Velg prosjekt");
      return;
    }
    const rate =
      catalogRates.find((r) => r.id === stopRateId) ??
      (sessionBefore.rateId
        ? {
            id: sessionBefore.rateId,
            name: sessionBefore.rateName ?? "Sats",
            amount: sessionBefore.hourlyRate ?? 0,
          }
        : null);

    setStopping(true);
    const pause = Math.max(
      0,
      Math.min(24 * 60, Number.parseInt(stopBreakMin, 10) || breakMinutes || 0),
    );
    const entry = stopWorkSession(pause, stopComment);
    setActiveSession(null);
    if (!entry) {
      setStopping(false);
      toast.error("Ingen aktiv økt å avslutte");
      return;
    }
    const projectId = project.id;
    const rateId = rate?.id ?? null;
    const projectName = project.name;
    try {
      if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
        setWorkStopNote(
          "Økten er stoppet lokalt, men prosjektet mangler Work-id — synk manuelt under Arbeidsøkt.",
        );
        toast.error("Stoppet lokalt — ikke synket til Work", {
          description: "Prosjekt mangler Work-id",
        });
        return;
      }
      const orgSlug = await resolveWorkOrgSlug(sessionBefore?.platformOrgSlug);
      if (!orgSlug) {
        setWorkStopNote(
          "Økten er stoppet lokalt. Fant ingen koblet Work-organisasjon — synk under Arbeidsøkt.",
        );
        toast.error("Stoppet lokalt — ikke synket til Work", {
          description: "Ingen koblet Work-organisasjon",
        });
        markPendingSynced(entry.id, "failed");
        return;
      }
      const res = await runSync({
        data: {
          id: entry.id,
          projectId,
          rateId: rateId && /^[0-9a-f-]{36}$/i.test(rateId) ? rateId : null,
          date: entry.date,
          start_time: entry.start_time,
          end_time: entry.end_time,
          break_minutes: entry.break_minutes,
          comment: stopComment.trim() || entry.comment,
          orgSlug,
        },
      });
      markPendingSynced(entry.id, "synced");
      setWorkStopNote(
        res.duplicate
          ? `Allerede i Work · ${entry.total_minutes} min`
          : `Synket til Work · ${entry.total_minutes} min`,
      );
      toast.success(
        res.duplicate
          ? `Allerede i Work · ${entry.total_minutes} min`
          : `Synket til Work · ${entry.total_minutes} min`,
        { description: projectName },
      );
    } catch (e) {
      markPendingSynced(entry.id, "failed");
      const msg = e instanceof Error ? e.message : "Kunne ikke synke til Work";
      setWorkStopNote(`Økten er stoppet lokalt. Synk feilet: ${msg}`);
      toast.error(msg, {
        description: "Økten er stoppet lokalt — prøv synk under Arbeidsøkt",
      });
    } finally {
      setStopping(false);
    }
  }

  const canSendDraft =
    !!draftTo.trim() &&
    !!draftSubject.trim() &&
    !!draftBody.trim() &&
    !draftDone &&
    !sendMut.isPending;

  const proposal = result?.workProposal ?? null;
  const stopProposal = result?.stopProposal ?? null;
  const contactProposal = result?.contactProposal ?? null;
  const agreementProposal = result?.agreementProposal ?? null;

  const composer = (
    <div className="w-full space-y-2">
      <div className="relative rounded-[1.75rem] border border-border/80 bg-card/90 shadow-soft backdrop-blur-sm">
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={
            hasChat
              ? "Skriv eller snakk videre…"
              : "Hva skal vi gjøre? Skriv eller snakk — mail, notat, økt…"
          }
          rows={hasChat ? 2 : 3}
          maxLength={2000}
          className={`min-h-[3.5rem] resize-none rounded-[1.75rem] border-0 bg-transparent px-5 py-4 text-base leading-relaxed shadow-none focus-visible:ring-0 ${
            speech.supported ? "pr-28" : "pr-16"
          }`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
          {speech.supported ? (
            <Button
              type="button"
              size="icon"
              variant={speech.listening ? "destructive" : "outline"}
              className="h-10 w-10 rounded-2xl"
              disabled={mut.isPending}
              onClick={toggleSpeech}
              aria-label={speech.listening ? "Stopp opptak" : "Snakk i stedet for å skrive"}
              aria-pressed={speech.listening}
            >
              {speech.listening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 rounded-2xl"
            disabled={!instruction.trim() || mut.isPending}
            onClick={submit}
            aria-label={mut.isPending ? "Jobber" : "Send"}
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-1">
        <p
          className={`text-xs ${
            speech.listening ? "font-medium text-primary" : "text-muted-foreground"
          }`}
        >
          {mut.isPending
            ? "Tenker og bruker verktøy…"
            : speech.listening
              ? `Lytter… ${speech.interim ? `"${speech.interim}"` : "snakk nå"}`
              : speech.supported
                ? "⌘+Enter for å sende · mikrofon for tale"
                : "⌘+Enter for å sende"}
        </p>
        {hasChat && (
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              speech.stop();
              void newThread()
                .then((payload) => {
                  setThreadId(payload.threadId);
                  clearFortellThread();
                  setHistory([]);
                  setResult(null);
                  setWorkStopNote(null);
                })
                .catch(() => {
                  clearFortellThread();
                  setThreadId(null);
                  setHistory([]);
                  setResult(null);
                  setWorkStopNote(null);
                });
            }}
          >
            Ny chat
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 40% at 18% 12%, oklch(0.92 0.04 20 / 0.55), transparent 70%)," +
            "radial-gradient(50% 38% at 88% 18%, oklch(0.93 0.03 250 / 0.45), transparent 70%)," +
            "radial-gradient(60% 50% at 70% 95%, oklch(0.93 0.035 160 / 0.4), transparent 70%)," +
            "radial-gradient(50% 40% at 8% 90%, oklch(0.93 0.04 300 / 0.35), transparent 70%)",
        }}
      />

      {!hasChat ? (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-6 pt-6 sm:px-6 sm:pb-16 sm:pt-10">
          <div className="mb-8 flex max-w-lg flex-col items-center text-center sm:mb-10">
            <NexusMark size="hero" className="mb-5 sm:mb-7" />
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-5xl">
              Hva skal vi gjøre?
            </h1>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Én inngang til alt — skriv det du trenger, så skjønner Nexus resten.
            </p>
          </div>
          {activeSession && (
            <div className="mb-4 flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Aktiv økt · {activeSession.projectName} · {activeSession.organizationName}
              </span>
            </div>
          )}
          <div className="w-full max-w-2xl">{composer}</div>
        </div>
      ) : (
        <>
          <div
            ref={threadRef}
            className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8"
          >
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
              {activeSession && (
                <div className="flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm">
                  <Clock className="h-4 w-4 shrink-0 text-primary" />
                  <span>
                    Aktiv økt · {activeSession.projectName} ·{" "}
                    {activeSession.organizationName}
                  </span>
                </div>
              )}

              {history.map((m, i) => (
                <div
                  key={`${m.role}-${i}-${m.content.slice(0, 24)}`}
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[85%] rounded-3xl rounded-br-lg bg-foreground px-4 py-3 text-sm leading-relaxed text-background"
                      : "max-w-[95%] space-y-1"
                  }
                >
                  {m.role === "assistant" && (
                    <div className="mb-1.5 flex items-center gap-2">
                      <NexusMark size="sm" alt="" />
                      <p className="text-xs font-medium text-muted-foreground">Nexus</p>
                    </div>
                  )}
                  <p
                    className={
                      m.role === "user"
                        ? "whitespace-pre-wrap"
                        : "whitespace-pre-wrap text-sm leading-relaxed text-foreground"
                    }
                  >
                    {m.content}
                  </p>
                </div>
              ))}

              {mut.isPending && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <NexusMark size="sm" pulse alt="" />
                  Tenker…
                </div>
              )}

              {result && !mut.isPending && (
                <div className="space-y-4">
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
          {contactProposal && !contactApplied && (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Bekreft kontaktoppdatering
              </p>
              <p className="text-sm font-medium">{contactProposal.name}</p>
              {contactProposal.reason && (
                <p className="text-xs text-muted-foreground">{contactProposal.reason}</p>
              )}
              <dl className="grid gap-1.5 text-sm">
                {[
                  ["E-post", contactProposal.email],
                  ["Rolle", contactProposal.role],
                  ["Telefon", contactProposal.phone],
                  ["Nettsted", contactProposal.website],
                  ["Org.nr", contactProposal.orgNr],
                  ["Adresse", contactProposal.address],
                  ["Bransje", contactProposal.industry],
                ].map(([label, value]) =>
                  value ? (
                    <div key={label as string} className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
                      <dd className="min-w-0 break-words">{value}</dd>
                    </div>
                  ) : null,
                )}
                {contactProposal.summary && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">Sammendrag</dt>
                    <dd className="min-w-0 break-words">{contactProposal.summary}</dd>
                  </div>
                )}
              </dl>
              <Button
                type="button"
                className="h-11 gap-2 rounded-xl"
                disabled={contactMut.isPending}
                onClick={() => contactMut.mutate(contactProposal)}
              >
                {contactMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserRound className="h-4 w-4" />
                )}
                Lagre og åpne kontakt
              </Button>
            </div>
          )}

          {agreementProposal && !agreementApplied && (
            <div className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {agreementProposal.mode === "update"
                  ? "Bekreft oppdatering i Control Core"
                  : "Bekreft ny avtale til Control Core"}
              </p>
              <p className="text-sm font-medium">{agreementProposal.title}</p>
              <p className="text-xs text-muted-foreground">
                {agreementProposal.mode === "update" ? "Oppdater eksisterende · " : "Nytt utkast · "}
                {agreementProposal.agreementType}
                {agreementProposal.counterpartyName
                  ? ` · ${agreementProposal.counterpartyName}`
                  : ""}
                {agreementProposal.reason ? ` · ${agreementProposal.reason}` : ""}
              </p>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-3 font-sans text-sm leading-relaxed">
                {agreementProposal.body}
              </pre>
              <p className="text-xs text-muted-foreground">
                {agreementProposal.mode === "update"
                  ? "Erstatter teksten i eksisterende draft. Control eier signering og arkiv."
                  : "Fortell forbereder et nytt utkast. Control eier signering, versjon og arkiv."}
              </p>
              <Button
                type="button"
                className="h-11 gap-2 rounded-xl"
                disabled={agreementMut.isPending}
                onClick={() => agreementMut.mutate(agreementProposal)}
              >
                {agreementMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSignature className="h-4 w-4" />
                )}
                {agreementMut.isPending
                  ? "Sender…"
                  : agreementProposal.mode === "update"
                    ? "Lagre oppdatering i Control"
                    : "Send nytt utkast til Control"}
              </Button>
            </div>
          )}

          {agreementApplied && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
              <FileSignature className="h-4 w-4 text-primary" />
              <span>
                {agreementProposal?.mode === "update"
                  ? "Utkast oppdatert i Control Core."
                  : "Utkast lagret i Control Core."}
              </span>
              {agreementOpenUrl && (
                <a
                  href={agreementOpenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  Åpne <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}

          {(result.relationProposals?.length ?? 0) > 0 && (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Bekreft relasjoner
              </p>
              <p className="text-xs text-muted-foreground">
                Godkjenn for å lagre koblingen. Begge kontakter må finnes i Nexus.
              </p>
              <ul className="space-y-2">
                {result.relationProposals.map((r) => {
                  const key = relationKey(r);
                  const done = !!appliedRelations[key];
                  const busy = applyingRelationKey === key && relationMut.isPending;
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {r.fromName}{" "}
                          <span className="font-normal text-muted-foreground">
                            {RELATION_KIND_LABEL[r.kind] ?? r.kind}
                          </span>{" "}
                          {r.toName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[r.role, r.reason].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {done ? (
                        <span className="shrink-0 text-xs font-medium text-emerald-600">
                          Lagret
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 shrink-0 gap-1.5 rounded-xl"
                          disabled={busy}
                          onClick={() => relationMut.mutate(r)}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Link2 className="h-3.5 w-3.5" />
                          )}
                          Godkjenn
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {(result.mailHits?.length ?? 0) > 0 && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Gmail
              </p>
              <ul className="divide-y divide-border">
                {result.mailHits.map((m) => (
                  <li key={m.href} className="py-2.5 first:pt-0 last:pb-0">
                    <a
                      href={m.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block min-w-0 hover:opacity-90"
                    >
                      <p className="truncate text-sm font-medium">{m.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.from}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {m.snippet}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(result.calendarHits?.length ?? 0) > 0 && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kalender
              </p>
              <ul className="divide-y divide-border">
                {result.calendarHits.map((c, i) => (
                  <li key={`${c.start}-${c.title}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
                    {c.href ? (
                      <a
                        href={c.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block min-w-0 hover:opacity-90"
                      >
                        <p className="truncate text-sm font-medium">{c.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.start}
                          {c.location ? ` · ${c.location}` : ""}
                          {c.allDay ? " · hele dagen" : ""}
                        </p>
                      </a>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.start}
                          {c.location ? ` · ${c.location}` : ""}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(result.slackHits?.length ?? 0) > 0 && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Slack
              </p>
              <ul className="divide-y divide-border">
                {result.slackHits.map((s, i) => (
                  <li key={`${s.channel}-${s.at ?? i}`} className="py-2.5 first:pt-0 last:pb-0">
                    {s.href ? (
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block min-w-0 hover:opacity-90"
                      >
                        <p className="truncate text-sm font-medium">
                          {s.channel}
                          {s.from ? ` · ${s.from}` : ""}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {s.snippet}
                        </p>
                      </a>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {s.channel}
                          {s.from ? ` · ${s.from}` : ""}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {s.snippet}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(result.unpaidInvoices?.length ?? 0) > 0 && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ubetalte fakturaer
              </p>
              <ul className="divide-y divide-border">
                {result.unpaidInvoices.map((inv) => (
                  <li
                    key={`${inv.orgSlug}:${inv.id}`}
                    className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {inv.invoiceNumber ? `#${inv.invoiceNumber}` : "Uten nummer"}
                        {" · "}
                        {inv.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inv.orgName}
                        {inv.dueDate
                          ? ` · forfall ${new Date(inv.dueDate).toLocaleDateString("nb-NO")}`
                          : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium tabular-nums">
                        {Math.round(inv.total).toLocaleString("nb-NO")} kr
                      </p>
                      {inv.href && (
                        <a
                          href={inv.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Åpne
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {proposal && !workStarted && (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Bekreft arbeidsøkt
              </p>
              <p className="text-sm text-muted-foreground">{proposal.organizationName}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Prosjekt
                  </p>
                  <Select value={startProjectId || undefined} onValueChange={setStartProjectId}>
                    <SelectTrigger className="h-11 rounded-xl bg-background">
                      <SelectValue placeholder="Velg prosjekt" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                      {startProjectId &&
                        !catalogProjects.some((p) => p.id === startProjectId) && (
                          <SelectItem value={startProjectId}>{proposal.projectName}</SelectItem>
                        )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Sats
                  </p>
                  <Select
                    value={startRateId || "__none__"}
                    onValueChange={(v) => setStartRateId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-11 rounded-xl bg-background">
                      <SelectValue placeholder="Velg sats" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Ingen sats</SelectItem>
                      {catalogRates.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} · {r.amount} kr
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Kommentar til Work
                </p>
                <Textarea
                  value={startComment}
                  onChange={(e) => setStartComment(e.target.value.slice(0, 500))}
                  placeholder="Hva jobber du med?"
                  rows={3}
                  className="rounded-xl bg-background text-sm"
                />
              </div>
              <Button
                type="button"
                className="h-11 gap-2 rounded-xl"
                disabled={!startProjectId}
                onClick={() => confirmWork(proposal)}
              >
                <Clock className="h-4 w-4" />
                Start økt nå
              </Button>
            </div>
          )}

          {workStarted && (
            <p className="text-sm font-medium text-primary">Økt startet lokalt i Nexus.</p>
          )}

          {stopProposal && !workStopNote && (activeSession || stopping) && (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Bekreft avslutning
              </p>
              {activeSession && (
                <p className="text-sm text-muted-foreground">{activeSession.organizationName}</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Prosjekt
                  </p>
                  <Select
                    value={stopProjectId || undefined}
                    onValueChange={setStopProjectId}
                    disabled={stopping || !activeSession}
                  >
                    <SelectTrigger className="h-11 rounded-xl bg-background">
                      <SelectValue placeholder="Velg prosjekt" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                      {stopProjectId &&
                        !catalogProjects.some((p) => p.id === stopProjectId) &&
                        activeSession && (
                          <SelectItem value={stopProjectId}>
                            {activeSession.projectName}
                          </SelectItem>
                        )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Sats
                  </p>
                  <Select
                    value={stopRateId || "__none__"}
                    onValueChange={(v) => setStopRateId(v === "__none__" ? "" : v)}
                    disabled={stopping || !activeSession}
                  >
                    <SelectTrigger className="h-11 rounded-xl bg-background">
                      <SelectValue placeholder="Velg sats" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Ingen sats</SelectItem>
                      {catalogRates.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} · {r.amount} kr
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Pause
                </p>
                <Select
                  value={stopBreakMin}
                  onValueChange={setStopBreakMin}
                  disabled={stopping || !activeSession}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BREAK_OPTIONS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m === 0 ? "Ingen pause" : `${m} minutter`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Kommentar til Work
                </p>
                <Textarea
                  value={stopComment}
                  onChange={(e) => setStopComment(e.target.value.slice(0, 500))}
                  placeholder="Hva gjorde du? (synkes til Work)"
                  rows={3}
                  disabled={stopping || !activeSession}
                  className="rounded-xl bg-background text-sm"
                />
              </div>
              <Button
                type="button"
                className="h-11 gap-2 rounded-xl"
                disabled={stopping || !activeSession || !stopProjectId}
                onClick={() => void confirmStop(stopProposal.breakMinutes)}
              >
                {stopping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                {stopping ? "Avslutter…" : "Avslutt økt og synk til Work"}
              </Button>
            </div>
          )}

          {stopProposal && !workStopNote && !activeSession && !stopping && (
            <p className="text-sm text-muted-foreground">Ingen aktiv økt å avslutte.</p>
          )}

          {workStopNote && (
            <p className="text-sm font-medium text-foreground">{workStopNote}</p>
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
              <MailDraftBodyField
                value={draftBody}
                onChange={setDraftBody}
                disabled={draftDone}
              />
              {!draftDone && (
                <>
                  <MailComposeControls
                    disabled={sendMut.isPending}
                    suggestedTone={result.draft?.suggestedTone ?? null}
                    suggestedFromEmail={result.draft?.suggestedFromEmail ?? null}
                    suggestionKey={draftSuggestionKey}
                    onChange={(sel) => {
                      mailSelRef.current = sel;
                    }}
                  />
                  <MailAttachmentsField
                    value={draftAttachments}
                    onChange={setDraftAttachments}
                    disabled={sendMut.isPending}
                    onError={(m) => toast.error(m)}
                  />
                </>
              )}
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
            </div>
          </div>

          <div className="relative z-10 shrink-0 border-t border-border/50 bg-background/80 px-3 py-3 backdrop-blur-md sm:px-8 sm:py-4">
            <div className="mx-auto w-full max-w-2xl">{composer}</div>
          </div>
        </>
      )}
    </section>
  );
}
