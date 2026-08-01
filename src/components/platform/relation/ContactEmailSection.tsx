// Email section on the contact page — write a NEW email without leaving Nexus.
// No address yet? Add one; it is stored as a known identity so future inbound
// mail auto-links to this contact.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Mail, Pencil, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { generateContactEmailDraft, sendContactEmail } from "@/lib/contact-email.functions";
import { setContactEmail } from "@/lib/customers.functions";

export function ContactEmailSection({
  entityId,
  contactName,
  email,
}: {
  entityId: string;
  contactName: string;
  email: string | null;
}) {
  const qc = useQueryClient();
  const runSetEmail = useServerFn(setContactEmail);
  const runGenerate = useServerFn(generateContactEmailDraft);
  const runSend = useServerFn(sendContactEmail);

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");

  const emailMut = useMutation({
    mutationFn: (value: string) => runSetEmail({ data: { entityId, email: value } }),
    onSuccess: async (res) => {
      toast.success(`E-postadresse lagret: ${res.email}`);
      setEditingEmail(false);
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateMut = useMutation({
    mutationFn: () =>
      runGenerate({
        data: {
          recipientName: contactName,
          instruction: aiInstruction.trim(),
          currentSubject: subject.trim() || undefined,
        },
      }),
    onSuccess: (res) => {
      if (res.subject) setSubject(res.subject);
      setBody(res.body);
      toast.success("Utkast klart — les gjennom før du sender");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: (mode: "send" | "draft") =>
      runSend({
        data: {
          entityId,
          to: email ?? "",
          subject: subject.trim(),
          body: body.trim(),
          mode,
        },
      }),
    onSuccess: async (res) => {
      if (res.mode === "send") {
        toast.success(`E-post sendt til ${contactName}`);
        setSubject("");
        setBody("");
        setAiInstruction("");
        await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      } else {
        toast.success("Utkast lagret i Gmail");
        if (res.openUrl) window.open(res.openUrl, "_blank", "noopener");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canCompose = !!email && !editingEmail;
  const canSend = canCompose && subject.trim().length > 0 && body.trim().length > 0;

  return (
    <section id="kontakt-epost" className="mb-8 scroll-mt-4">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          E-post
        </h2>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        {email && !editingEmail ? (
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-medium">{email}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setEmailDraft(email);
                setEditingEmail(true);
              }}
            >
              <Pencil className="h-3 w-3" />
              Endre
            </Button>
          </div>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (emailDraft.trim()) emailMut.mutate(emailDraft.trim());
            }}
          >
            <p className="text-sm text-muted-foreground">
              {email
                ? "Endre e-postadressen."
                : "Ingen e-postadresse ennå. Legg til for å sende mail herfra — innkommende mail kobles da automatisk."}
            </p>
            <Input
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="navn@selskap.no"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              className="h-11 rounded-xl"
            />
            <div className="flex gap-2">
              {email && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 flex-1 rounded-xl"
                  onClick={() => setEditingEmail(false)}
                >
                  Avbryt
                </Button>
              )}
              <Button
                type="submit"
                className="h-11 flex-1 rounded-xl"
                disabled={!emailDraft.trim() || emailMut.isPending}
              >
                {emailMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Lagre adresse"
                )}
              </Button>
            </div>
          </form>
        )}

        {canCompose && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <Input
              placeholder="Emne"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={300}
              className="h-11 rounded-xl"
            />
            <Textarea
              placeholder={`Skriv til ${contactName}…`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="rounded-xl text-base"
            />

            <div className="flex gap-2">
              <Input
                placeholder="Hva skal mailen handle om? (AI-hjelp)"
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                maxLength={600}
                className="h-11 flex-1 rounded-xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && aiInstruction.trim()) generateMut.mutate();
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 gap-1.5 rounded-xl"
                disabled={!aiInstruction.trim() || generateMut.isPending}
                onClick={() => generateMut.mutate()}
              >
                {generateMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Utkast
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 gap-2 rounded-xl"
                disabled={!canSend || sendMut.isPending}
                onClick={() => sendMut.mutate("draft")}
              >
                <ExternalLink className="h-4 w-4" />
                Lagre utkast i Gmail
              </Button>
              <Button
                type="button"
                className="h-12 flex-1 gap-2 rounded-xl"
                disabled={!canSend || sendMut.isPending}
                onClick={() => {
                  if (window.confirm(`Sende e-posten til ${email} nå?`)) {
                    sendMut.mutate("send");
                  }
                }}
              >
                {sendMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
