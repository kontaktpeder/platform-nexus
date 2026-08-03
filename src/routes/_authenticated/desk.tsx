import { createFileRoute } from "@tanstack/react-router";
import { DeskHome } from "@/components/platform/desk/DeskHome";
import { PlatformShell } from "@/components/platform/PlatformShell";

export const Route = createFileRoute("/_authenticated/desk")({
  head: () => ({ meta: [{ title: "Desk — Nexus" }] }),
  component: DeskPage,
});

function DeskPage() {
  return (
    <PlatformShell lockMainScroll>
      <DeskHome />
    </PlatformShell>
  );
}
