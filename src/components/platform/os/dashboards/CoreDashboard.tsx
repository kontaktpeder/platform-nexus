import { AlertTriangle, Sparkles } from "lucide-react";
import {
  DeltaBadge,
  Initials,
  OsCard,
  ProgressBar,
  RingProgress,
  Sparkline,
  StatusDot,
} from "@/components/platform/os/OsPrimitives";
import { core } from "@/lib/os/mock-data";
import { cn } from "@/lib/utils";

export function CoreDashboard() {
  const d = core;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        {d.kpis.map((k) => (
          <OsCard key={k.label} className="lg:col-span-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
                  {k.value}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {k.pct}% av mål
                </p>
                <div className="mt-1">
                  <DeltaBadge value={`${k.delta} vs i fjor`} />
                </div>
              </div>
              <RingProgress pct={k.pct} size={48} stroke={4}>
                <span className="text-[9px] font-semibold tabular-nums">{k.pct}%</span>
              </RingProgress>
            </div>
          </OsCard>
        ))}

        <OsCard
          title="Vekst mot mål"
          subtitle="Faktisk · Prognose · Mål"
          className="lg:col-span-7"
          footer="Se detaljer"
        >
          <Sparkline values={d.growthSeries.actual} className="h-28" />
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">YTD faktisk</p>
              <p className="font-semibold tabular-nums">{d.ytd.actual}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Årsprognose</p>
              <p className="font-semibold tabular-nums">{d.ytd.forecast}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gap til mål</p>
              <p className="font-semibold tabular-nums text-success">{d.ytd.gap}</p>
            </div>
          </div>
        </OsCard>

        <OsCard title="Salgspipeline" className="lg:col-span-5" footer="Se pipeline">
          <ul className="space-y-2.5">
            {d.pipeline.map((p) => (
              <li key={p.stage} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 font-medium text-muted-foreground">
                  {p.stage}
                </span>
                <ProgressBar
                  pct={
                    p.stage === "Ny"
                      ? 17
                      : p.stage === "Kvalifisert"
                        ? 28
                        : p.stage === "Tilbud"
                          ? 22
                          : p.stage === "Forhandling"
                            ? 21
                            : 13
                  }
                  className="flex-1"
                />
                <span className="w-20 text-right tabular-nums font-medium">
                  {p.value}
                </span>
                <span className="w-10 text-right text-xs text-muted-foreground">
                  {p.conversion}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Totalt {d.pipelineTotal.value} · Konvertering {d.pipelineTotal.conversion}
          </p>
        </OsCard>

        <OsCard title="Vekstinitiativ" className="lg:col-span-7" footer="Se initiativ">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Initiativ</th>
                  <th className="pb-2 font-medium">Ansvarlig</th>
                  <th className="pb-2 font-medium">Verdi</th>
                  <th className="pb-2 font-medium">Fremdrift</th>
                  <th className="pb-2 font-medium">Neste</th>
                </tr>
              </thead>
              <tbody>
                {d.initiatives.map((i) => (
                  <tr key={i.title} className="border-b border-border/40 last:border-0">
                    <td className="py-2.5 font-medium">{i.title}</td>
                    <td className="py-2.5">
                      <Initials value={i.owner} className="size-7 text-[10px]" />
                    </td>
                    <td className="py-2.5 tabular-nums text-muted-foreground">
                      {i.value}
                    </td>
                    <td className="py-2.5 min-w-[7rem]">
                      <ProgressBar pct={i.pct} />
                    </td>
                    <td className="py-2.5 tabular-nums text-muted-foreground">
                      {i.next}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OsCard>

        <OsCard title="Leveranse & kapasitet" className="lg:col-span-5">
          <div className="mb-4 flex items-center gap-4">
            <RingProgress pct={67} size={72} stroke={8}>
              <span className="text-sm font-semibold">{d.delivery.total}</span>
            </RingProgress>
            <ul className="flex-1 space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <StatusDot status="ok" /> På sporet · {d.delivery.onTrack}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot status="watch" /> Risiko · {d.delivery.risk}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot status="risk" /> Forsinket · {d.delivery.delayed}
              </li>
            </ul>
          </div>
          <p className="mb-1 text-xs text-muted-foreground">
            Kapasitetsutnyttelse {d.delivery.capacity}% (mål {d.delivery.capacityGoal}%)
          </p>
          <ProgressBar pct={d.delivery.capacity} className="mb-3" />
          <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span className="font-medium leading-snug">{d.delivery.alert}</span>
          </div>
        </OsCard>

        <OsCard title="Kunder å følge opp" className="lg:col-span-4" footer="Se kunder">
          <ul className="space-y-3">
            {d.customers.map((c) => (
              <li key={c.name} className="flex items-start gap-3">
                <Initials value={c.owner} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {c.value}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.next}</p>
                </div>
              </li>
            ))}
          </ul>
        </OsCard>

        <OsCard title="Beslutninger denne uken" className="lg:col-span-4">
          <ul className="space-y-3">
            {d.decisions.map((dec) => (
              <li key={dec.title} className="rounded-xl border border-border/60 p-3">
                <p className="text-sm font-medium">{dec.title}</p>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{dec.owner}</span>
                  <span
                    className={cn(
                      "font-medium",
                      dec.urgent ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {dec.due} igjen
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </OsCard>

        <OsCard title="Team-pulse" className="lg:col-span-4">
          <ul className="space-y-3">
            {d.teamPulse.map((t) => (
              <li
                key={t.label}
                className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5"
              >
                <span className="text-sm text-muted-foreground">{t.label}</span>
                <div className="text-right">
                  <p className="text-sm font-semibold">{t.value}</p>
                  <p
                    className={cn(
                      "text-xs",
                      t.status === "Følg opp" ? "text-warning" : "text-success",
                    )}
                  >
                    {t.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </OsCard>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-success/25 bg-success/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold text-foreground">Neste steg for CORE</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{d.nextSteps}</p>
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/90"
        >
          Foreslå neste beste steg
        </button>
      </div>
    </div>
  );
}
