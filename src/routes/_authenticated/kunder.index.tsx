import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/kunder/")({
  beforeLoad: () => {
    throw redirect({ to: "/kontakter" });
  },
});
