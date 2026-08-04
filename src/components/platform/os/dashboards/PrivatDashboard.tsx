import { Check } from "lucide-react";
import {
  Initials,
  OsCard,
  ProgressBar,
  RingProgress,
  Sparkline,
  StatusDot,
} from "@/components/platform/os/OsPrimitives";
import { privat } from "@/lib/os/mock-data";

export function PrivatDashboard() {
  const d = privat;

  return (
    <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-12 lg:gap-5">
      <OsCard title="Livsbalanse" className="lg:col-span-4" footer="Se detaljer" tone="hero">
        <div className="flex items-center gap-6">
          <RingProgress pct={d.balanceScore} size={120} stroke={8}>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-white">
                {d.balanceScore}
              </p>
            </div>
          </RingProgress>
          <div className="flex-1 space-y-2">
            <p className="text-sm font-semibold text-white">{d.balanceLabel}</p>
            <ul className="space-y-1.5">
              {d.balanceAreas.map((a) => (
                <li key={a.label} className="flex items-center gap-2 text-sm">
                  <StatusDot status={a.status} />
                  <span className="text-white/80">{a.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </OsCard>

      <OsCard title="Denne uken" className="lg:col-span-4" footer="Se uke">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Kalenderøyeblikk
            </p>
            <ul className="space-y-2.5">
              {d.weekEvents.map((e) => (
                <li key={e.title} className="flex gap-2 text-sm">
                  <span className="w-8 shrink-0 text-xs font-medium text-primary">
                    {e.day}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{e.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Dine 3 viktigste denne uken
            </p>
            <ol className="space-y-2.5">
              {d.weekPriorities.map((p, i) => (
                <li key={p} className="flex gap-2 text-sm">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="font-medium leading-snug text-foreground">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </OsCard>

      <OsCard title="Helse & energi" className="lg:col-span-4" footer="Se helse">
        <ul className="space-y-3.5">
          {d.health.map((h) => (
            <li key={h.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{h.label}</span>
                <span className="tabular-nums text-muted-foreground">{h.value}</span>
              </div>
              <div className="flex items-center gap-2">
                <ProgressBar
                  pct={h.pct}
                  className="flex-1"
                  tone={h.pct >= 100 ? "success" : "primary"}
                />
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                  {h.pct}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      </OsCard>

      <OsCard title="Privatøkonomi" className="lg:col-span-4" footer="Se økonomi" tone="soft">
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <p className="text-xs text-muted-foreground">Tilgjengelig</p>
            <p className="text-sm font-semibold tabular-nums">{d.economy.available}</p>
          </div>
          <div className="rounded-xl bg-success/15 p-2.5">
            <p className="text-xs text-muted-foreground">Spart i mnd</p>
            <p className="text-sm font-semibold tabular-nums text-success">
              {d.economy.saved}
            </p>
          </div>
          <div className="rounded-xl bg-warning/20 p-2.5">
            <p className="text-xs text-muted-foreground">Buffer</p>
            <p className="text-sm font-semibold tabular-nums">{d.economy.buffer}</p>
          </div>
        </div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Utvikling siste 6 mnd</p>
          <span className="text-xs font-medium text-success">{d.economy.trend}</span>
        </div>
        <Sparkline values={d.economy.sparkline} />
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-medium">{d.economy.goal.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {d.economy.goal.pct}%
            </span>
          </div>
          <ProgressBar pct={d.economy.goal.pct} />
        </div>
      </OsCard>

      <OsCard title="Relasjoner" className="lg:col-span-4" footer="Se relasjoner">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Følg opp</p>
        <ul className="mb-4 space-y-2.5">
          {d.followUps.map((f) => (
            <li key={f.name} className="flex items-center gap-3">
              <Initials value={f.initials} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">Sist: {f.last}</p>
              </div>
              <button
                type="button"
                className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
              >
                Følg opp
              </button>
            </li>
          ))}
        </ul>
        <div className="rounded-xl bg-muted/60 p-3">
          <p className="text-xs text-muted-foreground">Kommende anledning</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-sm font-medium">{d.occasion.title}</p>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <Check className="size-3.5" />
              {d.occasion.status}
            </span>
          </div>
        </div>
      </OsCard>

      <OsCard
        title="Hjem & administrasjon"
        className="lg:col-span-2"
        footer="Se alt"
      >
        <ul className="space-y-2.5">
          {d.homeTasks.map((t) => (
            <li key={t.title} className="flex items-start gap-2 text-sm">
              <span className="mt-1 size-3.5 shrink-0 rounded border border-border" />
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.due}</p>
              </div>
            </li>
          ))}
        </ul>
      </OsCard>

      <OsCard title="Mål & utvikling" className="lg:col-span-2" footer="Se mål">
        <ul className="space-y-4">
          {d.goals.map((g, i) => (
            <li key={g.title}>
              <p className="text-sm font-medium leading-snug">{g.title}</p>
              <p className="mb-1.5 mt-0.5 text-xs tabular-nums text-muted-foreground">
                {g.progress}
              </p>
              <ProgressBar pct={g.pct} tone={i === 1 ? "success" : "primary"} />
            </li>
          ))}
        </ul>
      </OsCard>
    </div>
  );
}
