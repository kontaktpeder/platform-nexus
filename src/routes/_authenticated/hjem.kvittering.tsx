import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, ImagePlus, Upload } from "lucide-react";
import { toast } from "sonner";
import { CaptureTopBar } from "@/components/platform/CaptureTopBar";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/hjem/kvittering")({
  head: () => ({ meta: [{ title: "Kvittering — Nexus" }] }),
  component: HjemKvitteringPage,
});

function HjemKvitteringPage() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);

  function onPick(file: File | null) {
    if (!file) return;
    const okImage = file.type.startsWith("image/");
    const okPdf = file.type === "application/pdf";
    if (!okImage && !okPdf) {
      toast.error("Velg bilde eller PDF");
      return;
    }
    setFileName(file.name);
    setIsPdf(okPdf);
    if (okImage) {
      const url = URL.createObjectURL(file);
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
    toast.success("Kvittering klar", {
      description: "Sendes til Finance når koblingen er på plass",
    });
  }

  return (
    <PlatformShell hideMobileNav>
      <CaptureTopBar title="Kvittering" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
        <p className="text-sm text-muted-foreground">
          Ta bilde, velg fra rullen, eller last opp fil (bilde/PDF).
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
              className="h-12 w-full rounded-xl"
              onClick={() =>
                toast.message("Kommer snart", {
                  description: "Direkte opplasting til Finance kobles neste steg",
                })
              }
            >
              Send til Finance
            </Button>
          </section>
        )}
      </main>
    </PlatformShell>
  );
}
