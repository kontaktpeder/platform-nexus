/** Work-shaped timer + pending entries until Work `time.write` exists.
 * Catalog mirrors Work orgs / projects / rates as selectable options (local until API).
 */

const SESSION_KEY = "nexus:work-session";
const PENDING_KEY = "nexus:pending-time-entries";
const CATALOG_KEY = "nexus:work-catalog-v2";
const LEGACY_CATALOG_KEY = "nexus:work-catalog";

export type WorkOrgOption = { id: string; name: string };
export type WorkProjectOption = { id: string; orgId: string; name: string };
export type WorkRateOption = { id: string; orgId: string; name: string; amount: number };

export type WorkCatalog = {
  version: 2;
  orgs: WorkOrgOption[];
  projects: WorkProjectOption[];
  rates: WorkRateOption[];
};

export type WorkSession = {
  startedAt: string;
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  rateId: string | null;
  rateName: string | null;
  hourlyRate: number | null;
  comment: string | null;
  /** Platform org slug for Work module sync (optional). */
  platformOrgSlug?: string | null;
};

export type PendingTimeEntry = {
  id: string;
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  rateId: string | null;
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

const DEFAULT_ORG: WorkOrgOption = {
  id: "org-gold-of-sicily",
  name: "Gold of Sicily AS",
};

/** Seeded Work-shaped options so the timer never starts as free-text. */
export const DEFAULT_WORK_CATALOG: WorkCatalog = {
  version: 2,
  orgs: [DEFAULT_ORG],
  projects: [
    { id: "proj-drift", orgId: DEFAULT_ORG.id, name: "Drift / Operations" },
    { id: "proj-salg", orgId: DEFAULT_ORG.id, name: "Salg" },
    { id: "proj-utvikling", orgId: DEFAULT_ORG.id, name: "Utvikling" },
  ],
  rates: [
    { id: "rate-standard", orgId: DEFAULT_ORG.id, name: "Standard", amount: 950 },
    { id: "rate-senior", orgId: DEFAULT_ORG.id, name: "Senior", amount: 1250 },
  ],
};

function slugId(prefix: string, name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${prefix}-${slug || crypto.randomUUID().slice(0, 8)}`;
}

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
  const raw = fmt.format(d).trim();
  const [datePart, timePart] = raw.includes("T") ? raw.split("T") : raw.split(" ");
  const time = (timePart ?? "00:00:00").slice(0, 8);
  return {
    date: datePart ?? "",
    time: time.length === 5 ? `${time}:00` : time,
  };
}

function mergeCatalog(base: WorkCatalog, extra: Partial<WorkCatalog>): WorkCatalog {
  const orgs = [...base.orgs];
  for (const o of extra.orgs ?? []) {
    if (!orgs.some((x) => x.id === o.id || x.name.toLowerCase() === o.name.toLowerCase())) {
      orgs.push(o);
    }
  }
  const projects = [...base.projects];
  for (const p of extra.projects ?? []) {
    if (!projects.some((x) => x.id === p.id)) projects.push(p);
  }
  const rates = [...base.rates];
  for (const r of extra.rates ?? []) {
    if (!rates.some((x) => x.id === r.id)) rates.push(r);
  }
  return { version: 2, orgs, projects, rates };
}

function migrateLegacyCatalog(): Partial<WorkCatalog> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_CATALOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { orgs?: string[]; projects?: string[]; rates?: string[] };
    const orgName = parsed.orgs?.[0]?.trim() || DEFAULT_ORG.name;
    const orgId = slugId("org", orgName);
    const orgs: WorkOrgOption[] = (parsed.orgs ?? [])
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ id: slugId("org", name), name }));
    if (orgs.length === 0) orgs.push({ id: orgId, name: orgName });
    const primary = orgs[0]!;
    const projects: WorkProjectOption[] = (parsed.projects ?? [])
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ id: slugId("proj", name), orgId: primary.id, name }));
    const rates: WorkRateOption[] = (parsed.rates ?? [])
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ id: slugId("rate", name), orgId: primary.id, name, amount: 950 }));
    return { orgs, projects, rates };
  } catch {
    return null;
  }
}

export function readCatalog(): WorkCatalog {
  if (typeof window === "undefined") return DEFAULT_WORK_CATALOG;
  try {
    const raw = window.localStorage.getItem(CATALOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkCatalog;
      if (parsed?.version === 2 && Array.isArray(parsed.orgs)) {
        return mergeCatalog(DEFAULT_WORK_CATALOG, parsed);
      }
    }
    const legacy = migrateLegacyCatalog();
    const merged = mergeCatalog(DEFAULT_WORK_CATALOG, legacy ?? {});
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return DEFAULT_WORK_CATALOG;
  }
}

export function writeCatalog(catalog: WorkCatalog) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CATALOG_KEY, JSON.stringify({ ...catalog, version: 2 }));
}

export function projectsForOrg(catalog: WorkCatalog, orgId: string): WorkProjectOption[] {
  return catalog.projects.filter((p) => p.orgId === orgId);
}

export function ratesForOrg(catalog: WorkCatalog, orgId: string): WorkRateOption[] {
  return catalog.rates.filter((r) => r.orgId === orgId);
}

export function addOrgToCatalog(name: string): WorkOrgOption {
  const catalog = readCatalog();
  const trimmed = name.trim().slice(0, 120);
  const existing = catalog.orgs.find((o) => o.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const org: WorkOrgOption = { id: slugId("org", trimmed), name: trimmed };
  writeCatalog({ ...catalog, orgs: [org, ...catalog.orgs] });
  return org;
}

export function addProjectToCatalog(orgId: string, name: string): WorkProjectOption {
  const catalog = readCatalog();
  const trimmed = name.trim().slice(0, 120);
  const existing = catalog.projects.find(
    (p) => p.orgId === orgId && p.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return existing;
  const project: WorkProjectOption = { id: slugId("proj", trimmed), orgId, name: trimmed };
  writeCatalog({ ...catalog, projects: [project, ...catalog.projects] });
  return project;
}

export function addRateToCatalog(
  orgId: string,
  name: string,
  amount: number,
): WorkRateOption {
  const catalog = readCatalog();
  const trimmed = name.trim().slice(0, 80);
  const existing = catalog.rates.find(
    (r) => r.orgId === orgId && r.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return existing;
  const rate: WorkRateOption = {
    id: slugId("rate", trimmed),
    orgId,
    name: trimmed,
    amount,
  };
  writeCatalog({ ...catalog, rates: [rate, ...catalog.rates] });
  return rate;
}

/** Merge connected Work orgs from Platform into the local catalog. */
export function ensureOrgsInCatalog(orgs: Array<{ id: string; name: string }>) {
  let catalog = readCatalog();
  let changed = false;
  for (const o of orgs) {
    const name = o.name.trim();
    const id = o.id.trim();
    if (!name || !id) continue;
    if (
      catalog.orgs.some(
        (x) => x.id === id || x.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      continue;
    }
    catalog = {
      ...catalog,
      orgs: [{ id, name }, ...catalog.orgs],
    };
    changed = true;
  }
  if (changed) writeCatalog(catalog);
  return readCatalog();
}

export function readWorkSession(): WorkSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkSession> & {
      organizationName?: string;
      projectName?: string;
    };
    if (!parsed?.startedAt || Number.isNaN(Date.parse(parsed.startedAt))) return null;
    if (!parsed.organizationName?.trim() || !parsed.projectName?.trim()) return null;
    return {
      startedAt: parsed.startedAt,
      organizationId: parsed.organizationId ?? slugId("org", parsed.organizationName),
      organizationName: parsed.organizationName,
      projectId: parsed.projectId ?? slugId("proj", parsed.projectName),
      projectName: parsed.projectName,
      rateId: parsed.rateId ?? null,
      rateName: parsed.rateName ?? null,
      hourlyRate: typeof parsed.hourlyRate === "number" ? parsed.hourlyRate : null,
      comment: parsed.comment ?? null,
      platformOrgSlug:
        typeof parsed.platformOrgSlug === "string" ? parsed.platformOrgSlug : null,
    };
  } catch {
    return null;
  }
}

export function startWorkSession(input: {
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  rateId?: string | null;
  rateName?: string | null;
  hourlyRate?: number | null;
  comment?: string | null;
  platformOrgSlug?: string | null;
}): WorkSession {
  const session: WorkSession = {
    startedAt: new Date().toISOString(),
    organizationId: input.organizationId,
    organizationName: input.organizationName.trim(),
    projectId: input.projectId,
    projectName: input.projectName.trim(),
    rateId: input.rateId ?? null,
    rateName: input.rateName?.trim() || null,
    hourlyRate: input.hourlyRate ?? null,
    comment: input.comment?.trim() || null,
    platformOrgSlug: input.platformOrgSlug?.trim() || null,
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    projectId: current.projectId,
    projectName: current.projectName,
    rateId: current.rateId,
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

export function markPendingSynced(id: string, status: "synced" | "failed" = "synced") {
  if (typeof window === "undefined") return;
  const pending = readPendingEntries();
  const next = pending.map((e) => (e.id === id ? { ...e, sync_status: status } : e));
  window.localStorage.setItem(PENDING_KEY, JSON.stringify(next.slice(0, 50)));
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

export const BREAK_OPTIONS = [0, 15, 30, 45, 60] as const;
