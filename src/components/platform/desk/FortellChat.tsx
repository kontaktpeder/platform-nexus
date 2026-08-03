import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Clock,
  ExternalLink,
  Link2,
  Loader2,
  Send,
  Sparkles,
  Square,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  MailComposeControls,
  type MailComposeSelection,
} from "@/components/platform/mail/MailComposeControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  applyFortellContactProposal,
  runFortell,
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
import { getLastWorkspace } from "@/lib/last-workspace";
import { listConnectedModuleOrgs } from "@/lib/module-orgs.functions";
import { syncTimeEntryToWork } from "@/lib/work-timer.functions";
import {
  markPendingSynced,
  readWorkSession,
  startWorkSession,
  stopWorkSession,
} from "@/lib/work-session";

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
 * Keep separate from mobile /hjem capture CTAs.
 */
export function FortellChat() {
  const navigate = useNavigate();
  const run = useServerFn(runFortell);
  const applyContact = useServerFn(applyFortellContactProposal);
  const applyRelation = useServerFn(applySuggestedRelation);
  const sendDraft = useServerFn(sendAssistantDraft);
  const runSync = useServerFn(syncTimeEntryToWork);
  const listOrgs = useServerFn(listConnectedModuleOrgs);
  const lastWs = useMemo(() => getLastWorkspace(), []);

  const [instruction, setInstruction] = useState("");
  const [history, setHistory] = useState<FortellChatMessage[]>([]);
  const [result, setResult] = useState<FortellResult | null>(null);
  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftDone, setDraftDone] = useState(false);
  const [gmailUrl, setGmailUrl] = useState<string | null>(null);
  const [workStarted, setWorkStarted] = useState(false);
  const [workStopNote, setWorkStopNote] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [contactApplied, setContactApplied] = useState(false);
  const [appliedRelations, setAppliedRelations] = useState<Record<string, true>>({});
  const [applyingRelationKey, setApplyingRelationKey] = useState<string | null>(null);
  const [draftSuggestionKey, setDraftSuggestionKey] = useState(0);
  const mailSelRef = useRef<MailComposeSelection>({
    fromEmail: null,
    fromDisplayName: null,
    signatureId: null,
    signatureBody: null,
  });
  const [activeSession, setActiveSession] = useState(() =>
    typeof window !== "undefined" ? readWorkSession() : null,
  );

  const mut = useMutation({
    mutationFn: (text: string) => {
      const session = readWorkSession();
      return run({
        data: {
          instruction: text,
          history,
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
    onSuccess: (res, text) => {
      setHistory((prev) =>
        [
          ...prev,
          { role: "user" as const, content: text },
          { role: "assistant" as const, content: res.answer },
        ].slice(-16),
      );
      setResult(res);
      setDraftDone(false);
      setGmailUrl(null);
      setWorkStarted(false);
      setWorkStopNote(null);
      setContactApplied(false);
      setAppliedRelations({});
      setApplyingRelationKey(null);
      setInstruction("");
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
    onError: (e: Error) => toast.error(e.message),
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
        platformOrgSlug: proposal.platformOrgSlug,
      });
      setActiveSession(session);
      setWorkStarted(true);
      toast.success(`Økt startet · ${proposal.projectName}`);
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
    setStopping(true);
    const pause = Math.max(0, Math.min(24 * 60, breakMinutes));
    const entry = stopWorkSession(pause);
    setActiveSession(null);
    if (!entry) {
      setStopping(false);
      toast.error("Ingen aktiv økt å avslutte");
      return;
    }
    try {
      if (!/^[0-9a-f-]{36}$/i.test(entry.projectId)) {
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
          projectId: entry.projectId,
          rateId:
            entry.rateId && /^[0-9a-f-]{36}$/i.test(entry.rateId) ? entry.rateId : null,
          date: entry.date,
          start_time: entry.start_time,
          end_time: entry.end_time,
          break_minutes: entry.break_minutes,
          comment: entry.comment,
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
        { description: entry.projectName },
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

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Fortell Nexus</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Én inngang · få handlinger
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Mail, Slack, fakturaer, kontakter (inkl. Brreg/nett), relasjoner, start/avslutt økt. Du
          bekrefter før noe skjer. Samtalen huskes i denne økten.
        </p>
      </header>

      {history.length > 0 && (
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {history.slice(-6).map((m, i) => (
            <p key={`${m.role}-${i}`}>
              <span className="font-medium text-foreground">
                {m.role === "user" ? "Deg" : "Fortell"}:
              </span>{" "}
              {m.content.length > 160 ? `${m.content.slice(0, 160)}…` : m.content}
            </p>
          ))}
        </div>
      )}

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
          "F.eks. «Finn Fredrik / Oslo Bowling på nett og fyll kontakt», «Viktige mail?», «Avslutt økt»"
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
        <div className="flex gap-2">
          {history.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="h-11 rounded-xl px-3 text-muted-foreground"
              onClick={() => {
                setHistory([]);
                setResult(null);
                setWorkStopNote(null);
              }}
            >
              Nullstill chat
            </Button>
          )}
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
            <p className="text-sm font-medium text-primary">Økt startet lokalt i Nexus.</p>
          )}

          {stopProposal && !workStopNote && (activeSession || stopping) && (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Bekreft avslutning
              </p>
              {activeSession && (
                <p className="text-sm">
                  <span className="font-medium">{activeSession.projectName}</span>
                  {" · "}
                  {activeSession.organizationName}
                  {stopProposal.breakMinutes > 0
                    ? ` · pause ${stopProposal.breakMinutes} min`
                    : ""}
                </p>
              )}
              <Button
                type="button"
                className="h-11 gap-2 rounded-xl"
                disabled={stopping || !activeSession}
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
              <Textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Melding… (signatur legges på ved lagre/send)"
                disabled={draftDone}
                rows={7}
                className="rounded-xl bg-background text-base"
              />
              {!draftDone && (
                <MailComposeControls
                  disabled={sendMut.isPending}
                  suggestedTone={result.draft?.suggestedTone ?? null}
                  suggestedFromEmail={result.draft?.suggestedFromEmail ?? null}
                  suggestionKey={draftSuggestionKey}
                  onChange={(sel) => {
                    mailSelRef.current = sel;
                  }}
                />
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
    </section>
  );
}
