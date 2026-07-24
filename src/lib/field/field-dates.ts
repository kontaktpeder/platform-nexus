/** Europe/Oslo calendar helpers for field follow-ups. */

function osloYmdParts(date = new Date()): { y: number; m: number; d: number } {
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

/** YYYY-MM-DD in Europe/Oslo. */
export function osloDateKey(date = new Date()): string {
  const { y, m, d } = osloYmdParts(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Noon Oslo as ISO for a calendar day (stable due_at). */
export function osloNoonIso(ymd: string): string {
  // Construct as local-interpreted Oslo wall time via offset probe.
  const probe = new Date(`${ymd}T12:00:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    hour: "numeric",
    hour12: false,
  });
  const osloHour = parseInt(fmt.format(probe), 10);
  // If UTC noon shows as hour H in Oslo, UTC = 12 - (H - 12) ... simpler:
  // We want wall-clock 12:00 Oslo. Get offset at that day.
  const utcGuess = new Date(`${ymd}T12:00:00+02:00`);
  const shown = osloDateKey(utcGuess);
  if (shown === ymd) return utcGuess.toISOString();
  const utcGuessWinter = new Date(`${ymd}T12:00:00+01:00`);
  return utcGuessWinter.toISOString();
}

export function addOsloDays(fromKey: string, days: number): string {
  const [y, m, d] = fromKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  // Walk calendar in UTC noon — close enough for day arithmetic across DST
  return osloDateKey(utc);
}

export function startOfOsloDayIso(ymd: string): string {
  const noon = new Date(osloNoonIso(ymd));
  noon.setUTCHours(noon.getUTCHours() - 12);
  return noon.toISOString();
}

export function formatOsloDayLabel(isoOrKey: string, todayKey = osloDateKey()): string {
  const key = isoOrKey.includes("T") ? osloDateKey(new Date(isoOrKey)) : isoOrKey;
  if (key === todayKey) return "i dag";
  if (key === addOsloDays(todayKey, 1)) return "i morgen";
  if (key === addOsloDays(todayKey, -1)) return "i går";

  const due = new Date(osloNoonIso(key));
  const today = new Date(osloNoonIso(todayKey));
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return n === 1 ? "1 dag forsinket" : `${n} dager forsinket`;
  }
  if (diffDays <= 3) return `om ${diffDays} dager`;

  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "numeric",
    month: "short",
  }).format(new Date(osloNoonIso(key)));
}

export function formatOsloActivityDate(iso: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}
