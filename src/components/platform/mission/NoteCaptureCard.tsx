// Paste messy phone/meeting notes → AI proposes Nexus structure → accept.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { FileText, Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { applyPhoneNote, parsePhoneNote, type NoteParseResult } from "@/lib/note-capture.functions";

const PLACEHOLDER =
  "Lim inn rå notater fra samtale — f.eks. HMS Kontoret, Godmat, Norgesgruppen, " +
  "oppfølging, provisjon, ideer … Nexus foreslår kontakter, relasjoner og planer.";

export function NoteCaptureCard() {
  const qc = useQueryClient();
  const runParse = useServerFn(parsePhoneNote);
  const runApply = useServerFn(applyPhoneNote);

  const [note, setNote] = useState("");
  const [parsed, setParsed] = useState<NoteParseResult | null>(null);
  const [primaryId, setPrimaryId] = useState<string | null>(null);

  const parseMut = useMutation({
    mutationFn: () => runParse({ data: { note: note.trim() } }) as Promise<NoteParseResult>,
    onSuccess: (res) => {
      setParsed(res);
      setPrimaryId(null);
      toast.success("Forslag klare — huk av det som stemmer");
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
          contacts: parsed.contacts,
          relations: parsed.relations,
          followUps: parsed.followUps,
          facts: parsed.facts,
          ideas: parsed.ideas,
        },
      });
    },
    onSuccess: async (res) => {
      toast.success(
        `Lagret: ${res.contactsCreated} nye kontakter, ${res.relationsCreated} relasjoner, ${res.followUpsCreated} oppfølginger`,
      );
      setPrimaryId(res.primaryEntityId);
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["field-board"] });
      await qc.invalidateQueries({ queryKey: ["morning-mission"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleContact(ref: string) {
    setParsed((p) =>
      p
        ? {
            ...p,
            contacts: p.contacts.map((c) => (c.ref === ref ? { ...c, selected: !c.selected } : c)),
          }
        : p,
    );
  }

  function toggleRelation(i: number) {
    setParsed((p) => {
      if (!p) return p;
      const relations = [...p.relations];
      relations[i] = { ...relations[i]!, selected: !relations[i]!.selected };
      return { ...p, relations };
    });
  }

  function toggleFollowUp(i: number) {
    setParsed((p) => {
      if (!p) return p;
      const followUps = [...p.followUps];
      followUps[i] = { ...followUps[i]!, selected: !followUps[i]!.selected };
      return { ...p, followUps };
    });
  }

  function toggleFact(i: number) {
    setParsed((p) => {
      if (!p) return p;
      const facts = [...p.facts];
      facts[i] = { ...facts[i]!, selected: !facts[i]!.selected };
      return { ...p, facts };
    });
  }

  const nameByRef = new Map(parsed?.contacts.map((c) => [c.ref, c.name]) ?? []);

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <StickyNote className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Notat → Nexus</h2>
          <p className="text-xs text-muted-foreground">
            Lim inn samtalenotater. Nexus foreslår kontakter, relasjoner og planer.
          </p>
        </div>
      </div>

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={5}
        maxLength={20000}
        className="rounded-xl text-base"
      />

      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          className="h-10 gap-2 rounded-xl px-4"
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
          {parsed.summary && (
            <p className="text-sm leading-relaxed text-foreground/90">{parsed.summary}</p>
          )}

          {parsed.contacts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kontakter
              </p>
              <ul className="space-y-1.5">
                {parsed.contacts.map((c) => (
                  <li key={c.ref}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => toggleContact(c.ref)}
                        className="mt-1"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {c.entityType === "person" ? "person" : "selskap"}
                          {c.existingEntityId ? " · finnes" : " · ny"}
                          {c.role ? ` · ${c.role}` : ""}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {c.reason}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsed.relations.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Relasjoner
              </p>
              <ul className="space-y-1.5">
                {parsed.relations.map((r, i) => (
                  <li key={`${r.fromRef}-${r.toRef}-${r.kind}-${i}`}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={() => toggleRelation(i)}
                        className="mt-1"
                      />
                      <span className="text-sm">
                        <span className="font-medium">{nameByRef.get(r.fromRef) ?? r.fromRef}</span>{" "}
                        <span className="text-muted-foreground">{r.kind}</span>{" "}
                        <span className="font-medium">{nameByRef.get(r.toRef) ?? r.toRef}</span>
                        {r.role ? <span className="text-muted-foreground"> · {r.role}</span> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsed.followUps.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Oppfølginger
              </p>
              <ul className="space-y-1.5">
                {parsed.followUps.map((f, i) => (
                  <li key={`${f.contactRef}-${i}`}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={f.selected}
                        onChange={() => toggleFollowUp(i)}
                        className="mt-1"
                      />
                      <span className="text-sm">
                        <span className="font-medium">
                          {nameByRef.get(f.contactRef) ?? f.contactRef}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {f.duePreset.replace("_", " ")}
                        </span>
                        <span className="mt-0.5 block">{f.action}</span>
                      </span>
                    </label>
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
              <ul className="space-y-1.5">
                {parsed.facts.map((f, i) => (
                  <li key={`${f.contactRef}-fact-${i}`}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={f.selected}
                        onChange={() => toggleFact(i)}
                        className="mt-1"
                      />
                      <span className="text-sm">
                        <span className="font-medium">
                          {nameByRef.get(f.contactRef) ?? f.contactRef}
                        </span>
                        <span className="mt-0.5 block text-muted-foreground">{f.fact}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsed.ideas.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ideer (lagres i notatet)
              </p>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {parsed.ideas.map((idea, i) => (
                  <li key={i}>{idea}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl"
              disabled={applyMut.isPending || !parsed.contacts.some((c) => c.selected)}
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
