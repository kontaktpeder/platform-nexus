import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/kontakter/")({
  head: () => ({ meta: [{ title: "Kontakter — Nexus" }] }),
  component: KontakterIndex,
});

/** Mobile: list is the page. Desktop: empty detail pane until a contact is selected. */
function KontakterIndex() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Users className="h-6 w-6" />
      </div>
      <div>
        <p className="font-medium">Velg en kontakt</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Åpne fra listen for å se aktivitet, oppfølging og detaljer.
        </p>
      </div>
    </div>
  );
}
