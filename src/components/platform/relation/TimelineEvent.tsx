import { Mail, MessageSquare, MapPin, Landmark, Briefcase, Sparkles, Circle } from "lucide-react";
import type { RelationSourceKind } from "@/lib/relation/types";
import { RELATION_SOURCE_LABEL } from "@/lib/relation/types";
import { cn } from "@/lib/utils";

const ICONS: Record<RelationSourceKind, typeof Mail> = {
  gmail: Mail,
  slack: MessageSquare,
  felt: MapPin,
  finance: Landmark,
  work: Briefcase,
  ai: Sparkles,
  system: Circle,
  manual: Circle,
};

export function TimelineEvent({
  atLabel,
  title,
  detail,
  sourceKind,
  className,
}: {
  atLabel: string;
  title: string;
  detail?: string | null;
  sourceKind?: RelationSourceKind | null;
  className?: string;
}) {
  const Icon = sourceKind ? ICONS[sourceKind] : Circle;
  return (
    <li className={cn("relative pb-5 pl-5 last:pb-0", className)}>
      <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary/70" />
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {atLabel}
            {sourceKind ? ` · ${RELATION_SOURCE_LABEL[sourceKind]}` : ""}
          </p>
          <p className="text-sm font-medium leading-snug">{title}</p>
          {detail && <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>}
        </div>
      </div>
    </li>
  );
}
