import type { GlobalMissionAction, MissionSource } from "@/lib/mission-actions";

export type MissionFilter = "all" | MissionSource;

export function applyMissionFilter(
  actions: GlobalMissionAction[],
  filter: MissionFilter,
): GlobalMissionAction[] {
  if (filter === "all") return actions;
  return actions.filter((a) => a.source === filter);
}

const CHIPS: { label: string; value: MissionFilter }[] = [
  { label: "All", value: "all" },
  { label: "Gmail", value: "gmail" },
  { label: "Slack", value: "slack" },
  { label: "Workspaces", value: "workspace" },
];

export function MissionFilterChips({
  value,
  onChange,
  counts,
}: {
  value: MissionFilter;
  onChange: (f: MissionFilter) => void;
  counts?: Partial<Record<MissionFilter, number>>;
}) {
  return (
    <div className="mb-4 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2 pb-1">
        {CHIPS.map((c) => {
          const active = c.value === value;
          const count = counts?.[c.value];
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
              {typeof count === "number" && (
                <span className={`ml-1.5 text-[10px] ${active ? "opacity-80" : "opacity-60"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
