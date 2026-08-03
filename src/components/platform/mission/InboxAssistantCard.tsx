// Ask the Nexus assistant to dig through Gmail and contacts, then act.
// Drafts are previewed/edited/sent in Nexus. Contact suggestions are opt-in.

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, GitMerge, Link2, Loader2, Send, Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  MailComposeControls,
  type MailComposeSelection,
} from "@/components/platform/mail/MailComposeControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  applySuggestedMerge,
  applySuggestedRelation,
  createContactFromSuggestion,
  runInboxAssistant,
  sendAssistantDraft,
  type AssistantResult,
  type SuggestedContact,
  type SuggestedMerge,
  type SuggestedRelation,
} from "@/lib/inbox-assistant.functions";
import { stripTrailingSignOff } from "@/lib/mail-compose";

const PLACEHOLDER =
  "F.eks: Søk Brygg i Storgata Oslo på nett, finn daglig leder og opprett kontakt. " +
  "Eller: se mailene jeg har sendt om nettsider — hva bør jeg gjøre?";

const PLACEHOLDER_FULLSCREEN = "Spør om hva som helst…";

function suggestionKey(c: SuggestedContact): string {
  return c.email ?? `name:${c.entityType}:${c.name.toLowerCase()}:${c.orgNr ?? ""}`;
}

function relationKey(r: SuggestedRelation): string {
  return `${r.fromName.toLowerCase()}|${r.kind}|${r.toName.toLowerCase()}`;
}

function mergeKey(m: SuggestedMerge): string {
  return [m.keepName, m.absorbName]
    .map((n) => n.toLowerCase())
    .sort()
    .join("|");
}

const KIND_LABEL: Record<SuggestedRelation["kind"], string> = {
  member_of: "jobber i",
  works_on: "jobber på",
  customer_of: "kunde av",
  owns: "eier",
  blocked_by: "blokkert av",
  related_to: "relatert til",
};

export function InboxAssistantCard({
  variant = "card",
}: {
  /** Full-screen ask flow on /hjem/spor — large field, app-like. */
  variant?: "card" | "fullscreen";
}) {
  const fullscreen = variant === "fullscreen";
  const qc = useQueryClient();
  const runAssistant = useServerFn(runInboxAssistant);
  const runCreate = useServerFn(createContactFromSuggestion);
  const runSendDraft = useServerFn(sendAssistantDraft);
  const runApplyRelation = useServerFn(applySuggestedRelation);
  const runApplyMerge = useServerFn(applySuggestedMerge);

  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [createdIds, setCreatedIds] = useState<Record<string, string>>({});
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [appliedRelations, setAppliedRelations] = useState<Record<string, true>>({});
  const [appliedMerges, setAppliedMerges] = useState<Record<string, true>>({});
  const [applyingRelationKey, setApplyingRelationKey] = useState<string | null>(null);
  const [applyingMergeKey, setApplyingMergeKey] = useState<string | null>(null);

  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftSent, setDraftSent] = useState(false);
  const [gmailDraftUrl, setGmailDraftUrl] = useState<string | null>(null);
  const [draftSuggestionKey, setDraftSuggestionKey] = useState(0);
  const mailSelRef = useRef<MailComposeSelection>({
    fromEmail: null,
    fromDisplayName: null,
    signatureId: null,
    signatureBody: null,
  });

  const mut = useMutation({
    mutationFn: (text: string) =>
      runAssistant({ data: { instruction: text } }) as Promise<AssistantResult>,
    onSuccess: (res) => {
      setResult(res);
      setCreatedIds({});
      setAppliedRelations({});
      setAppliedMerges({});
      setDraftSent(false);
      setGmailDraftUrl(null);
      if (res.draft) {
        setDraftTo(res.draft.to);
        setDraftSubject(res.draft.subject);
        setDraftBody(stripTrailingSignOff(res.draft.body));
        setDraftSuggestionKey((k) => k + 1);
        toast.success("Utkast klart — velg avsender/signatur før du sender");
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

  const relationMut = useMutation({
    mutationFn: (r: SuggestedRelation) =>
      runApplyRelation({
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
    onSuccess: async (res, r) => {
      setAppliedRelations((prev) => ({ ...prev, [relationKey(r)]: true }));
      toast.success(`Relasjon lagret: ${res.fromName} → ${res.toName}`);
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setApplyingRelationKey(null),
  });

  const mergeMut = useMutation({
    mutationFn: (m: SuggestedMerge) =>
      runApplyMerge({
        data: {
          keepName: m.keepName,
          absorbName: m.absorbName,
          keepEntityId: m.keepEntityId,
          absorbEntityId: m.absorbEntityId,
        },
      }),
    onMutate: (m) => setApplyingMergeKey(mergeKey(m)),
    onSuccess: async (res, m) => {
      setAppliedMerges((prev) => ({ ...prev, [mergeKey(m)]: true }));
      toast.success(`Sammenslått: beholdt «${res.keepName}»`);
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setApplyingMergeKey(null),
  });


  const sendMut = useMutation({
    mutationFn: (mode: "send" | "draft") => {
      const sel = mailSelRef.current;
      return runSendDraft({
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
    setAppliedRelations({});
    setAppliedMerges({});
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
    <section
      className={
        fullscreen
          ? "flex flex-1 flex-col gap-3"
          : "mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm"
      }
    >
      {!fullscreen && (
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
      )}

      {fullscreen && (
        <p className="text-sm text-muted-foreground">
          Innboks, Brreg og nett. Utkast vises her — du sender selv.
        </p>
      )}

      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={fullscreen ? PLACEHOLDER_FULLSCREEN : PLACEHOLDER}
        rows={fullscreen ? 10 : 3}
        maxLength={2000}
        className={
          fullscreen
            ? "min-h-[40dvh] flex-1 resize-none rounded-2xl border-border bg-card p-4 text-lg leading-relaxed shadow-sm placeholder:text-muted-foreground/70"
            : "rounded-xl text-base"
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />

      <div
        className={`mt-2 flex items-center gap-2 ${fullscreen ? "justify-stretch" : "justify-between"}`}
      >
        {!fullscreen && (
          <p className="text-[11px] text-muted-foreground">
            {mut.isPending ? "Søker, leser tråder og skriver …" : "⌘+Enter for å kjøre"}
          </p>
        )}
        <Button
          type="button"
          className={
            fullscreen ? "h-14 w-full gap-2 rounded-2xl text-base" : "h-10 gap-2 rounded-xl px-4"
          }
          disabled={!instruction.trim() || mut.isPending}
          onClick={submit}
        >
          {mut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {mut.isPending ? "Søker…" : "Spør"}
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
                placeholder="Melding… (signatur legges på ved lagre/send)"
                disabled={draftSent}
                rows={8}
                className="rounded-xl bg-background text-base"
              />
              {!draftSent && (
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

          {(result.suggestedRelations?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Relasjoner
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Godkjenn for å lagre koblingen. Opprett kontaktene først hvis de er nye.
              </p>
              <ul className="space-y-2">
                {result.suggestedRelations.map((r) => {
                  const key = relationKey(r);
                  const done = !!appliedRelations[key];
                  const busy = applyingRelationKey === key && relationMut.isPending;
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {r.fromName}{" "}
                          <span className="font-normal text-muted-foreground">
                            {KIND_LABEL[r.kind] ?? r.kind}
                          </span>{" "}
                          {r.toName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[r.role, r.reason].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {done ? (
                        <span className="shrink-0 text-xs font-medium text-emerald-600">Lagret</span>
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

          {(result.suggestedMerges?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sammenslåing
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Samme aktør under ulike navn. Behold den med org.nr/e-post.
              </p>
              <ul className="space-y-2">
                {result.suggestedMerges.map((m) => {
                  const key = mergeKey(m);
                  const done = !!appliedMerges[key];
                  const busy = applyingMergeKey === key && mergeMut.isPending;
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          Behold «{m.keepName}», absorber «{m.absorbName}»
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{m.reason}</p>
                      </div>
                      {done ? (
                        <span className="shrink-0 text-xs font-medium text-emerald-600">
                          Sammenslått
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 shrink-0 gap-1.5 rounded-xl"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Slå sammen «${m.absorbName}» inn i «${m.keepName}»? Dette kan ikke angres.`,
                              )
                            ) {
                              mergeMut.mutate(m);
                            }
                          }}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <GitMerge className="h-3.5 w-3.5" />
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
