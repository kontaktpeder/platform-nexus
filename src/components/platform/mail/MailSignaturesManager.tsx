import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAIL_TONE_LABEL, type MailTone } from "@/lib/mail-compose";
import {
  deleteMailSignature,
  listMailComposeOptions,
  upsertMailSignature,
  type MailSignature,
} from "@/lib/mail-settings.functions";

const EMPTY = {
  name: "",
  tone: "professional" as MailTone,
  body: "Vennlig hilsen\nPeder",
  isDefault: false,
  preferredFromEmail: "" as string,
};

/** Manage Nexus email signatures on Profil. */
export function MailSignaturesManager() {
  const qc = useQueryClient();
  const listOpts = useServerFn(listMailComposeOptions);
  const upsert = useServerFn(upsertMailSignature);
  const remove = useServerFn(deleteMailSignature);

  const optsQ = useQuery({
    queryKey: ["mail-compose-options"],
    queryFn: () => listOpts(),
    staleTime: 30_000,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [creating, setCreating] = useState(false);

  const saveMut = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: editingId,
          name: draft.name.trim(),
          tone: draft.tone,
          body: draft.body.trim(),
          isDefault: draft.isDefault,
          preferredFromEmail: draft.preferredFromEmail.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success(editingId ? "Signatur oppdatert" : "Signatur lagret");
      setCreating(false);
      setEditingId(null);
      setDraft(EMPTY);
      await qc.invalidateQueries({ queryKey: ["mail-compose-options"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Signatur slettet");
      await qc.invalidateQueries({ queryKey: ["mail-compose-options"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(s: MailSignature) {
    setCreating(true);
    setEditingId(s.id);
    setDraft({
      name: s.name,
      tone: s.tone,
      body: s.body,
      isDefault: s.isDefault,
      preferredFromEmail: s.preferredFromEmail ?? "",
    });
  }

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setDraft(EMPTY);
  }

  const signatures = optsQ.data?.signatures ?? [];
  const senders = optsQ.data?.senders ?? [];

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">E-postsignaturer</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Casual eller profesjonell. Velges før send i Fortell, assistent og kontakt.
          </p>
        </div>
        {!creating && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-xl"
            onClick={startCreate}
          >
            <Plus className="h-3.5 w-3.5" />
            Ny
          </Button>
        )}
      </div>

      {optsQ.isLoading ? (
        <p className="text-xs text-muted-foreground">Laster…</p>
      ) : (
        <ul className="space-y-2">
          {signatures.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {s.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {MAIL_TONE_LABEL[s.tone]}
                    {s.isDefault ? " · standard" : ""}
                  </span>
                </p>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                  {s.body}
                </pre>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg px-2 text-xs"
                  onClick={() => startEdit(s)}
                >
                  Rediger
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg px-2 text-xs text-destructive"
                  disabled={deleteMut.isPending}
                  onClick={() => {
                    if (window.confirm(`Slette «${s.name}»?`)) deleteMut.mutate(s.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
          {signatures.length === 0 && !creating && (
            <li className="text-xs text-muted-foreground">
              Ingen signaturer ennå — lag f.eks. «Personlig casual» og «Gold profesjonell».
            </li>
          )}
        </ul>
      )}

      {creating && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.slice(0, 80) }))}
            placeholder="Navn (f.eks. Gold · profesjonell)"
            className="h-11 rounded-xl"
          />
          <Select
            value={draft.tone}
            onValueChange={(v) => setDraft((d) => ({ ...d, tone: v as MailTone }))}
          >
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="professional">Profesjonell</SelectItem>
            </SelectContent>
          </Select>
          {senders.length > 0 && (
            <Select
              value={draft.preferredFromEmail || "__none__"}
              onValueChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  preferredFromEmail: v === "__none__" ? "" : v,
                }))
              }
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Koblet avsender (valgfritt)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ingen koblet avsender</SelectItem>
                {senders.map((s) => (
                  <SelectItem key={s.email} value={s.email}>
                    {s.displayName ? `${s.displayName} <${s.email}>` : s.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Textarea
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value.slice(0, 4000) }))}
            rows={4}
            placeholder={"Vennlig hilsen\nPeder August Halvorsen\nGold of Sicily"}
            className="rounded-xl text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
              className="rounded border-border"
            />
            Bruk som standard
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-1 rounded-xl"
              onClick={() => {
                setCreating(false);
                setEditingId(null);
                setDraft(EMPTY);
              }}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl"
              disabled={!draft.name.trim() || !draft.body.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
