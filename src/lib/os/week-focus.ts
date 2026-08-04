/** Weekly bottleneck / focus template — local until knowledge-backed. */

export type WeekFocus = {
  /** ISO week key e.g. 2026-W32 */
  weekKey: string;
  bottleneck: string;
  why: string;
  unlock: string;
  focus1: string;
  focus2: string;
  focus3: string;
  updatedAt: string;
};

const STORAGE_KEY = "nexus:week-focus:v1";

export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function emptyWeekFocus(weekKey = isoWeekKey()): WeekFocus {
  return {
    weekKey,
    bottleneck: "",
    why: "",
    unlock: "",
    focus1: "",
    focus2: "",
    focus3: "",
    updatedAt: new Date().toISOString(),
  };
}

export function readWeekFocus(): WeekFocus {
  if (typeof window === "undefined") return emptyWeekFocus();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWeekFocus();
    const parsed = JSON.parse(raw) as WeekFocus;
    const current = isoWeekKey();
    if (parsed.weekKey !== current) {
      return emptyWeekFocus(current);
    }
    return { ...emptyWeekFocus(current), ...parsed, weekKey: current };
  } catch {
    return emptyWeekFocus();
  }
}

export function writeWeekFocus(focus: WeekFocus): void {
  if (typeof window === "undefined") return;
  const next = { ...focus, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
