/** Manual weekly reflection plan — filled by the operator, not AI. */

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

export type WeeklyPlan = {
  weekKey: string;
  weekLabel: string;
  payload: WeeklyPlanPayload;
  updatedAt: string | null;
};

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
  // At most one "biggest"
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
    .filter((_, i, arr) => i < 20);
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
