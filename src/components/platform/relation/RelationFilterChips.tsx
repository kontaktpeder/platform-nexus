/** Mission list filters — tab style like the product mockup. */

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
    <div className="-mx-1 overflow-x-auto border-b border-border px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-1 pb-0">
        {CHIPS.map((c) => {
          const active = c.value === value;
          const count = counts?.[c.value];
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              className={`relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
              {typeof count === "number" && (
                <span className={`ml-1.5 text-xs ${active ? "text-primary/80" : "opacity-60"}`}>
                  ({count})
                </span>
              )}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
