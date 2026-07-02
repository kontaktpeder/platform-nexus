import type { MissionAction } from "@/lib/mission-actions";
import { ActionCard } from "./ActionCard";

export function NextActions({ actions }: { actions: MissionAction[] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Next actions
      </h2>
      {actions.length === 0 ? (
        <div className="surface-card p-4 text-sm text-muted-foreground">
          You're all caught up for now.
        </div>
      ) : (
        <div className="grid gap-2">
          {actions.map((a) => (
            <ActionCard
              key={a.key}
              title={a.title}
              description={a.description}
              moduleName={a.moduleName}
              href={a.href}
              kind={a.kind}
            />
          ))}
        </div>
      )}
    </section>
  );
}
