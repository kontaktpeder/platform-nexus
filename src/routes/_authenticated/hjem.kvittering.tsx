import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ImagePlus, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { CaptureTopBar } from "@/components/platform/CaptureTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { Button } from "@/components/ui/button";
import { uploadReceiptToFinanceFn } from "@/lib/finance-receipt.functions";
import { getLastWorkspace } from "@/lib/last-workspace";

export const Route = createFileRoute("/_authenticated/hjem/kvittering")({
  head: () => ({ meta: [{ title: "Kvittering — Nexus" }] }),
  component: HjemKvitteringPage,
});

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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [sent, setSent] = useState(false);

  const runUpload = useServerFn(uploadReceiptToFinanceFn);

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Ingen fil valgt");
      const fileBase64 = await fileToBase64(file);
      const last = getLastWorkspace();
      return runUpload({
        data: {
          fileBase64,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          description: `Kvittering ${file.name}`,
          orgSlug: last?.orgSlug ?? null,
        },
      });
    },
    onSuccess: (res) => {
      setSent(true);
      toast.success(res.duplicate ? "Allerede i Finance" : "Sendt til Finance", {
        description: res.financeOrg ? String(res.financeOrg) : undefined,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onPick(next: File | null) {
    if (!next) return;
    const okImage = next.type.startsWith("image/");
    const okPdf = next.type === "application/pdf";
    if (!okImage && !okPdf) {
      toast.error("Velg bilde eller PDF");
      return;
    }
    setFile(next);
    setFileName(next.name);
    setIsPdf(okPdf);
    setSent(false);
    if (okImage) {
      const url = URL.createObjectURL(next);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } else {
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }

  return (
    <PlatformShell hideMobileNav>
      <CaptureTopBar title="Kvittering" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
        <p className="text-sm text-muted-foreground">
          Ta bilde eller last opp — lagres som utgift + vedlegg i Finance.
        </p>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />

        <Button
          type="button"
          className="h-16 w-full gap-2 rounded-2xl text-base"
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="h-5 w-5" />
          Ta bilde
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-16 w-full gap-2 rounded-2xl text-base"
          onClick={() => uploadRef.current?.click()}
        >
          <Upload className="h-5 w-5" />
          Last opp / velg fra rullen
        </Button>

        {(preview || fileName) && (
          <section className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">Forhåndsvisning</p>
            {preview ? (
              <img
                src={preview}
                alt="Kvittering"
                className="max-h-80 w-full rounded-xl bg-muted object-contain"
              />
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-4">
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {isPdf ? "PDF klar for Finance" : "Fil klar for Finance"}
                  </p>
                </div>
              </div>
            )}
            <Button
              type="button"
              className="h-12 w-full gap-2 rounded-xl"
              disabled={!file || sent || sendMut.isPending}
              onClick={() => sendMut.mutate()}
            >
              {sendMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {sent ? "Sendt" : "Send til Finance"}
            </Button>
          </section>
        )}
      </main>
    </PlatformShell>
  );
}
