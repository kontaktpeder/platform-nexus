import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { ConnectionGap, ConnectionHubResponse } from "@/lib/connection-hub.types";
import { PLATFORM_META } from "@/lib/connection-hub.types";
import {
  MATRIX_PLATFORM_ORDER,
  matrixStatusColor,
} from "@/lib/connection-hub-insights.server";

const SEVERITY_ICON = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_BORDER = {
  error: "border-red-500/30 bg-red-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  info: "border-border bg-muted/30",
};

function GapRow({ gap }: { gap: ConnectionGap }) {
  const Icon = SEVERITY_ICON[gap.severity];
  return (
    <li
      className={`rounded-lg border px-3 py-2.5 text-sm ${SEVERITY_BORDER[gap.severity]}`}
    >
      <div className="flex gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{gap.title}</p>
          <p className="mt-0.5 text-muted-foreground">{gap.description}</p>
          {gap.actionHref && (
            <a
              href={gap.actionHref}
              className="mt-1.5 inline-block text-xs font-medium underline-offset-2 hover:underline"
            >
              Gå til oppsett →
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export function ConnectionGapsPanel({ hub }: { hub: ConnectionHubResponse }) {
  const gaps = hub.gaps ?? [];
  const actionable = gaps.filter((g) => g.severity !== "info");
  const info = gaps.filter((g) => g.severity === "info");

  if (gaps.length === 0) return null;

  return (
    <section className="space-y-4">
      {actionable.length > 0 && (
        <div>
          <h2 className="font-heading text-base font-semibold">Mangler og avvik</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dette bør du sjekke for å få riktig kobling mellom organisasjoner.
          </p>
          <ul className="mt-3 space-y-2">
            {actionable.map((gap, i) => (
              <GapRow key={`${gap.title}-${i}`} gap={gap} />
            ))}
          </ul>
        </div>
      )}
      {info.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Info</h3>
          <ul className="mt-2 space-y-2">
            {info.map((gap, i) => (
              <GapRow key={`info-${gap.title}-${i}`} gap={gap} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ConnectionMatrixTable({ hub }: { hub: ConnectionHubResponse }) {
  const rows = hub.matrix ?? [];
  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="font-heading text-base font-semibold">Koblingsmatrise</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Platform-org «{hub.org.name}» på tvers av arbeidsflater og plattformer.
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40">
              <th className="px-3 py-2.5 font-medium">Scope</th>
              {MATRIX_PLATFORM_ORDER.map((p) => (
                <th key={p} className="px-3 py-2.5 font-medium">
                  {PLATFORM_META[p].name.replace(" Core", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2.5 align-top">
                  <div className="font-medium">{row.label}</div>
                  {row.kind === "workspace" && (
                    <span className="text-[11px] text-muted-foreground">arbeidsflate</span>
                  )}
                  {row.configureHref && (
                    <a
                      href={row.configureHref}
                      className="mt-0.5 block text-[11px] text-primary hover:underline"
                    >
                      Konfigurer
                    </a>
                  )}
                </td>
                {MATRIX_PLATFORM_ORDER.map((p) => {
                  const cell = row.cells[p];
                  if (!cell) {
                    return (
                      <td key={p} className="px-3 py-2.5 text-center text-muted-foreground/40">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={p} className="px-3 py-2.5 align-top">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${matrixStatusColor(cell.status)}`}
                      >
                        {cell.statusLabel}
                      </span>
                      {cell.externalOrgName && (
                        <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                          {cell.externalOrgName}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
