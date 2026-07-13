import { ArrowRight } from "lucide-react";

function greeting(hour: number): string {
  if (hour < 5) return "God natt";
  if (hour < 12) return "God morgen";
  if (hour < 18) return "God ettermiddag";
  return "God kveld";
}

function osloHour(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hour12: false,
    timeZone: "Europe/Oslo",
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return parseInt(h, 10);
}

export function GlobalMissionHeader({
  firstName,
  count,
  onStart,
  canStart,
  loadFailed = false,
}: {
  firstName: string | null;
  count: number;
  onStart: () => void;
  canStart: boolean;
  loadFailed?: boolean;
}) {
  const hello = greeting(osloHour());
  const name = firstName ? firstName : "der";
  const line1 = loadFailed
    ? "Jeg klarte ikke å lese signalene ennå."
    : "Jeg tok meg av sorteringen.";
  const line2 = loadFailed
    ? "Briefen lastet ikke — sjekk oppsettet under før du stoler på det som vises."
    : count === 0
      ? "Ingenting trenger deg akkurat nå."
      : `${count} ${count === 1 ? "ting trenger" : "ting trenger"} deg i dag.`;

  return (
    <section className="pt-2 pb-8 sm:pt-6 sm:pb-10">
      <h1 className="font-heading text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
        {hello}, {name}.
      </h1>
      <div className="mt-5 space-y-1 text-base text-muted-foreground sm:text-lg">
        <p>{line1}</p>
        <p>{line2}</p>
      </div>
      {canStart && (
        <button
          type="button"
          onClick={onStart}
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
        >
          Start
          <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}
