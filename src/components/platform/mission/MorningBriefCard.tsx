import { Mail, MessageSquare, Layers, Sparkles, ArrowRight } from "lucide-react";
import type { MorningBrief } from "@/lib/mission-actions";

const SOURCE_LABEL = { gmail: "Gmail", slack: "Slack", workspace: "Workspaces" } as const;

function summarize(brief: MorningBrief): string {
  if (brief.total === 0) return "";
  const parts: string[] = [];
  if (brief.byTier.urgent > 0)
    parts.push(`${brief.byTier.urgent} urgent`);
  if (brief.byTier.important > 0)
    parts.push(`${brief.byTier.important} important`);
  if (parts.length === 0 && brief.byTier.later > 0)
    parts.push(`${brief.byTier.later} to review later`);

  const sources: string[] = [];
  (["gmail", "slack", "workspace"] as const).forEach((s) => {
    if (brief.bySource[s] > 0) sources.push(`${brief.bySource[s]} ${SOURCE_LABEL[s]}`);
  });

  const lead = parts.length
    ? `You have ${parts.join(" and ")} across ${brief.total} action${brief.total === 1 ? "" : "s"}.`
    : `You have ${brief.total} action${brief.total === 1 ? "" : "s"} to review.`;
  const tail = sources.length ? ` Sources: ${sources.join(", ")}.` : "";
  return lead + tail;
}

export function MorningBriefCard({ brief }: { brief: MorningBrief }) {
  if (brief.total === 0) {
    return (
      <section className="surface-card mt-4 flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-muted text-muted-foreground">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">You're all caught up.</div>
          <div className="text-xs text-muted-foreground">
            Nothing urgent across Gmail, Slack, or your workspaces.
          </div>
        </div>
      </section>
    );
  }

  const rec = brief.recommended;
  const canOpen = !!rec?.href;

  return (
    <section className="surface-card mt-4 p-4">
      <header className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold">Morning brief</h2>
      </header>

      <p className="text-sm text-foreground">{summarize(brief)}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <BriefBadge icon={<Mail className="h-3 w-3" />} label={`Gmail ${brief.bySource.gmail}`} />
        <BriefBadge icon={<MessageSquare className="h-3 w-3" />} label={`Slack ${brief.bySource.slack}`} />
        <BriefBadge icon={<Layers className="h-3 w-3" />} label={`Workspaces ${brief.bySource.workspace}`} />
      </div>

      {rec ? (
        <div className="mt-4 rounded-lg border border-border/60 bg-muted/40 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Start with this
          </div>
          <div className="mt-1 truncate text-sm font-medium">{rec.title}</div>
          {rec.description ? (
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{rec.description}</div>
          ) : null}
          <div className="mt-3">
            {canOpen ? (
              <a
                href={rec.href!}
                target={rec.source === "workspace" ? undefined : "_blank"}
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Start with this
                <ArrowRight className="h-3 w-3" />
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                title="No deep link available"
              >
                No deep link available
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BriefBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}
