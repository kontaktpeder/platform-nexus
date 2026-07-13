import { ExternalLink, Pin } from "lucide-react";
import type { MorningMissionItem } from "@/lib/morning-mission.types";

function osloWeekLabel(): string {
  const now = new Date();
  const week = new Intl.DateTimeFormat("nb-NO", {
    week: "numeric",
    timeZone: "Europe/Oslo",
  }).format(now);
  const month = new Intl.DateTimeFormat("nb-NO", {
    month: "long",
    timeZone: "Europe/Oslo",
  }).format(now);
  return `Uke ${week} · ${month}`;
}

function WeeklyPlanBullet({ item }: { item: MorningMissionItem }) {
  return (
    <li className="group relative pl-0">
      <div className="flex gap-2.5">
        <span
          className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70"
          aria-hidden
        />
        <div className="min-w-0 flex-1 border-b border-dashed border-foreground/10 pb-3 last:border-0">
          <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
          {item.explanation && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.explanation}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {item.source_label && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                {item.source_label}
              </span>
            )}
            {item.href && (
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Åpne
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function WeeklyPlanBoard({
  summary,
  items,
}: {
  summary?: string | null;
  items: MorningMissionItem[];
}) {
  const hasContent = Boolean(summary?.trim()) || items.length > 0;

  return (
    <aside
      className="lg:sticky lg:top-6 lg:self-start"
      aria-label="Ukeplan"
    >
      <div className="relative overflow-hidden rounded-2xl border border-amber-900/10 bg-[#f7f3ea] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(0,0,0,0.04)] dark:border-amber-100/10 dark:bg-[#1c1914] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.12]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(120,90,40,0.06) 27px, rgba(120,90,40,0.06) 28px)",
          }}
        />

        <div className="relative p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-amber-900/70 dark:text-amber-200/70">
                <Pin className="h-3.5 w-3.5 rotate-45" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                  Ukeplan
                </span>
              </div>
              <h2 className="mt-1 font-heading text-lg font-semibold leading-tight text-foreground">
                {osloWeekLabel()}
              </h2>
            </div>
            {items.length > 0 && (
              <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {items.length}
              </span>
            )}
          </div>

          {summary?.trim() && (
            <p className="mt-3 text-sm leading-relaxed text-foreground/80">{summary}</p>
          )}

          {items.length > 0 ? (
            <ul className="mt-4 space-y-1" role="list">
              {items.map((item) => (
                <WeeklyPlanBullet key={item.id} item={item} />
              ))}
            </ul>
          ) : hasContent ? null : (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Ingen ukepunkter ennå. Mission fyller tavlen når den finner ting som hører til uka
              — fra e-post, Slack, Finance og andre moduler.
            </p>
          )}

          <p className="mt-4 border-t border-dashed border-foreground/10 pt-3 text-[11px] text-muted-foreground">
            Tavlen oppdateres når du trykker Oppdater. Avkryssing kommer senere.
          </p>
        </div>
      </div>
    </aside>
  );
}
