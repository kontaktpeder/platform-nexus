/** Calendar helpers in Europe/Oslo. */

export function osloWeekNumber(date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      week: "numeric",
      timeZone: "Europe/Oslo",
    }).format(date),
    10,
  );
}

export function osloWeekKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    week: "numeric",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const week = parts.find((p) => p.type === "week")?.value ?? "0";
  return `${year}-W${week}`;
}

export function isSameOsloWeek(isoDate: string | null, ref = new Date()): boolean {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return false;
  return osloWeekKey(d) === osloWeekKey(ref);
}

/** Monday 00:00:00 Oslo as Unix seconds (for Slack `oldest`). */
export function osloWeekStartUnix(date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    weekday: "short",
  }).format(noonUtc);
  const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = dayMap[weekday.slice(0, 3)] ?? 0;
  const monday = new Date(Date.UTC(y, m - 1, d - offset, 12, 0, 0));
  const mondayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(monday);
  const my = Number(mondayParts.find((p) => p.type === "year")?.value);
  const mm = Number(mondayParts.find((p) => p.type === "month")?.value);
  const md = Number(mondayParts.find((p) => p.type === "day")?.value);
  // 00:00 Oslo ≈ previous day 22:00/23:00 UTC — use formatter to get exact offset
  const asOslo = new Date(`${my}-${String(mm).padStart(2, "0")}-${String(md).padStart(2, "0")}T00:00:00`);
  const osloOffset = getOsloOffsetMinutes(asOslo);
  return Math.floor((asOslo.getTime() - osloOffset * 60_000) / 1000);
}

function getOsloOffsetMinutes(date: Date): number {
  const utc = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    hour12: false,
  }).format(date);
  const oslo = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    hour: "numeric",
    hour12: false,
  }).format(date);
  return (parseInt(oslo, 10) - parseInt(utc, 10)) * 60;
}

export function slackTsToIso(ts: string): string | null {
  const seconds = Number(ts.split(".")[0]);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

export function isSlackTsThisWeek(ts: string, ref = new Date()): boolean {
  const iso = slackTsToIso(ts);
  return isSameOsloWeek(iso, ref);
}
