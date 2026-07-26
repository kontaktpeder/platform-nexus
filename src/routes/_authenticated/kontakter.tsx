import { Outlet, createFileRoute } from "@tanstack/react-router";

/** Layout so /kontakter/$entityId can render (child needs Outlet). */
export const Route = createFileRoute("/_authenticated/kontakter")({
  component: KontakterLayout,
});

function KontakterLayout() {
  return <Outlet />;
}
