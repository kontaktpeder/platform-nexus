import type { GlobalMissionAction } from "@/lib/mission-actions";

export type MissionFilter =
  | { kind: "all" }
  | { kind: "org"; orgSlug: string }
  | { kind: "module"; moduleSlug: string };

function filterKey(f: MissionFilter): string {
  if (f.kind === "all") return "all";
  if (f.kind === "org") return `org:${f.orgSlug}`;
  return `mod:${f.moduleSlug}`;
}

export function applyMissionFilter(
  actions: GlobalMissionAction[],
  filter: MissionFilter,
): GlobalMissionAction[] {
  if (filter.kind === "all") return actions;
  if (filter.kind === "org") return actions.filter((a) => a.orgSlug === filter.orgSlug);
  return actions.filter((a) => a.moduleSlug === filter.moduleSlug);
}

export function MissionFilterChips({
  orgs,
  value,
  onChange,
}: {
  orgs: { name: string; slug: string }[];
  value: MissionFilter;
  onChange: (f: MissionFilter) => void;
}) {
  const chips: { label: string; filter: MissionFilter }[] = [
    { label: "All", filter: { kind: "all" } },
    ...orgs.map((o) => ({
      label: o.name,
      filter: { kind: "org" as const, orgSlug: o.slug },
    })),
    { label: "Finance", filter: { kind: "module", moduleSlug: "finance" } },
    { label: "Work", filter: { kind: "module", moduleSlug: "work" } },
  ];

  const activeKey = filterKey(value);

  return (
    <div className="mb-4 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2 pb-1">
        {chips.map((c) => {
          const key = filterKey(c.filter);
          const active = key === activeKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(c.filter)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
