import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/kontakter/")({
  head: () => ({ meta: [{ title: "Kontakter — Nexus" }] }),
  component: KontakterIndex,
});

/** List lives in the parent layout so detail sheets can peek the catalog behind. */
function KontakterIndex() {
  return null;
}
