// Pure helpers for computing snooze targets in Europe/Oslo timezone.

export type SnoozePreset = "later_today" | "tomorrow" | "next_week";

const TZ = "Europe/Oslo";

function osloParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"), // Mon..Sun
  };
}

// Offset (in minutes) between Oslo local wall-clock and UTC for a given date.
function osloOffsetMinutes(d: Date): number {
  const p = osloParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return (asUtc - d.getTime()) / 60000;
}

// Build a Date at the specified Oslo wall-clock time.
function osloDateAt(base: Date, addDays: number, hour: number, minute = 0): Date {
  const p = osloParts(base);
  const target = new Date(Date.UTC(p.year, p.month - 1, p.day + addDays, hour, minute));
  const offset = osloOffsetMinutes(target);
  return new Date(target.getTime() - offset * 60000);
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

export function snoozeUntil(preset: SnoozePreset, now: Date = new Date()): Date {
  if (preset === "later_today") {
    const today5pm = osloDateAt(now, 0, 17, 0);
    if (today5pm.getTime() > now.getTime() + 30 * 60_000) return today5pm;
    return new Date(now.getTime() + 4 * 60 * 60_000);
  }
  if (preset === "tomorrow") {
    return osloDateAt(now, 1, 9, 0);
  }
  // next_week -> next Monday 09:00 Oslo
  const wd = WEEKDAY_INDEX[osloParts(now).weekday] ?? 1;
  const daysUntilNextMon = ((8 - wd) % 7) || 7;
  return osloDateAt(now, daysUntilNextMon, 9, 0);
}
