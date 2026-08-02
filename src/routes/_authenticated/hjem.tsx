import { Outlet, createFileRoute } from "@tanstack/react-router";

/** Layout so /hjem/notat|okt|kvittering can render. */
export const Route = createFileRoute("/_authenticated/hjem")({
  component: HjemLayout,
});

function HjemLayout() {
  return <Outlet />;
}
