import { useState } from "react";
import { FortellChat } from "@/components/platform/desk/FortellChat";
import { DeskQueuePanel } from "@/components/platform/desk/DeskQueuePanel";
import { ContactDetailPanel } from "@/components/platform/relation/ContactDetailPanel";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/**
 * Mac / desktop work zone — chat entry + signal queue (no AI ranking).
 * Keep this tree separate from components/platform/home (mobile capture CTAs).
 */
export function DeskHome() {
  const [panelEntityId, setPanelEntityId] = useState<string | null>(null);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <FortellChat />
      </div>
      <DeskQueuePanel
        className="hidden w-[22rem] shrink-0 border-l lg:flex xl:w-[24rem]"
        onOpenContact={setPanelEntityId}
      />

      <Sheet
        open={!!panelEntityId}
        onOpenChange={(open) => {
          if (!open) setPanelEntityId(null);
        }}
      >
        <SheetContent side="right" className="w-full border-l p-0 sm:max-w-md">
          {panelEntityId && (
            <ContactDetailPanel
              entityId={panelEntityId}
              variant="panel"
              onClose={() => setPanelEntityId(null)}
              onOpenEntity={setPanelEntityId}
            />
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
