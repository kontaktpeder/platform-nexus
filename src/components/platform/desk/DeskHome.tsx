import { FortellChat } from "@/components/platform/desk/FortellChat";

/**
 * Fortell work zone — chat only. Signal queue lives on Hele livet (Topp 3).
 */
export function DeskHome() {
  return (
    <main className="relative flex h-full min-h-0 w-full flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <FortellChat />
      </div>
    </main>
  );
}
