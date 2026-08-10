/** Calendar helpers in Europe/Oslo. */

/** Oslo Y-M-D parts for a given instant. */
function osloYmd(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    y: Number(parts.find((p) => p.type === "year")?.value),
    m: Number(parts.find((p) => p.type === "month")?.value),
    d: Number(parts.find((p) => p.type === "day")?.value),
  };
}

/**
 * ISO-8601 week number + week-year for an Oslo calendar date.
 * Do NOT use Intl `week: "numeric"` — many runtimes ignore it and return
 * a date string like "7/26/2026", which parseInt turns into 7.
 */
function osloIsoWeek(date = new Date()): { weekYear: number; week: number } {
  const { y, m, d } = osloYmd(date);
  // Noon UTC on that Oslo calendar day — stable weekday for ISO math.
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  // ISO: week starts Monday; week 1 is the week with Jan 4 / first Thursday.
  const day = utc.getUTCDay() || 7; // Mon=1 … Sun=7
  utc.setUTCDate(utc.getUTCDate() + 4 - day); // Thursday of this ISO week
  const weekYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { weekYear, week };
}

export function osloWeekNumber(date = new Date()): number {
  return osloIsoWeek(date).week;
}

export function osloWeekKey(date = new Date()): string {
  const { weekYear, week } = osloIsoWeek(date);
  return `${weekYear}-W${week}`;
}

/** Oslo calendar date as YYYY-MM-DD. */
export function osloDayKey(date = new Date()): string {
  const { y, m, d } = osloYmd(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Shift an Oslo day_key by ±N calendar days. */
export function shiftOsloDayKey(dayKey: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) return osloDayKey();
  const utc = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0),
  );
  utc.setUTCDate(utc.getUTCDate() + deltaDays);
  const y = utc.getUTCFullYear();
  const mo = utc.getUTCMonth() + 1;
  const d = utc.getUTCDate();
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Human label for an Oslo day_key (nb-NO). */
export function formatOsloDayLabel(dayKey: string, ref = new Date()): string {
  const today = osloDayKey(ref);
  if (dayKey === today) return "I dag";
  if (dayKey === shiftOsloDayKey(today, -1)) return "I går";
  if (dayKey === shiftOsloDayKey(today, 1)) return "I morgen";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) return dayKey;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
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
