import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Inbox, MapPin, Users } from "lucide-react";

/**
 * Mac / desktop work zone home.
 * Keep this tree separate from components/platform/home (mobile capture CTAs).
 */
export function DeskHome() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-8 py-10">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Arbeidssone</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
          Desk
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          Rolig oversikt for Mac. Mobil beholder Hjem med raske handlinger — denne flaten utvikles
          separat.
        </p>
      </header>

      <section aria-label="Snarveier" className="grid gap-3 sm:grid-cols-3">
        <DeskLink
          to="/mission"
          title="Mission"
          description="Dagens bilde og prioritering"
          icon={<Inbox className="h-4 w-4" />}
        />
        <DeskLink
          to="/kontakter"
          title="Kontakter"
          description="Relasjoner og kontekst"
          icon={<Users className="h-4 w-4" />}
        />
        <DeskLink
          to="/field"
          title="Felt"
          description="Feltstatus og oppfølging"
          icon={<MapPin className="h-4 w-4" />}
        />
      </section>
    </main>
  );
}

function DeskLink({
  to,
  title,
  description,
  icon,
}: {
  to: "/mission" | "/kontakter" | "/field";
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/60 px-4 py-4 transition-colors hover:border-border hover:bg-card"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-foreground">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-tight">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
    </Link>
  );
}
