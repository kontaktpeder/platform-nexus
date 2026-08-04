import { Outlet, createFileRoute } from "@tanstack/react-router";
import { NexusOsShell } from "@/components/platform/os/NexusOsShell";

/** Desktop OS layout — dashboards + Fortell/Innboks share the charcoal shell. */
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
