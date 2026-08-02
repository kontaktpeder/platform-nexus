import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

/** Slim back header for full-screen capture flows — no workspace/logout chrome. */
export function CaptureTopBar({
  title,
  backTo = "/hjem",
}: {
  title: string;
  backTo?: "/hjem";
}) {
  return (
    <header className="shrink-0 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-12 max-w-lg items-center gap-1 px-2">
        <Link
          to={backTo}
          aria-label="Tilbake"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground transition-colors active:bg-muted"
        >
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate pr-3 font-heading text-base font-semibold">
          {title}
        </h1>
      </div>
    </header>
  );
}
