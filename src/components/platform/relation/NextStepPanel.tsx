import { Button } from "@/components/ui/button";
import { AiHint } from "@/components/platform/relation/AiHint";
import { cn } from "@/lib/utils";

export function NextStepPanel({
  action,
  fromAi = false,
  onPlanToday,
  onPlanTomorrow,
  className,
}: {
  action: string;
  fromAi?: boolean;
  onPlanToday?: () => void;
  onPlanTomorrow?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Neste steg
      </p>
      <p className="mt-1 text-sm font-medium leading-snug">{action}</p>
      {(onPlanToday || onPlanTomorrow) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onPlanToday && (
            <Button type="button" size="sm" className="rounded-xl" onClick={onPlanToday}>
              I dag
            </Button>
          )}
          {onPlanTomorrow && (
            <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onPlanTomorrow}>
              I morgen
            </Button>
          )}
        </div>
      )}
    </>
  );

  if (fromAi) {
    return <AiHint className={className}>{body}</AiHint>;
  }

  return (
    <div className={cn("rounded-2xl border border-border bg-muted/40 p-4", className)}>
      {body}
    </div>
  );
}
