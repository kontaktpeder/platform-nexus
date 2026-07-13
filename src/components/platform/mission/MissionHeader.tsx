function greeting(hour: number): string {
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

export function MissionHeader({ orgName, wsName }: { orgName: string; wsName: string }) {
  const hour = osloHour();
  const hello = greeting(hour);
  const date = new Intl.DateTimeFormat("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <section className="mb-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{date}</div>
      <h1 className="mt-1 font-heading text-2xl font-bold">{hello}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{orgName}</span> · {wsName}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Dette trenger oppmerksomhet i arbeidsflaten.
      </p>
    </section>
  );
}
