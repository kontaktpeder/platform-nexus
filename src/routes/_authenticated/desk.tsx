import { Outlet, createFileRoute } from "@tanstack/react-router";
import { NexusOsShell } from "@/components/platform/os/NexusOsShell";

/** OS layout — dashboards + Fortell share shell (side nav desktop, dock mobile). */
export const Route = createFileRoute("/_authenticated/desk")({
  component: DeskLayout,
});

function DeskLayout() {
  return (
    <NexusOsShell lockMainScroll>
      <Outlet />
    </NexusOsShell>
  );
}
