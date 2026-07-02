import type { GlobalMissionAction, MissionTier } from "@/lib/mission-actions";
import { GlobalActionCard } from "./GlobalActionCard";

const TIERS: { key: MissionTier; label: string }[] = [
  { key: "urgent", label: "Urgent" },
  { key: "important", label: "Important" },
  { key: "later", label: "Later" },
];

export function GlobalActionList({ actions }: { actions: GlobalMissionAction[] }) {
  if (actions.length === 0) {
    return (
      <div className="surface-card p-6 text-center text-sm text-muted-foreground">
        You're all caught up across all workspaces.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {TIERS.map((t) => {
        const rows = actions.filter((a) => a.tier === t.key);
        if (rows.length === 0) return null;
        return (
          <section key={t.key}>
            <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t.label}
            </h2>
            <div className="grid gap-2">
              {rows.map((a) => (
                <GlobalActionCard key={a.key} action={a} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
