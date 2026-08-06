import { createFileRoute } from "@tanstack/react-router";
import { DeskHome } from "@/components/platform/desk/DeskHome";

/**
 * Fortell — ChatGPT-style full-bleed chat on all viewports.
 * Signal queue lives on Hele livet (Topp 3). No OS header here —
 * brand + thread own the surface (especially on mobile).
 */
export const Route = createFileRoute("/_authenticated/desk/fortell")({
  head: () => ({ meta: [{ title: "Fortell — Nexus" }] }),
  component: DeskFortellPage,
});

function DeskFortellPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DeskHome />
    </div>
  );
}
