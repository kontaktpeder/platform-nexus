import { createFileRoute } from "@tanstack/react-router";
import { DeskHome } from "@/components/platform/desk/DeskHome";
import { NexusOsHeader } from "@/components/platform/os/NexusOsHeader";
import { mockMeta } from "@/lib/os/mock-data";

/** Fortell + signal queue — Innboks under OS shell. */
export const Route = createFileRoute("/_authenticated/desk/fortell")({
  head: () => ({ meta: [{ title: "Innboks — Nexus" }] }),
  component: DeskFortellPage,
});

function DeskFortellPage() {
  return (
    <>
      <NexusOsHeader
        title="Innboks"
        subtitle="Signaler, mail og Fortell"
        dateLabel={mockMeta.dateLabel}
        kontekst="hele"
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <DeskHome />
      </div>
    </>
  );
}
