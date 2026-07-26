import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy path — detail lives under /kontakter/$entityId. */
export const Route = createFileRoute("/_authenticated/kunder/$entityId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/kontakter/$entityId",
      params: { entityId: params.entityId },
    });
  },
});
