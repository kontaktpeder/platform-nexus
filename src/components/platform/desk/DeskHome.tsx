import { FortellChat } from "@/components/platform/desk/FortellChat";
import { DeskQueuePanel } from "@/components/platform/desk/DeskQueuePanel";

/**
 * Mac / desktop work zone — chat entry + signal queue (no AI ranking).
 * Keep this tree separate from components/platform/home (mobile capture CTAs).
 */
export function DeskHome() {
  return (
    <main className="relative flex h-full min-h-0 w-full flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <FortellChat />
      </div>
      <DeskQueuePanel className="hidden w-[22rem] shrink-0 border-l lg:flex xl:w-[24rem]" />
    </main>
  );
}
