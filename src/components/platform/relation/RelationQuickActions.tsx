import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RelationQuickAction = {
  id: string;
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost";
  disabled?: boolean;
};

export function RelationQuickActions({
  actions,
  className,
}: {
  actions: RelationQuickAction[];
  className?: string;
}) {
  if (actions.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {actions.map((a) => (
        <Button
          key={a.id}
          type="button"
          variant={a.variant ?? "outline"}
          className="h-11 rounded-xl"
          disabled={a.disabled}
          onClick={a.onClick}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}
