import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  clearPersonalContextFn,
  getPersonalContextFn,
  importPersonalContextPasteFn,
  importSeedPersonalContextFn,
  upsertPersonalContextFn,
} from "@/lib/personal-context.functions";

/** Manage curated personal dossier on Profil («Om meg»). */
export function PersonalContextManager() {
  const qc = useQueryClient();
  const getCtx = useServerFn(getPersonalContextFn);
  const importPaste = useServerFn(importPersonalContextPasteFn);
  const importSeed = useServerFn(importSeedPersonalContextFn);
  const upsert = useServerFn(upsertPersonalContextFn);
  const clear = useServerFn(clearPersonalContextFn);

  const ctxQ = useQuery({
    queryKey: ["personal-context"],
    queryFn: () => getCtx(),
    staleTime: 30_000,
  });

  const [paste, setPaste] = useState("");
  const [digestDraft, setDigestDraft] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const importMut = useMutation({
    mutationFn: () => importPaste({ data: { paste, source: "chatgpt-paste" } }),
    onSuccess: async () => {
      toast.success("Personlig kontekst importert");
      setPaste("");
      setShowImport(false);
      setDigestDraft(null);
      await qc.invalidateQueries({ queryKey: ["personal-context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedMut = useMutation({
    mutationFn: () => importSeed(),
    onSuccess: async () => {
      toast.success("Start-dossier lagret");
      setShowImport(false);
      setDigestDraft(null);
      await qc.invalidateQueries({ queryKey: ["personal-context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDigestMut = useMutation({
    mutationFn: async () => {
      const current = ctxQ.data;
      if (!current) throw new Error("Ingen dossier å oppdatere");
      return upsert({
        data: {
          dossier: current.dossier,
          rawMarkdown: (digestDraft ?? current.rawMarkdown).trim(),
          source: current.source,
          generatedAt: current.generatedAt,
          schemaVersion: current.schemaVersion,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Digest lagret");
      setDigestDraft(null);
      await qc.invalidateQueries({ queryKey: ["personal-context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () => clear(),
    onSuccess: async () => {
      toast.success("Personlig kontekst slettet");
      setDigestDraft(null);
      await qc.invalidateQueries({ queryKey: ["personal-context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const record = ctxQ.data;
  const busy =
    importMut.isPending ||
    seedMut.isPending ||
    saveDigestMut.isPending ||
    clearMut.isPending;

  const skills = Array.isArray(record?.dossier.skills)
    ? (record!.dossier.skills as unknown[]).length
    : 0;
  const rules = Array.isArray(record?.dossier.operating_rules)
    ? (record!.dossier.operating_rules as unknown[]).length
    : 0;

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Om meg</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Personlig dossier for Fortell, Innboks og Morning Mission. Ikke Knowledge —
            dette er hvem du er.
          </p>
        </div>
      </div>

      {ctxQ.isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Laster…
        </div>
      ) : record ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Aktiv</span>
              {record.generatedAt ? ` · generert ${record.generatedAt}` : null}
              {record.source ? ` · ${record.source}` : null}
            </p>
            <p className="mt-1">
              {skills} skills · {rules} driftsregler · digest{" "}
              {record.rawMarkdown.length.toLocaleString("nb-NO")} tegn
            </p>
            <p className="mt-1">
              Sist lagret {new Date(record.updatedAt).toLocaleString("nb-NO")}
            </p>
          </div>

          <label className="block text-xs font-medium text-muted-foreground">
            Systemprompt-digest
            <Textarea
              className="mt-1.5 min-h-[140px] rounded-xl text-sm"
              value={digestDraft ?? record.rawMarkdown}
              onChange={(e) => setDigestDraft(e.target.value)}
              disabled={busy}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-10 rounded-xl"
              disabled={busy || digestDraft === null}
              onClick={() => saveDigestMut.mutate()}
            >
              {saveDigestMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Lagre digest"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              disabled={busy}
              onClick={() => setShowImport((v) => !v)}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Erstatt fra liming
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-xl text-destructive"
              disabled={busy}
              onClick={() => {
                if (confirm("Slette personlig kontekst?")) clearMut.mutate();
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Slett
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Ingen dossier ennå. Importer start-dossieret (ChatGPT, 3. aug 2026) eller lim inn
            nytt JSON.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-10 rounded-xl"
              disabled={busy}
              onClick={() => seedMut.mutate()}
            >
              {seedMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Importer start-dossier"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              disabled={busy}
              onClick={() => setShowImport(true)}
            >
              Lim inn JSON
            </Button>
          </div>
        </div>
      )}

      {showImport ? (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <label className="block text-xs font-medium text-muted-foreground">
            Lim inn JSON (evt. med markdown-digest etterpå)
            <Textarea
              className="mt-1.5 min-h-[160px] rounded-xl font-mono text-xs"
              placeholder='{"schema_version":"1.0","identity":{...}}'
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-10 rounded-xl"
              disabled={busy || !paste.trim()}
              onClick={() => importMut.mutate()}
            >
              {importMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Importer"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-xl"
              disabled={busy}
              onClick={() => {
                setShowImport(false);
                setPaste("");
              }}
            >
              Avbryt
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
