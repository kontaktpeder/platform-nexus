import { Filter } from "lucide-react";
import type { ReactNode } from "react";
import { useWeekFocus } from "@/hooks/useWeekFocus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

/**
 * Weekly bottleneck template — fills «what deserves time this week».
 * Persists in localStorage (v0); can later move to knowledge/personal context.
 */
export function WeekFocusSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { focus, patch, save } = useWeekFocus();

  function handleSave() {
    save(focus);
    toast.success("Ukesmal lagret");
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2 font-heading">
            <Filter className="size-4 text-primary" />
            Ukesmal — flaskehals
          </SheetTitle>
          <SheetDescription>
            Fyll ut for å se hva som fortjener tid denne uken. Fokus nå kan bygges på dette.
          </SheetDescription>
          <p className="pt-1 text-xs font-medium text-muted-foreground">{focus.weekKey}</p>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <Field
            label="Denne ukens flaskehals"
            hint="Hva begrenser fremdrift mest akkurat nå?"
          >
            <Textarea
              value={focus.bottleneck}
              onChange={(e) => patch({ bottleneck: e.target.value })}
              placeholder="F.eks. Ingen klar prisstrategi for Q4"
              className="min-h-[72px] rounded-xl"
            />
          </Field>

          <Field label="Hvorfor det er viktig" hint="Hva skjer hvis den ikke løses?">
            <Textarea
              value={focus.why}
              onChange={(e) => patch({ why: e.target.value })}
              placeholder="Mister tempo i salg / kapasitet / likviditet…"
              className="min-h-[64px] rounded-xl"
            />
          </Field>

          <Field label="Hva låser den opp" hint="Én konkret bevegelse som løser flaskehalsen">
            <Textarea
              value={focus.unlock}
              onChange={(e) => patch({ unlock: e.target.value })}
              placeholder="Beslutte pris + sende til nøkkelkunder"
              className="min-h-[64px] rounded-xl"
            />
          </Field>

          <div className="space-y-3">
            <p className="text-sm font-medium">Tre fokusområder denne uken</p>
            {(
              [
                ["focus1", "1.", focus.focus1],
                ["focus2", "2.", focus.focus2],
                ["focus3", "3.", focus.focus3],
              ] as const
            ).map(([key, prefix, value]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {prefix}
                </span>
                <Input
                  value={value}
                  onChange={(e) => patch({ [key]: e.target.value })}
                  placeholder={`Fokus ${prefix.replace(".", "")}`}
                  className="rounded-xl"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-t border-border/60 px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Lukk
          </Button>
          <Button type="button" className="flex-1 rounded-xl" onClick={handleSave}>
            Lagre ukesmal
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
