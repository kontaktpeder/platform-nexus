import { createFileRoute } from "@tanstack/react-router";
import { DeskHome } from "@/components/platform/desk/DeskHome";
import { NexusOsHeader } from "@/components/platform/os/NexusOsHeader";
import { mockMeta } from "@/lib/os/mock-data";

/** Fortell only — signal queue lives on Hele livet as Topp 3. */
export const Route = createFileRoute("/_authenticated/desk/fortell")({
  head: () => ({ meta: [{ title: "Fortell — Nexus" }] }),
  component: DeskFortellPage,
});

function DeskFortellPage() {
  return (
    <>
      <NexusOsHeader
        title="Fortell"
        subtitle="Samtale og hjelp — køen ligger på I dag"
        dateLabel={mockMeta.dateLabel}
        kontekst="hele"
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <DeskHome />
      </div>
    </>
  );
}
