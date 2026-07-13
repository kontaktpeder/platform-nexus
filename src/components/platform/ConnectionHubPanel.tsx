import { Link } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import { ArrowRight, Building2, Globe } from "lucide-react";
import type { ConnectionHubItem, ConnectionHubResponse } from "@/lib/connection-hub.types";
import { PLATFORM_META } from "@/lib/connection-hub.types";
import { ConnectionStatusBadge } from "@/components/platform/ConnectionStatusBadge";
import { Button } from "@/components/ui/button";
import {
  ConnectionGapsPanel,
  ConnectionMatrixTable,
} from "@/components/platform/ConnectionMatrix";

import type { LucideIcon } from "lucide-react";

function iconFor(name: string): LucideIcon {
  const key = name
    .split("-")
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join("");
  return (Icons as unknown as Record<string, LucideIcon>)[key] ?? Icons.Package;
}

function HubItemRow({ item }: { item: ConnectionHubItem }) {
  const meta = PLATFORM_META[item.platform];
  const Icon = iconFor(meta.icon);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.name}</span>
          <ConnectionStatusBadge status={item.status} label={item.statusLabel} />
          {item.workspaceName && (
            <span className="text-[11px] text-muted-foreground">· {item.workspaceName}</span>
          )}
        </div>
        {item.detail && (
          <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
        )}
        {item.externalOrgId && (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Ekstern org: {item.externalOrgName ?? item.externalOrgId}
          </p>
        )}
        {item.lastVerifiedAt && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Sist verifisert: {new Date(item.lastVerifiedAt).toLocaleString("nb-NO")}
          </p>
        )}
      </div>
      {item.configureHref && (
        <Button asChild size="sm" variant="outline" className="shrink-0 text-xs">
          <a href={item.configureHref}>
            Konfigurer
            <ArrowRight className="ml-1 h-3 w-3" />
          </a>
        </Button>
      )}
    </div>
  );
}

export function ConnectionHubSummaryBar({ hub }: { hub: ConnectionHubResponse }) {
  const { summary } = hub;
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-emerald-800 dark:text-emerald-300">
        {summary.connected} koblet
      </span>
      {summary.missing > 0 && (
        <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-amber-900 dark:text-amber-200">
          {summary.missing} mangler
        </span>
      )}
      {summary.errors > 0 && (
        <span className="rounded-lg bg-red-500/10 px-2.5 py-1 text-red-800 dark:text-red-300">
          {summary.errors} trenger oppmerksomhet
        </span>
      )}
    </div>
  );
}

export function ConnectionHubPanel({ hub }: { hub: ConnectionHubResponse }) {
  return (
    <div className="space-y-8">
      <ConnectionHubSummaryBar hub={hub} />

      <ConnectionGapsPanel hub={hub} />

      <ConnectionMatrixTable hub={hub} />

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-heading text-base font-semibold">Integrasjoner (alle org)</h2>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Gmail og Slack er koblet på plattform-nivå — samme for alle organisasjoner i denne
          installasjonen.
        </p>
        <div className="grid gap-2">
          {hub.deployment.map((item) => (
            <HubItemRow key={item.platform} item={item} />
          ))}
        </div>
      </section>

      {hub.workspaces.map((ws) => (
        <section key={ws.id}>
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-heading text-base font-semibold">{ws.name}</h2>
            <span className="text-xs text-muted-foreground">arbeidsflate</span>
          </div>
          <div className="grid gap-2">
            {ws.items.map((item) => (
              <HubItemRow key={`${ws.id}-${item.platform}`} item={item} />
            ))}
          </div>
        </section>
      ))}

      {hub.externalOrgs.length > 0 && (
        <section className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
          <h2 className="font-heading text-sm font-semibold">Eksterne organisasjoner koblet</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Hvilke org-ID-er i Finance/Work som er koblet til denne Platform-organisasjonen.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {hub.externalOrgs.map((eo) => (
              <li key={`${eo.platform}-${eo.externalOrgId}`} className="rounded-lg bg-background px-3 py-2">
                <span className="font-medium">{PLATFORM_META[eo.platform].name}</span>
                <span className="text-muted-foreground"> → </span>
                <span>{eo.externalOrgName ?? eo.externalOrgId}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Arbeidsflater: {eo.linkedWorkspaces.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
