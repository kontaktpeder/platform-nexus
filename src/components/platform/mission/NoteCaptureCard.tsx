// Paste messy phone/meeting notes → AI proposes Nexus structure → edit & accept.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { FileText, Loader2, Plus, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FOLLOW_UP_PRESET_OPTIONS,
  RELATION_KIND_OPTIONS,
  applyPhoneNote,
  parsePhoneNote,
  type NoteContactProposal,
  type NoteParseResult,
} from "@/lib/note-capture.functions";

const PLACEHOLDER_CARD =
  "Lim inn rå notater fra samtale — f.eks. HMS Kontoret, Godmat, Norgesgruppen, " +
  "oppfølging, provisjon, ideer … Nexus foreslår kontakter, relasjoner og planer.";

const PLACEHOLDER_FULLSCREEN = "Noter hva som helst";

const PRESET_LABEL: Record<(typeof FOLLOW_UP_PRESET_OPTIONS)[number], string> = {
  today: "I dag",
  tomorrow: "I morgen",
  in_3_days: "Om 3 dager",
  next_week: "Neste uke",
};

const KIND_LABEL: Record<(typeof RELATION_KIND_OPTIONS)[number], string> = {
  works_on: "jobber med",
  customer_of: "kunde av",
  member_of: "jobber i",
  owns: "eier",
  blocked_by: "blokkert av",
  related_to: "relatert til",
};

function nextContactRef(contacts: NoteContactProposal[]): string {
  let n = contacts.length + 1;
  const used = new Set(contacts.map((c) => c.ref));
  while (used.has(`c${n}`)) n += 1;
  return `c${n}`;
}

function emptyContact(ref: string): NoteContactProposal {
  return {
    ref,
    name: "",
    entityType: "person",
    email: null,
    role: null,
    phone: null,
    website: null,
    orgNr: null,
    address: null,
    industry: null,
    lastContactedAt: null,
    reason: "Manuelt lagt til",
    existingEntityId: null,
    selected: true,
  };
}

function patchContact(
  p: NoteParseResult,
  ref: string,
  patch: Partial<NoteContactProposal>,
): NoteParseResult {
  return {
    ...p,
    contacts: p.contacts.map((x) => (x.ref === ref ? { ...x, ...patch } : x)),
  };
}

export function NoteCaptureCard({
  variant = "card",
}: {
  /** Full-screen capture on /hjem/notat — large field, app-like. */
  variant?: "card" | "fullscreen";
}) {
  const qc = useQueryClient();
  const runParse = useServerFn(parsePhoneNote);
  const runApply = useServerFn(applyPhoneNote);
  const fullscreen = variant === "fullscreen";

  const [note, setNote] = useState("");
  const [parsed, setParsed] = useState<NoteParseResult | null>(null);
  const [primaryId, setPrimaryId] = useState<string | null>(null);

  const parseMut = useMutation({
    mutationFn: () => runParse({ data: { note: note.trim() } }) as Promise<NoteParseResult>,
    onSuccess: (res) => {
      setParsed(res);
      setPrimaryId(null);
      toast.success("Forslag klare — rediger og huk av det som skal lagres");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyMut = useMutation({
    mutationFn: () => {
      if (!parsed) throw new Error("Ingen forslag");
      return runApply({
        data: {
          note: note.trim(),
          summary: parsed.summary,
          contacts: parsed.contacts.filter((c) => c.name.trim()),
          relations: parsed.relations,
          followUps: parsed.followUps,
          facts: parsed.facts,
          ideas: parsed.ideas,
        },
      });
    },
    onSuccess: async (res) => {
      toast.success(
        `Lagret: ${res.contactsCreated} kontakter, ${res.relationsCreated} relasjoner, ${res.followUpsCreated} oppfølginger, ${res.ideasCreated ?? 0} ideer`,
      );
      setPrimaryId(res.primaryEntityId);
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["field-board"] });
      await qc.invalidateQueries({ queryKey: ["morning-mission"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function patchParsed(updater: (p: NoteParseResult) => NoteParseResult) {
    setParsed((p) => (p ? updater(p) : p));
  }

  const contactOptions = parsed?.contacts.filter((c) => c.name.trim()) ?? [];
  const hasSelection =
    !!parsed &&
    (parsed.contacts.some((c) => c.selected && c.name.trim()) ||
      parsed.relations.some((r) => r.selected) ||
      parsed.followUps.some((f) => f.selected) ||
      parsed.facts.some((f) => f.selected) ||
      parsed.ideas.some((i) => i.selected));

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
          <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <StickyNote className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Notat → Nexus</h2>
            <p className="text-xs text-muted-foreground">
              Rediger forslagene før du lagrer. Huk av det som skal inn i Nexus.
            </p>
          </div>
        </div>
      )}

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={fullscreen ? PLACEHOLDER_FULLSCREEN : PLACEHOLDER_CARD}
        rows={fullscreen ? 16 : 5}
        maxLength={20000}
        className={
          fullscreen
            ? "min-h-[55dvh] flex-1 resize-none rounded-2xl border-border bg-card p-4 text-lg leading-relaxed shadow-sm placeholder:text-muted-foreground/70"
            : "rounded-xl text-base"
        }
      />

      <div className={`mt-2 flex ${fullscreen ? "justify-stretch" : "justify-end"}`}>
        <Button
          type="button"
          className={fullscreen ? "h-14 w-full gap-2 rounded-2xl text-base" : "h-10 gap-2 rounded-xl px-4"}
          disabled={note.trim().length < 10 || parseMut.isPending}
          onClick={() => parseMut.mutate()}
        >
          {parseMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          Tolke notat
        </Button>
      </div>

      {parsed && (
        <div className="mt-4 space-y-4 border-t border-border pt-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Oppsummering
            </p>
            <Textarea
              value={parsed.summary}
              onChange={(e) =>
                patchParsed((p) => ({ ...p, summary: e.target.value.slice(0, 500) }))
              }
              rows={2}
              className="rounded-xl text-sm"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kontakter
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 rounded-xl text-xs"
                onClick={() =>
                  patchParsed((p) => ({
                    ...p,
                    contacts: [...p.contacts, emptyContact(nextContactRef(p.contacts))],
                  }))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Legg til
              </Button>
            </div>
            <ul className="space-y-2">
              {parsed.contacts.map((c) => (
                <li
                  key={c.ref}
                  className="space-y-2 rounded-xl border border-border bg-muted/20 p-3"
                >
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={c.selected}
                      onChange={() =>
                        patchParsed((p) => patchContact(p, c.ref, { selected: !c.selected }))
                      }
                    />
                    Lagre kontakt
                    <span className="text-xs font-normal text-muted-foreground">
                      {c.existingEntityId ? "· finnes fra før" : "· ny"}
                    </span>
                  </label>
                  <Input
                    value={c.name}
                    onChange={(e) =>
                      patchParsed((p) =>
                        patchContact(p, c.ref, { name: e.target.value.slice(0, 120) }),
                      )
                    }
                    placeholder="Navn"
                    className="h-10 rounded-xl"
                  />
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={c.entityType}
                      onChange={(e) =>
                        patchParsed((p) =>
                          patchContact(p, c.ref, {
                            entityType: e.target.value as "person" | "company",
                          }),
                        )
                      }
                      className="h-10 rounded-xl border border-border bg-background px-2 text-sm"
                    >
                      <option value="person">Person</option>
                      <option value="company">Selskap</option>
                    </select>
                    <Input
                      value={c.role ?? ""}
                      onChange={(e) =>
                        patchParsed((p) =>
                          patchContact(p, c.ref, {
                            role: e.target.value.slice(0, 120) || null,
                          }),
                        )
                      }
                      placeholder={c.entityType === "company" ? "Bransjerolle" : "Rolle / tittel"}
                      className="h-10 min-w-[8rem] flex-1 rounded-xl"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={c.email ?? ""}
                      onChange={(e) =>
                        patchParsed((p) =>
                          patchContact(p, c.ref, {
                            email: e.target.value.trim()
                              ? e.target.value.trim().toLowerCase()
                              : null,
                          }),
                        )
                      }
                      placeholder="E-post"
                      className="h-10 rounded-xl"
                    />
                    <Input
                      value={c.phone ?? ""}
                      onChange={(e) =>
                        patchParsed((p) =>
                          patchContact(p, c.ref, {
                            phone: e.target.value.slice(0, 40) || null,
                          }),
                        )
                      }
                      placeholder="Telefon"
                      className="h-10 rounded-xl"
                    />
                    <Input
                      value={c.website ?? ""}
                      onChange={(e) =>
                        patchParsed((p) =>
                          patchContact(p, c.ref, {
                            website: e.target.value.slice(0, 200) || null,
                          }),
                        )
                      }
                      placeholder="Nettside"
                      className="h-10 rounded-xl"
                    />
                    {c.entityType === "company" ? (
                      <Input
                        value={c.orgNr ?? ""}
                        onChange={(e) =>
                          patchParsed((p) =>
                            patchContact(p, c.ref, {
                              orgNr: e.target.value.replace(/\D/g, "").slice(0, 9) || null,
                            }),
                          )
                        }
                        placeholder="Org.nr"
                        inputMode="numeric"
                        className="h-10 rounded-xl"
                      />
                    ) : (
                      <Input
                        value={c.industry ?? ""}
                        onChange={(e) =>
                          patchParsed((p) =>
                            patchContact(p, c.ref, {
                              industry: e.target.value.slice(0, 120) || null,
                            }),
                          )
                        }
                        placeholder="Bransje (valgfritt)"
                        className="h-10 rounded-xl"
                      />
                    )}
                    {c.entityType === "company" && (
                      <Input
                        value={c.industry ?? ""}
                        onChange={(e) =>
                          patchParsed((p) =>
                            patchContact(p, c.ref, {
                              industry: e.target.value.slice(0, 120) || null,
                            }),
                          )
                        }
                        placeholder="Bransje"
                        className="h-10 rounded-xl"
                      />
                    )}
                    <Input
                      value={c.address ?? ""}
                      onChange={(e) =>
                        patchParsed((p) =>
                          patchContact(p, c.ref, {
                            address: e.target.value.slice(0, 200) || null,
                          }),
                        )
                      }
                      placeholder="Adresse"
                      className="h-10 rounded-xl"
                    />
                    <Input
                      type="date"
                      value={c.lastContactedAt ?? ""}
                      onChange={(e) =>
                        patchParsed((p) =>
                          patchContact(p, c.ref, {
                            lastContactedAt: e.target.value || null,
                          }),
                        )
                      }
                      className="h-10 rounded-xl"
                      aria-label="Kontaktet sist"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Kontaktet sist (dato) · lagres som sist sett på kontaktkortet
                  </p>
                  {c.reason && <p className="text-xs text-muted-foreground">{c.reason}</p>}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Relasjoner
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 rounded-xl text-xs"
                disabled={contactOptions.length < 2}
                onClick={() =>
                  patchParsed((p) => {
                    const opts = p.contacts.filter((x) => x.name.trim());
                    const from = opts[0]?.ref;
                    const to = opts.find((x) => x.ref !== from)?.ref;
                    if (!from || !to) return p;
                    return {
                      ...p,
                      relations: [
                        ...p.relations,
                        {
                          fromRef: from,
                          toRef: to,
                          kind: "related_to" as const,
                          role: null,
                          reason: "Manuelt lagt til",
                          selected: true,
                        },
                      ],
                    };
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Legg til
              </Button>
            </div>
            {parsed.relations.length === 0 ? (
              <p className="mb-2 text-xs text-muted-foreground">
                Ingen relasjoner foreslått. Legg til manuelt (krever minst to kontakter).
              </p>
            ) : null}
            <ul className="space-y-2">
              {parsed.relations.map((r, i) => (
                <li
                  key={`${r.fromRef}-${r.toRef}-${i}`}
                  className="space-y-2 rounded-xl border border-border bg-muted/20 p-3"
                >
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={r.selected}
                      onChange={() =>
                        patchParsed((p) => {
                          const relations = [...p.relations];
                          relations[i] = {
                            ...relations[i]!,
                            selected: !relations[i]!.selected,
                          };
                          return { ...p, relations };
                        })
                      }
                    />
                    Lagre relasjon
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={r.fromRef}
                      onChange={(e) =>
                        patchParsed((p) => {
                          const relations = [...p.relations];
                          relations[i] = { ...relations[i]!, fromRef: e.target.value };
                          return { ...p, relations };
                        })
                      }
                      className="h-10 min-w-[7rem] flex-1 rounded-xl border border-border bg-background px-2 text-sm"
                    >
                      {(contactOptions.length ? contactOptions : parsed.contacts).map((c) => (
                        <option key={c.ref} value={c.ref}>
                          {c.name || c.ref}
                        </option>
                      ))}
                    </select>
                    <select
                      value={r.kind}
                      onChange={(e) =>
                        patchParsed((p) => {
                          const relations = [...p.relations];
                          relations[i] = {
                            ...relations[i]!,
                            kind: e.target.value as (typeof RELATION_KIND_OPTIONS)[number],
                          };
                          return { ...p, relations };
                        })
                      }
                      className="h-10 rounded-xl border border-border bg-background px-2 text-sm"
                    >
                      {RELATION_KIND_OPTIONS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <select
                      value={r.toRef}
                      onChange={(e) =>
                        patchParsed((p) => {
                          const relations = [...p.relations];
                          relations[i] = { ...relations[i]!, toRef: e.target.value };
                          return { ...p, relations };
                        })
                      }
                      className="h-10 min-w-[7rem] flex-1 rounded-xl border border-border bg-background px-2 text-sm"
                    >
                      {(contactOptions.length ? contactOptions : parsed.contacts).map((c) => (
                        <option key={c.ref} value={c.ref}>
                          {c.name || c.ref}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    value={r.role ?? ""}
                    onChange={(e) =>
                      patchParsed((p) => {
                        const relations = [...p.relations];
                        relations[i] = {
                          ...relations[i]!,
                          role: e.target.value.slice(0, 120) || null,
                        };
                        return { ...p, relations };
                      })
                    }
                    placeholder="Rolle på relasjonen (valgfritt)"
                    className="h-10 rounded-xl"
                  />
                </li>
              ))}
            </ul>
          </div>

          {parsed.followUps.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Oppfølginger
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Blir planlagt på kontakten og dukker opp i Mission / Felt.
              </p>
              <ul className="space-y-2">
                {parsed.followUps.map((f, i) => (
                  <li
                    key={`fu-${i}`}
                    className="space-y-2 rounded-xl border border-border bg-muted/20 p-3"
                  >
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={f.selected}
                        onChange={() =>
                          patchParsed((p) => {
                            const followUps = [...p.followUps];
                            followUps[i] = {
                              ...followUps[i]!,
                              selected: !followUps[i]!.selected,
                            };
                            return { ...p, followUps };
                          })
                        }
                      />
                      Lagre oppfølging
                    </label>
                    <select
                      value={f.contactRef}
                      onChange={(e) =>
                        patchParsed((p) => {
                          const followUps = [...p.followUps];
                          followUps[i] = {
                            ...followUps[i]!,
                            contactRef: e.target.value,
                          };
                          return { ...p, followUps };
                        })
                      }
                      className="h-10 w-full rounded-xl border border-border bg-background px-2 text-sm"
                    >
                      {(contactOptions.length ? contactOptions : parsed.contacts).map((c) => (
                        <option key={c.ref} value={c.ref}>
                          {c.name || c.ref}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={f.action}
                      onChange={(e) =>
                        patchParsed((p) => {
                          const followUps = [...p.followUps];
                          followUps[i] = {
                            ...followUps[i]!,
                            action: e.target.value.slice(0, 300),
                          };
                          return { ...p, followUps };
                        })
                      }
                      placeholder="Hva skal gjøres?"
                      className="h-10 rounded-xl"
                    />
                    <select
                      value={f.duePreset}
                      onChange={(e) =>
                        patchParsed((p) => {
                          const followUps = [...p.followUps];
                          followUps[i] = {
                            ...followUps[i]!,
                            duePreset: e.target.value as (typeof FOLLOW_UP_PRESET_OPTIONS)[number],
                          };
                          return { ...p, followUps };
                        })
                      }
                      className="h-10 w-full rounded-xl border border-border bg-background px-2 text-sm"
                    >
                      {FOLLOW_UP_PRESET_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {PRESET_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsed.facts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Fakta
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Vis verdier på kontaktkortet og brukes av assistenten.
              </p>
              <ul className="space-y-2">
                {parsed.facts.map((f, i) => (
                  <li
                    key={`fact-${i}`}
                    className="space-y-2 rounded-xl border border-border bg-muted/20 p-3"
                  >
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={f.selected}
                        onChange={() =>
                          patchParsed((p) => {
                            const facts = [...p.facts];
                            facts[i] = { ...facts[i]!, selected: !facts[i]!.selected };
                            return { ...p, facts };
                          })
                        }
                      />
                      Lagre fakta
                    </label>
                    <select
                      value={f.contactRef}
                      onChange={(e) =>
                        patchParsed((p) => {
                          const facts = [...p.facts];
                          facts[i] = { ...facts[i]!, contactRef: e.target.value };
                          return { ...p, facts };
                        })
                      }
                      className="h-10 w-full rounded-xl border border-border bg-background px-2 text-sm"
                    >
                      {(contactOptions.length ? contactOptions : parsed.contacts).map((c) => (
                        <option key={c.ref} value={c.ref}>
                          {c.name || c.ref}
                        </option>
                      ))}
                    </select>
                    <Textarea
                      value={f.fact}
                      onChange={(e) =>
                        patchParsed((p) => {
                          const facts = [...p.facts];
                          facts[i] = {
                            ...facts[i]!,
                            fact: e.target.value.slice(0, 280),
                          };
                          return { ...p, facts };
                        })
                      }
                      rows={2}
                      className="rounded-xl text-sm"
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsed.ideas.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ideer → kunnskapsbank
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Lagres som søkbare ideer assistenten kan hente senere.
              </p>
              <ul className="space-y-2">
                {parsed.ideas.map((idea, i) => (
                  <li
                    key={`idea-${i}`}
                    className="space-y-2 rounded-xl border border-border bg-muted/20 p-3"
                  >
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={idea.selected}
                        onChange={() =>
                          patchParsed((p) => {
                            const ideas = [...p.ideas];
                            ideas[i] = {
                              ...ideas[i]!,
                              selected: !ideas[i]!.selected,
                            };
                            return { ...p, ideas };
                          })
                        }
                      />
                      Lagre i kunnskapsbank
                    </label>
                    <Textarea
                      value={idea.text}
                      onChange={(e) =>
                        patchParsed((p) => {
                          const ideas = [...p.ideas];
                          ideas[i] = {
                            ...ideas[i]!,
                            text: e.target.value.slice(0, 280),
                          };
                          return { ...p, ideas };
                        })
                      }
                      rows={2}
                      className="rounded-xl text-sm"
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl"
              disabled={applyMut.isPending || !hasSelection}
              onClick={() => applyMut.mutate()}
            >
              {applyMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Lagre valgte i Nexus"
              )}
            </Button>
            {primaryId && (
              <Link
                to="/kontakter/$entityId"
                params={{ entityId: primaryId }}
                className="text-center text-sm font-medium text-primary"
              >
                Åpne hovedkontakt →
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
