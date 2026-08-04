import { Filter } from "lucide-react";
import { WeeklyControlCard } from "@/components/platform/mission/WeeklyControlCard";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Mission weekly plan (NÅ / venter / regnvær / idé / læring) in a sheet.
 * Same data as /mission — Supabase weekly_plans.
 */
export function WeekFocusSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2 font-heading">
            <Filter className="size-4 text-primary" />
            Ukesmal
          </SheetTitle>
          <SheetDescription>
            Samme kontrollag som i Mission. Du fyller inn — systemet husker.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-1">
          <WeeklyControlCard className="mt-0" defaultOpen />
        </div>
      </SheetContent>
    </Sheet>
  );
}
