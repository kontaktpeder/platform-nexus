import { Outlet, createFileRoute } from "@tanstack/react-router";

/** Legacy /kunder* → /kontakter* (see index + $entityId redirects). */
export const Route = createFileRoute("/_authenticated/kunder")({
  component: () => <Outlet />,
});
