import { ExternalLink, Sparkles } from "lucide-react";

export function WidgetSlot({
  moduleName,
  title,
  hint,
  connected,
  href,
}: {
  moduleName: string;
  title: string;
  hint?: string;
  connected?: boolean;
  href?: string | null;
}) {
  return (
    <div className="surface-card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {moduleName}
        </span>
        {connected ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary hover:underline"
            >
              Koblet <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary">
              Koblet
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Ikke koblet
          </span>
        )}
      </div>
      <div className="font-heading text-lg font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground">
        {hint ??
          (connected
            ? "Modulen er koblet. Data kommer når integrasjonen er ferdig."
            : "Koble modulen under Moduler for å peke på eksisterende org.")}
      </div>
    </div>
  );
}
