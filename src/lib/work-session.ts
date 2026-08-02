/** Local work-session timer until Work-module sync ships. */

const STORAGE_KEY = "nexus:work-session";

export type WorkSession = {
  startedAt: string;
  label: string | null;
};

export function readWorkSession(): WorkSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkSession;
    if (!parsed?.startedAt || Number.isNaN(Date.parse(parsed.startedAt))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function startWorkSession(label?: string | null): WorkSession {
  const session: WorkSession = {
    startedAt: new Date().toISOString(),
    label: label?.trim() || null,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function stopWorkSession(): {
  startedAt: string;
  endedAt: string;
  minutes: number;
  label: string | null;
} | null {
  const current = readWorkSession();
  if (!current) return null;
  const endedAt = new Date().toISOString();
  const minutes = Math.max(
    1,
    Math.round((Date.parse(endedAt) - Date.parse(current.startedAt)) / 60_000),
  );
  window.localStorage.removeItem(STORAGE_KEY);
  return {
    startedAt: current.startedAt,
    endedAt,
    minutes,
    label: current.label,
  };
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
