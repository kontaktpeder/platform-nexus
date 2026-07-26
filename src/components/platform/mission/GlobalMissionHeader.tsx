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

function osloWeekday(): string {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
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
  const dateLine = osloWeekday();

  return (
    <section className="pb-5 pt-1 sm:pb-6 sm:pt-2">
      <p className="text-xs font-medium capitalize text-muted-foreground">{dateLine}</p>
      <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        {hello}, {name} 👋
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
        {loadFailed
          ? "Briefen lastet ikke — sjekk oppsettet før du stoler på det som vises."
          : count === 0
            ? "Ingen som trenger deg akkurat nå."
            : "Dette er dine viktigste relasjoner i dag."}
      </p>
      {canStart && !loadFailed && (
        <button
          type="button"
          onClick={onStart}
          className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Gå til Start her
        </button>
      )}
    </section>
  );
}
