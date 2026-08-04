import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentWeeklyPlan } from "@/lib/weekly-plan.functions";
import type { WeeklyPlan, WeeklyPlanPayload } from "@/lib/weekly-plan.types";

export function weeklyPlanNeedsFill(payload: WeeklyPlanPayload | undefined): boolean {
  if (!payload) return true;
  return !payload.now.some((n) => n.text.trim().length > 0);
}

/** Fokus nå: marked «biggest», else first filled NÅ. */
export function focusHintFromWeeklyPlan(plan: WeeklyPlan | undefined): string | null {
  if (!plan) return null;
  const biggest = plan.payload.now.find((n) => n.biggest && n.text.trim());
  if (biggest) return biggest.text.trim();
  const first = plan.payload.now.find((n) => n.text.trim());
  return first?.text.trim() ?? null;
}

export function useWeeklyPlan() {
  const fetchPlan = useServerFn(getCurrentWeeklyPlan);
  const query = useQuery({
    queryKey: ["weekly-plan"],
    queryFn: () => fetchPlan(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    plan: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    needsFill: weeklyPlanNeedsFill(query.data?.payload),
    focusHint: focusHintFromWeeklyPlan(query.data),
    refetch: query.refetch,
  };
}
