import { useState } from "react";
import { DeskQueuePanel } from "@/components/platform/desk/DeskQueuePanel";
import {
  Initials,
  OsCard,
  RingProgress,
  Sparkline,
  StatusDot,
} from "@/components/platform/os/OsPrimitives";
import { ContactDetailPanel } from "@/components/platform/relation/ContactDetailPanel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { heleLivet } from "@/lib/os/mock-data";

export function HeleLivetDashboard() {
  const d = heleLivet;
  const [panelEntityId, setPanelEntityId] = useState<string | null>(null);

  return (
    <>
      <div className="grid gap-4 p-6 lg:grid-cols-12 lg:gap-5">
        <OsCard title="Dagens flyt" className="lg:col-span-3" footer="Se kalender">
          <ol className="relative space-y-4 border-l border-border/80 pl-4">
            {d.timeline.map((item) => (
              <li key={`${item.time}-${item.title}`} className="relative">
                <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" />
                <p className="text-xs font-medium tabular-nums text-muted-foreground">
                  {item.time}
                </p>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
              </li>
            ))}
          </ol>
        </OsCard>

        {/* Kø = Topp 3 — full actions, adapted width */}
        <div className="lg:col-span-5">
          <DeskQueuePanel
            variant="dashboard"
            onOpenContact={setPanelEntityId}
          />
        </div>

        <OsCard title="Energi & rutiner" className="lg:col-span-4" footer="Se detaljer" tone="soft">
          <div className="flex flex-wrap justify-around gap-4">
            {d.energy.map((e) => (
              <div key={e.label} className="flex flex-col items-center gap-1.5">
                <RingProgress pct={e.pct} size={72} stroke={6}>
                  <span className="text-[10px] font-semibold tabular-nums text-foreground">
                    {e.pct}%
                  </span>
                </RingProgress>
                <p className="text-xs font-medium text-foreground">{e.label}</p>
                <p className="text-[11px] text-muted-foreground">{e.value}</p>
              </div>
            ))}
          </div>
        </OsCard>

        <OsCard title="Business-puls" className="lg:col-span-4" footer="Se business" tone="hero">
          <div className="grid grid-cols-2 gap-3">
            {d.businessPulse.map((k) => (
              <div key={k.label}>
                <p className="text-xs text-white/70">{k.label}</p>
                <p className="text-sm font-semibold tabular-nums text-white">
                  {k.value}
                </p>
                <span className="text-xs font-medium text-warning">{k.delta}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Sparkline values={d.sparkline} stroke="oklch(0.85 0.12 85)" />
            <p className="mt-1 text-[11px] text-white/65">Siste 12 mnd mot mål</p>
          </div>
        </OsCard>

        <OsCard title="Organisasjoner" className="lg:col-span-8" footer="Se portefølje">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Organisasjon</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Vekst 12 mnd</th>
                  <th className="pb-2 font-medium">Oppmerksomhet</th>
                </tr>
              </thead>
              <tbody>
                {d.orgs.map((org) => (
                  <tr key={org.name} className="border-b border-border/40 last:border-0">
                    <td className="py-2.5 font-medium text-foreground">{org.name}</td>
                    <td className="py-2.5 text-muted-foreground">{org.status}</td>
                    <td className="py-2.5 tabular-nums text-success">{org.growth}</td>
                    <td className="py-2.5">
                      <StatusDot status={org.attention} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OsCard>

        <OsCard title="Relasjoner" className="lg:col-span-12" footer="Se relasjoner">
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            Viktige oppfølginger
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.relations.map((r) => (
              <li key={r.name} className="flex items-center gap-3">
                <Initials value={r.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.role}</p>
                </div>
                <span className="rounded-md bg-warning/20 px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {r.tag}
                </span>
                <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                  {r.when}
                </span>
              </li>
            ))}
          </ul>
        </OsCard>
      </div>

      <Sheet
        open={!!panelEntityId}
        onOpenChange={(open) => {
          if (!open) setPanelEntityId(null);
        }}
      >
        <SheetContent side="right" className="w-full border-l p-0 sm:max-w-md">
          {panelEntityId && (
            <ContactDetailPanel
              entityId={panelEntityId}
              variant="panel"
              onClose={() => setPanelEntityId(null)}
              onOpenEntity={setPanelEntityId}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
