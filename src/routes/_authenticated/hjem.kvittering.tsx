import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Check, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { CaptureTopBar } from "@/components/platform/CaptureTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
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
import {
  approveReceiptToFinanceFn,
  scanReceiptFn,
} from "@/lib/finance-receipt.functions";
import { getLastWorkspace } from "@/lib/last-workspace";
import {
  listConnectedModuleOrgs,
  type ConnectedModuleOrg,
} from "@/lib/module-orgs.functions";
import type { ReceiptSuggestion } from "@/lib/receipt-scan.server";

export const Route = createFileRoute("/_authenticated/hjem/kvittering")({
  head: () => ({ meta: [{ title: "Kvittering — Nexus" }] }),
  component: HjemKvitteringPage,
});

type QueueItem = {
  id: string;
  fileName: string;
  mimeType: string;
  fileBase64: string;
  previewUrl: string | null;
  status: "pending_scan" | "scanning" | "ready" | "sending" | "sent" | "error";
  suggestion: ReceiptSuggestion | null;
  error: string | null;
  entryId: string | null;
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function HjemKvitteringPage() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const listOrgs = useServerFn(listConnectedModuleOrgs);
  const runScan = useServerFn(scanReceiptFn);
  const runApprove = useServerFn(approveReceiptToFinanceFn);

  const lastWs = useMemo(() => getLastWorkspace(), []);
  const [orgSlug, setOrgSlug] = useState(lastWs?.orgSlug ?? "");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const orgsQ = useQuery({
    queryKey: ["connected-module-orgs", "finance"],
    queryFn: () =>
      listOrgs({ data: { moduleSlug: "finance" } }) as Promise<{
        orgs: ConnectedModuleOrg[];
      }>,
    staleTime: 30_000,
  });

  useEffect(() => {
    const orgs = orgsQ.data?.orgs ?? [];
    if (!orgs.length) return;
    if (!orgSlug || !orgs.some((o) => o.platformOrgSlug === orgSlug)) {
      setOrgSlug(orgs[0]!.platformOrgSlug);
    }
  }, [orgsQ.data, orgSlug]);

  const active = queue.find((q) => q.id === activeId) ?? null;
  const selectedOrg = (orgsQ.data?.orgs ?? []).find((o) => o.platformOrgSlug === orgSlug);

  const scanMut = useMutation({
    mutationFn: async (item: QueueItem) => {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "scanning", error: null } : q,
        ),
      );
      const res = await runScan({
        data: {
          fileBase64: item.fileBase64,
          fileName: item.fileName,
          mimeType: item.mimeType,
        },
      });
      return { id: item.id, suggestion: res.suggestion };
    },
    onSuccess: ({ id, suggestion }) => {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id ? { ...q, status: "ready", suggestion, error: null } : q,
        ),
      );
    },
    onError: (e: Error, item) => {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "error", error: e.message } : q,
        ),
      );
      toast.error(e.message);
    },
  });

  const approveMut = useMutation({
    mutationFn: async (item: QueueItem) => {
      if (!item.suggestion) throw new Error("Mangler forslag");
      if (!orgSlug) throw new Error("Velg Finance-org");
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "sending" } : q)),
      );
      return runApprove({
        data: {
          fileBase64: item.fileBase64,
          fileName: item.fileName,
          mimeType: item.mimeType,
          orgSlug,
          suggestion: item.suggestion,
          sourceRef: item.id,
        },
      });
    },
    onSuccess: (res, item) => {
      setQueue((prev) => {
        const next = prev.map((q) =>
          q.id === item.id
            ? { ...q, status: "sent" as const, entryId: res.entryId, error: null }
            : q,
        );
        const follow = next.find(
          (q) =>
            q.id !== item.id &&
            (q.status === "ready" || q.status === "pending_scan" || q.status === "error"),
        );
        if (follow) setActiveId(follow.id);
        return next;
      });
      toast.success(res.duplicate ? "Allerede i Finance" : "Bilag lagret i Finance", {
        description: res.financeOrg ? String(res.financeOrg) : undefined,
      });
    },
    onError: (e: Error, item) => {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "error", error: e.message } : q,
        ),
      );
      toast.error(e.message);
    },
  });

  async function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const list = Array.from(files);
    const added: QueueItem[] = [];
    for (const file of list) {
      const okImage = file.type.startsWith("image/");
      const okPdf = file.type === "application/pdf";
      if (!okImage && !okPdf) {
        toast.error(`Hopper over ${file.name} — kun bilde/PDF`);
        continue;
      }
      const fileBase64 = await fileToBase64(file);
      const id = crypto.randomUUID();
      const previewUrl = okImage ? URL.createObjectURL(file) : null;
      added.push({
        id,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileBase64,
        previewUrl,
        status: "pending_scan",
        suggestion: null,
        error: null,
        entryId: null,
      });
    }
    if (!added.length) return;
    setQueue((prev) => [...prev, ...added]);
    setActiveId((cur) => cur ?? added[0]!.id);
    for (const item of added) {
      scanMut.mutate(item);
    }
  }

  function patchSuggestion(patch: Partial<ReceiptSuggestion>) {
    if (!activeId) return;
    setQueue((prev) =>
      prev.map((q) =>
        q.id === activeId && q.suggestion
          ? { ...q, suggestion: { ...q.suggestion, ...patch } }
          : q,
      ),
    );
  }

  function removeItem(id: string) {
    setQueue((prev) => {
      const item = prev.find((q) => q.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((q) => q.id !== id);
    });
    setActiveId((cur) => (cur === id ? null : cur));
  }

  const pendingCount = queue.filter((q) => q.status !== "sent").length;

  return (
    <PlatformShell hideMobileNav>
      <CaptureTopBar title="Kvittering" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Finance-org
          </label>
          <Select value={orgSlug || undefined} onValueChange={setOrgSlug}>
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue placeholder="Velg organisasjon" />
            </SelectTrigger>
            <SelectContent>
              {(orgsQ.data?.orgs ?? []).map((o) => (
                <SelectItem key={o.connectionId} value={o.platformOrgSlug}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!orgsQ.isLoading && !(orgsQ.data?.orgs ?? []).length && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Koble Finance under Moduler først.
            </p>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Hver fil = eget bilag. AI tolker, du godkjenner, deretter lagres i{" "}
          {selectedOrg?.name ?? "Finance"}.
        </p>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            className="h-14 gap-2 rounded-2xl"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            Ta bilde
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-14 gap-2 rounded-2xl"
            onClick={() => uploadRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Skann flere
          </Button>
        </div>

        {queue.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Kø · {pendingCount} gjenstår
            </p>
            <ul className="flex flex-wrap gap-2">
              {queue.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setActiveId(q.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs ${
                    q.id === activeId
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <span className="font-medium">#{i + 1}</span>
                  <span className="ml-1 text-muted-foreground">
                    {q.status === "scanning"
                      ? "tolker…"
                      : q.status === "ready"
                        ? "klar"
                        : q.status === "sent"
                          ? "sendt"
                          : q.status === "sending"
                            ? "sender…"
                            : q.status === "error"
                              ? "feil"
                              : "venter"}
                  </span>
                </button>
              ))}
            </ul>
          </section>
        )}

        {active && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{active.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {active.status === "sent"
                    ? "Lagret i Finance"
                    : "Rediger forslag før godkjenning"}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 rounded-xl"
                onClick={() => removeItem(active.id)}
                aria-label="Fjern"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {active.previewUrl && (
              <img
                src={active.previewUrl}
                alt="Kvittering"
                className="max-h-48 w-full rounded-xl bg-muted object-contain"
              />
            )}

            {(active.status === "scanning" || active.status === "pending_scan") && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Tolker kvittering…
              </p>
            )}

            {active.error && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{active.error}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={() => scanMut.mutate(active)}
                >
                  Prøv tolkning på nytt
                </Button>
              </div>
            )}

            {active.suggestion && active.status !== "sent" && (
              <div className="space-y-2">
                <Field label="Beskrivelse">
                  <Input
                    value={active.suggestion.description}
                    onChange={(e) => patchSuggestion({ description: e.target.value })}
                    className="h-11 rounded-xl"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Dato">
                    <Input
                      type="date"
                      value={active.suggestion.entry_date}
                      onChange={(e) => patchSuggestion({ entry_date: e.target.value })}
                      className="h-11 rounded-xl"
                    />
                  </Field>
                  <Field label="Beløp brutto">
                    <Input
                      inputMode="decimal"
                      value={String(active.suggestion.amount_gross)}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(",", "."));
                        if (!Number.isFinite(n)) return;
                        const rate = active.suggestion!.vat_rate;
                        const vat_amount =
                          Math.round((n - n / (1 + rate / 100)) * 100) / 100;
                        patchSuggestion({
                          amount_gross: n,
                          vat_amount,
                          amount_net: Math.round((n - vat_amount) * 100) / 100,
                        });
                      }}
                      className="h-11 rounded-xl"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="MVA %">
                    <Select
                      value={String(active.suggestion.vat_rate)}
                      onValueChange={(v) => {
                        const vat_rate = Number(v);
                        const gross = active.suggestion!.amount_gross;
                        const vat_amount =
                          Math.round((gross - gross / (1 + vat_rate / 100)) * 100) / 100;
                        patchSuggestion({
                          vat_rate,
                          vat_amount,
                          amount_net: Math.round((gross - vat_amount) * 100) / 100,
                        });
                      }}
                    >
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[0, 12, 15, 25].map((r) => (
                          <SelectItem key={r} value={String(r)}>
                            {r} %
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Betaling">
                    <Select
                      value={active.suggestion.payment_status}
                      onValueChange={(v) =>
                        patchSuggestion({
                          payment_status: v as ReceiptSuggestion["payment_status"],
                        })
                      }
                    >
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid">Betalt</SelectItem>
                        <SelectItem value="unpaid">Ubetalt</SelectItem>
                        <SelectItem value="partial">Delvis</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Motpart">
                  <Input
                    value={active.suggestion.counterparty ?? ""}
                    onChange={(e) =>
                      patchSuggestion({ counterparty: e.target.value || null })
                    }
                    className="h-11 rounded-xl"
                  />
                </Field>
                <Field label="Notater">
                  <Textarea
                    value={active.suggestion.notes ?? ""}
                    onChange={(e) => patchSuggestion({ notes: e.target.value || null })}
                    rows={2}
                    className="rounded-xl"
                  />
                </Field>
                <Button
                  type="button"
                  className="h-12 w-full gap-2 rounded-xl"
                  disabled={!orgSlug || approveMut.isPending || active.status === "sending"}
                  onClick={() => approveMut.mutate(active)}
                >
                  {active.status === "sending" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Godkjenn og lagre bilag
                </Button>
              </div>
            )}

            {active.status === "sent" && (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                Bilag lagret{active.entryId ? ` · ${active.entryId.slice(0, 8)}…` : ""}
              </p>
            )}
          </section>
        )}
      </main>
    </PlatformShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
