export function formatOccurredAt(iso: string | null | undefined): string {
  if (!iso) return "nå";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "nå";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  // Same calendar day (Europe/Oslo) → show HH:MM
  const sameDay =
    d.toDateString() === now.toDateString() && diffMs < oneDay;
  if (sameDay) {
    return new Intl.DateTimeFormat("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Oslo",
    }).format(d);
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "i går";

  const days = Math.floor(diffMs / oneDay);
  if (days < 7) return `${days} d siden`;
  if (days < 30) return `${Math.floor(days / 7)} u siden`;
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Oslo",
  }).format(d);
}
