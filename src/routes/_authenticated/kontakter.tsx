import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { KontakterList } from "@/components/platform/relation/KontakterList";

/** List stays mounted; detail is a sheet on mobile and a side pane on desktop. */
export const Route = createFileRoute("/_authenticated/kontakter")({
  component: KontakterLayout,
});

function KontakterLayout() {
  return (
    <PlatformShell lockMainScroll>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <section className="min-h-0 w-full md:flex md:h-full md:w-[min(22rem,38%)] md:shrink-0 md:flex-col md:overflow-y-auto md:border-r md:border-border">
          <KontakterList />
        </section>
        {/*
          Outlet always mounts so mobile PlatformSheet can portal from here.
          Column is visually desktop-only.
        */}
        <section className="relative hidden h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex">
          <Outlet />
        </section>
      </div>
    </PlatformShell>
  );
}
