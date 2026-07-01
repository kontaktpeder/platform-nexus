import { Sparkles } from "lucide-react";

export function WidgetSlot({ moduleName, title, hint }: { moduleName: string; title: string; hint?: string }) {
  return (
    <div className="surface-card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{moduleName}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary">
          <Sparkles className="h-3 w-3" /> Kommer
        </span>
      </div>
      <div className="font-heading text-lg font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground">{hint ?? "Dataene fylles inn når modulen kobles til Platform Core."}</div>
    </div>
  );
}
