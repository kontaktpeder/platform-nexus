/** Work-shaped timer + pending entries until Work `time.write` exists. */

const SESSION_KEY = "nexus:work-session";
const PENDING_KEY = "nexus:pending-time-entries";
const CATALOG_KEY = "nexus:work-catalog";

export type WorkCatalog = {
  orgs: string[];
  projects: string[];
  rates: string[];
};

export type WorkSession = {
  startedAt: string;
  organizationName: string;
  projectName: string;
  rateName: string | null;
  /** Hourly rate amount if user typed a number, else null */
  hourlyRate: number | null;
  comment: string | null;
};

export type PendingTimeEntry = {
  id: string;
  organizationName: string;
  projectName: string;
  rateName: string | null;
  hourlyRate: number | null;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  total_minutes: number;
  comment: string | null;
  source: "timer";
  started_at: string;
  ended_at: string;
  sync_status: "pending" | "synced" | "failed";
};

function normalizeTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  // sv-SE → "YYYY-MM-DD HH:MM:SS"
  const raw = fmt.format(d).trim();
  const [datePart, timePart] = raw.includes("T") ? raw.split("T") : raw.split(" ");
  const time = (timePart ?? "00:00:00").slice(0, 8);
  return {
    date: datePart ?? "",
    time: time.length === 5 ? `${time}:00` : time,
  };
}

export function readWorkSession(): WorkSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkSession;
    if (!parsed?.startedAt || Number.isNaN(Date.parse(parsed.startedAt))) return null;
    if (!parsed.organizationName?.trim() || !parsed.projectName?.trim()) return null;
    return {
      startedAt: parsed.startedAt,
      organizationName: parsed.organizationName,
      projectName: parsed.projectName,
      rateName: parsed.rateName ?? null,
      hourlyRate: typeof parsed.hourlyRate === "number" ? parsed.hourlyRate : null,
      comment: parsed.comment ?? null,
    };
  } catch {
    return null;
  }
}

export function startWorkSession(input: {
  organizationName: string;
  projectName: string;
  rateName?: string | null;
  hourlyRate?: number | null;
  comment?: string | null;
}): WorkSession {
  const session: WorkSession = {
    startedAt: new Date().toISOString(),
    organizationName: input.organizationName.trim(),
    projectName: input.projectName.trim(),
    rateName: input.rateName?.trim() || null,
    hourlyRate: input.hourlyRate ?? null,
    comment: input.comment?.trim() || null,
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  rememberCatalog({
    org: session.organizationName,
    project: session.projectName,
    rate: session.rateName,
  });
  return session;
}

export function stopWorkSession(breakMinutes = 0): PendingTimeEntry | null {
  const current = readWorkSession();
  if (!current) return null;
  const endedAt = new Date().toISOString();
  const start = normalizeTime(current.startedAt);
  const end = normalizeTime(endedAt);
  const totalMinutes = Math.max(
    1,
    Math.round((Date.parse(endedAt) - Date.parse(current.startedAt)) / 60_000) - breakMinutes,
  );
  const entry: PendingTimeEntry = {
    id: crypto.randomUUID(),
    organizationName: current.organizationName,
    projectName: current.projectName,
    rateName: current.rateName,
    hourlyRate: current.hourlyRate,
    date: start.date,
    start_time: start.time.length === 8 ? start.time : `${start.time}:00`.slice(0, 8),
    end_time: end.time.length === 8 ? end.time : `${end.time}:00`.slice(0, 8),
    break_minutes: breakMinutes,
    total_minutes: totalMinutes,
    comment: current.comment,
    source: "timer",
    started_at: current.startedAt,
    ended_at: endedAt,
    sync_status: "pending",
  };
  window.localStorage.removeItem(SESSION_KEY);
  const pending = readPendingEntries();
  pending.unshift(entry);
  window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending.slice(0, 50)));
  return entry;
}

export function readPendingEntries(): PendingTimeEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingTimeEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function formatElapsed(startedAt: string, nowMs = Date.now()): string {
  const ms = Math.max(0, nowMs - Date.parse(startedAt));
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function readCatalog(): WorkCatalog {
  if (typeof window === "undefined") return { orgs: [], projects: [], rates: [] };
  try {
    const raw = window.localStorage.getItem(CATALOG_KEY);
    if (!raw) return { orgs: [], projects: [], rates: [] };
    const parsed = JSON.parse(raw) as WorkCatalog;
    return {
      orgs: Array.isArray(parsed.orgs) ? parsed.orgs : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      rates: Array.isArray(parsed.rates) ? parsed.rates : [],
    };
  } catch {
    return { orgs: [], projects: [], rates: [] };
  }
}

function pushUnique(list: string[], value: string | null | undefined, max = 20): string[] {
  const v = (value ?? "").trim();
  if (!v) return list;
  const next = [v, ...list.filter((x) => x.toLowerCase() !== v.toLowerCase())];
  return next.slice(0, max);
}

export function rememberCatalog(input: {
  org?: string | null;
  project?: string | null;
  rate?: string | null;
}) {
  if (typeof window === "undefined") return;
  const cur = readCatalog();
  const next: WorkCatalog = {
    orgs: pushUnique(cur.orgs, input.org),
    projects: pushUnique(cur.projects, input.project),
    rates: pushUnique(cur.rates, input.rate),
  };
  window.localStorage.setItem(CATALOG_KEY, JSON.stringify(next));
}

export function parseHourlyRate(raw: string): number | null {
  const t = raw.trim().replace(",", ".").replace(/[^\d.]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}
