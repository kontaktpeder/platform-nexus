/** Mission list filters — relationship status, not source (Gmail/Slack). */

export type RelationListFilter =
  | "all"
  | "waiting_on_me"
  | "upcoming"
  | "quiet"
  | "done";

const CHIPS: { label: string; value: RelationListFilter }[] = [
  { label: "Alle", value: "all" },
  { label: "Venter på meg", value: "waiting_on_me" },
  { label: "Kommende", value: "upcoming" },
  { label: "Ingen aktivitet", value: "quiet" },
  { label: "Fullført i dag", value: "done" },
];

export function RelationFilterChips({
  value,
  onChange,
  counts,
}: {
  value: RelationListFilter;
  onChange: (f: RelationListFilter) => void;
  counts?: Partial<Record<RelationListFilter, number>>;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2 pb-1">
        {CHIPS.map((c) => {
          const active = c.value === value;
          const count = counts?.[c.value];
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
              {typeof count === "number" && count > 0 && (
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
