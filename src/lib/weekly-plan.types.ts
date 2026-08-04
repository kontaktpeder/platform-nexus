/** Manual weekly reflection plan — filled by the operator, not AI. */

import { osloWeekKey, osloWeekNumber } from "@/lib/oslo-week";

export type WeeklyPlanScope = "personal" | "org";

export type WeeklyNowItem = {
  text: string;
  /** Marked as the single highest-impact task this week. */
  biggest: boolean;
};

export type WeeklyWaitingItem = {
  what: string;
  owner: string;
  nextDate: string;
};

export type WeeklyLearningItem = {
  did: string;
  worked: string;
};

export type WeeklyPlanPayload = {
  now: WeeklyNowItem[];
  waiting: WeeklyWaitingItem[];
  rain: string[];
  ideas: string[];
  learning: WeeklyLearningItem[];
};

export type WeeklyPlanOrgOption = {
  id: string;
  name: string;
  slug: string;
};

export type WeeklyPlan = {
  weekKey: string;
  weekLabel: string;
  scope: WeeklyPlanScope;
  organizationId: string | null;
  organizationName: string | null;
  payload: WeeklyPlanPayload;
  updatedAt: string | null;
};

export type WeeklyPlanScopeSelection =
  | { scope: "personal"; organizationId: null }
  | { scope: "org"; organizationId: string };

export function emptyWeeklyPlanPayload(): WeeklyPlanPayload {
  return {
    now: [
      { text: "", biggest: false },
      { text: "", biggest: false },
      { text: "", biggest: false },
    ],
    waiting: [{ what: "", owner: "", nextDate: "" }],
    rain: [""],
    ideas: [""],
    learning: [{ did: "", worked: "" }],
  };
}

export function normalizeWeeklyPlanPayload(raw: unknown): WeeklyPlanPayload {
  const empty = emptyWeeklyPlanPayload();
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;

  const nowRaw = Array.isArray(o.now) ? o.now : [];
  const now: WeeklyNowItem[] = [0, 1, 2].map((i) => {
    const item = nowRaw[i];
    if (item && typeof item === "object") {
      const r = item as Record<string, unknown>;
      return {
        text: typeof r.text === "string" ? r.text : "",
        biggest: r.biggest === true,
      };
    }
    return { text: "", biggest: false };
  });
  let seenBiggest = false;
  for (const item of now) {
    if (item.biggest) {
      if (seenBiggest) item.biggest = false;
      else seenBiggest = true;
    }
  }

  const waiting: WeeklyWaitingItem[] = (
    Array.isArray(o.waiting) ? o.waiting : []
  )
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      return {
        what: typeof r.what === "string" ? r.what : "",
        owner: typeof r.owner === "string" ? r.owner : "",
        nextDate: typeof r.nextDate === "string" ? r.nextDate : "",
      };
    })
    .filter((x): x is WeeklyWaitingItem => x !== null);
  if (waiting.length === 0) waiting.push({ what: "", owner: "", nextDate: "" });

  const rain = (Array.isArray(o.rain) ? o.rain : [])
    .map((x) => (typeof x === "string" ? x : ""))
    .filter((_, i) => i < 20);
  if (rain.length === 0) rain.push("");

  const ideas = (Array.isArray(o.ideas) ? o.ideas : [])
    .map((x) => (typeof x === "string" ? x : ""))
    .filter((_, i) => i < 30);
  if (ideas.length === 0) ideas.push("");

  const learning: WeeklyLearningItem[] = (
    Array.isArray(o.learning) ? o.learning : []
  )
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      return {
        did: typeof r.did === "string" ? r.did : "",
        worked: typeof r.worked === "string" ? r.worked : "",
      };
    })
    .filter((x): x is WeeklyLearningItem => x !== null);
  if (learning.length === 0) learning.push({ did: "", worked: "" });

  return { now, waiting, rain, ideas, learning };
}

const SCOPE_STORAGE_KEY = "nexus:weekly-plan-scope:v1";

export function readWeeklyPlanScopeSelection(): WeeklyPlanScopeSelection {
  if (typeof window === "undefined") return { scope: "personal", organizationId: null };
  try {
    const raw = window.localStorage.getItem(SCOPE_STORAGE_KEY);
    if (!raw) return { scope: "personal", organizationId: null };
    const parsed = JSON.parse(raw) as WeeklyPlanScopeSelection;
    if (parsed.scope === "org" && typeof parsed.organizationId === "string") {
      return { scope: "org", organizationId: parsed.organizationId };
    }
  } catch {
    /* ignore */
  }
  return { scope: "personal", organizationId: null };
}

export function writeWeeklyPlanScopeSelection(sel: WeeklyPlanScopeSelection): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCOPE_STORAGE_KEY, JSON.stringify(sel));
}

export function weeklyPlanQueryKey(sel: WeeklyPlanScopeSelection): unknown[] {
  return ["weekly-plan", sel.scope, sel.organizationId ?? "personal"];
}

export function currentWeekLabel(date = new Date()): string {
  const key = osloWeekKey(date);
  const m = /^(\d{4})-W(\d+)$/.exec(key);
  if (m) return `Uke ${m[2]} · ${m[1]}`;
  return `Uke ${osloWeekNumber(date)}`;
}

export function weeklyPlanNeedsFill(
  payload: WeeklyPlanPayload | undefined,
): boolean {
  if (!payload) return true;
  return !payload.now.some((n) => n.text.trim().length > 0);
}

/** Fokus nå: marked «biggest», else first filled NÅ. */
export function focusHintFromWeeklyPlan(
  plan: WeeklyPlan | undefined,
): string | null {
  if (!plan) return null;
  const biggest = plan.payload.now.find((n) => n.biggest && n.text.trim());
  if (biggest) return biggest.text.trim();
  const first = plan.payload.now.find((n) => n.text.trim());
  return first?.text.trim() ?? null;
}

export function weeklyPlanQueueId(
  weekKey: string,
  sel: WeeklyPlanScopeSelection,
): string {
  if (sel.scope === "org" && sel.organizationId) {
    return `weekly-plan:${weekKey}:org:${sel.organizationId}`;
  }
  return `weekly-plan:${weekKey}:personal`;
}
