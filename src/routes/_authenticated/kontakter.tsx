import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { KontakterList } from "@/components/platform/relation/KontakterList";

/** List stays mounted; detail route overlays as a PlatformSheet. */
export const Route = createFileRoute("/_authenticated/kontakter")({
  component: KontakterLayout,
});

function KontakterLayout() {
  return (
    <PlatformShell>
      <KontakterList />
      <Outlet />
    </PlatformShell>
  );
}
