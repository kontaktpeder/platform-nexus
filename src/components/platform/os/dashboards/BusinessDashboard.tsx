import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  DeltaBadge,
  OsCard,
  RingProgress,
  Sparkline,
  StatusDot,
} from "@/components/platform/os/OsPrimitives";
import { business } from "@/lib/os/mock-data";
import { cn } from "@/lib/utils";

export function BusinessDashboard() {
  const d = business;

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-12 lg:gap-5">
      {d.kpis.map((k) => (
        <OsCard key={k.label} className="lg:col-span-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
                {k.value}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Mål: {k.goal}</p>
              <div className="mt-1">
                <DeltaBadge value={k.delta} />
              </div>
            </div>
            <RingProgress pct={k.pct} size={48} stroke={4}>
              <span className="text-[9px] font-semibold tabular-nums">{k.pct}%</span>
            </RingProgress>
          </div>
        </OsCard>
      ))}

      <OsCard
        title="Porteføljeutvikling"
        subtitle="Omsetning og driftsresultat · 12 mnd"
        className="lg:col-span-7"
        footer="Se analyse"
      >
        <Sparkline values={d.portfolioSeries.revenue} className="h-24" />
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" /> Omsetning
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" /> Resultat (trend)
          </span>
          <span className="text-muted-foreground/80">Inkl. prognose</span>
        </div>
        <div className="mt-3">
          <Sparkline
            values={d.portfolioSeries.result}
            stroke="var(--success)"
            className="h-12 opacity-80"
          />
        </div>
      </OsCard>

      <OsCard title="Organisasjoner" className="lg:col-span-5" footer="Se alle">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Navn</th>
                <th className="pb-2 font-medium">Omsetning</th>
                <th className="pb-2 font-medium">Vekst</th>
                <th className="pb-2 font-medium">Margin</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {d.orgs.map((o) => (
                <tr key={o.name} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 font-medium">{o.name}</td>
                  <td className="py-2.5 tabular-nums text-muted-foreground">
                    {o.revenue}
                  </td>
                  <td className="py-2.5 tabular-nums text-success">{o.growth}</td>
                  <td className="py-2.5 tabular-nums">{o.margin}</td>
                  <td className="py-2.5">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-xs font-medium",
                        o.status === "Sterk"
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OsCard>

      <OsCard title="Vekstmuligheter" className="lg:col-span-3" footer="Ranger">
        <ul className="space-y-3">
          {d.opportunities.map((o, i) => (
            <li key={o.title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{o.title}</p>
                <p className="text-xs text-muted-foreground">
                  {o.value} · Innsats {o.effort}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </OsCard>

      <OsCard title="Beslutninger" className="lg:col-span-3">
        <ul className="space-y-3">
          {d.decisions.map((dec) => (
            <li
              key={dec.title}
              className={cn(
                "rounded-xl border p-3",
                dec.urgent ? "border-destructive/30 bg-destructive/5" : "border-border/60",
              )}
            >
              <p className="text-sm font-medium">{dec.title}</p>
              <p
                className={cn(
                  "mt-1 text-xs font-medium",
                  dec.urgent ? "text-destructive" : "text-muted-foreground",
                )}
              >
                Frist: {dec.due}
              </p>
            </li>
          ))}
        </ul>
      </OsCard>

      <OsCard title="Risiko & oppmerksomhet" className="lg:col-span-3">
        <ul className="space-y-3">
          {d.risks.map((r) => (
            <li key={r.title} className="flex items-start gap-2.5 text-sm">
              {r.level === "risk" && (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              {r.level === "watch" && <StatusDot status="watch" className="mt-1.5" />}
              {r.level === "ok" && (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              )}
              <span className="font-medium leading-snug">{r.title}</span>
            </li>
          ))}
        </ul>
      </OsCard>

      <div className="flex flex-col gap-4 lg:col-span-3">
        <OsCard title="Kapitalfordeling">
          <div className="flex items-center gap-4">
            <RingProgress pct={d.capital[0]?.pct ?? 0} size={72} stroke={8}>
              <span className="text-xs font-semibold">{d.capital[0]?.pct}%</span>
            </RingProgress>
            <ul className="flex-1 space-y-1.5">
              {d.capital.map((c) => (
                <li key={c.name} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{c.name}</span>
                  <span className="font-medium tabular-nums">{c.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </OsCard>

        <OsCard title="Denne ukens fokus">
          <ul className="space-y-2.5">
            {d.weekFocus.map((f) => (
              <li key={f.title} className="flex items-start gap-2 text-sm">
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                    f.done
                      ? "border-success bg-success text-white"
                      : "border-border",
                  )}
                >
                  {f.done && <CheckCircle2 className="size-3" />}
                </span>
                <span className={cn(f.done && "text-muted-foreground line-through")}>
                  {f.title}
                </span>
              </li>
            ))}
          </ul>
        </OsCard>
      </div>
    </div>
  );
}
