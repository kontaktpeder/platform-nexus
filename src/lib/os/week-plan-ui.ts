/** Open Mission weekly plan sheet from queue / sidebar. */
export const WEEK_PLAN_OPEN_EVENT = "nexus:open-week-plan";

export function openWeekPlanSheet(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WEEK_PLAN_OPEN_EVENT));
}

export function isWeeklyPlanQueueId(id: string): boolean {
  return id.startsWith("weekly-plan:");
}
