import { Link } from "@tanstack/react-router";
import { FortellChat } from "@/components/platform/desk/FortellChat";

/**
 * Mac / desktop work zone.
 * Keep this tree separate from components/platform/home (mobile capture CTAs).
 */
export function DeskHome() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-8 py-10">
      <FortellChat />

      <nav
        aria-label="Andre sider"
        className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-6 text-sm text-muted-foreground"
      >
        <Link to="/mission" className="hover:text-foreground">
          Mission
        </Link>
        <Link to="/kontakter" className="hover:text-foreground">
          Kontakter
        </Link>
        <Link to="/field" className="hover:text-foreground">
          Felt
        </Link>
        <Link to="/hjem/okt" className="hover:text-foreground">
          Arbeidsøkt
        </Link>
      </nav>
    </main>
  );
}
