import { FortellChat } from "@/components/platform/desk/FortellChat";

/**
 * Mac / desktop work zone — one ChatGPT-style entry to all Nexus actions.
 * Keep this tree separate from components/platform/home (mobile capture CTAs).
 */
export function DeskHome() {
  return (
    <main className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <FortellChat />
    </main>
  );
}
