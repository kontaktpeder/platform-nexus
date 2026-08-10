/** Daily Vision Board / alignment types. */

export type DailyAlignment = {
  dayKey: string;
  identityEnergy: string;
  northStar: string;
  serviceFocus: string;
  winToday: string;
  tomorrowPriorities: string;
  updatedAt: string | null;
};

export type DailyAlignmentPatch = Partial<{
  identityEnergy: string;
  northStar: string;
  serviceFocus: string;
  winToday: string;
  tomorrowPriorities: string;
}>;

export function emptyDailyAlignment(dayKey: string): DailyAlignment {
  return {
    dayKey,
    identityEnergy: "",
    northStar: "",
    serviceFocus: "",
    winToday: "",
    tomorrowPriorities: "",
    updatedAt: null,
  };
}

export function dailyAlignmentQueryKey(dayKey: string) {
  return ["daily-alignment", dayKey] as const;
}
