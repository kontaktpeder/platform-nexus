import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  getCurrentWeeklyPlan,
  listWeeklyPlanOrgOptions,
  saveCurrentWeeklyPlan,
} from "@/lib/weekly-plan.functions";
import { osloWeekKey } from "@/lib/oslo-week";
import {
  currentWeekLabel,
  emptyWeeklyPlanPayload,
  focusHintFromWeeklyPlan,
  readWeeklyPlanScopeSelection,
  weeklyPlanNeedsFill,
  weeklyPlanQueryKey,
  writeWeeklyPlanScopeSelection,
  type WeeklyPlan,
  type WeeklyPlanOrgOption,
  type WeeklyPlanPayload,
  type WeeklyPlanScopeSelection,
} from "@/lib/weekly-plan.types";

function emptyPlan(sel: WeeklyPlanScopeSelection): WeeklyPlan {
  return {
    weekKey: osloWeekKey(),
    weekLabel: currentWeekLabel(),
    scope: sel.scope,
    organizationId: sel.organizationId,
    organizationName: null,
    payload: emptyWeeklyPlanPayload(),
    updatedAt: null,
  };
}

export function useWeeklyPlanOrgs() {
  return useQuery({
    queryKey: ["weekly-plan-orgs"],
    queryFn: () => listWeeklyPlanOrgOptions(),
    staleTime: 5 * 60_000,
  });
}

export function useWeeklyPlan() {
  const qc = useQueryClient();
  const [selection, setSelectionState] = useState<WeeklyPlanScopeSelection>(() =>
    readWeeklyPlanScopeSelection(),
  );

  const orgsQuery = useWeeklyPlanOrgs();
  const orgs = orgsQuery.data ?? [];

  useEffect(() => {
    if (selection.scope !== "org") return;
    if (orgsQuery.isLoading) return;
    const stillMember = orgs.some((o) => o.id === selection.organizationId);
    if (!stillMember) {
      const next: WeeklyPlanScopeSelection = {
        scope: "personal",
        organizationId: null,
      };
      writeWeeklyPlanScopeSelection(next);
      setSelectionState(next);
    }
  }, [selection, orgs, orgsQuery.isLoading]);

  const setSelection = useCallback((next: WeeklyPlanScopeSelection) => {
    writeWeeklyPlanScopeSelection(next);
    setSelectionState(next);
  }, []);

  const selectPersonal = useCallback(() => {
    setSelection({ scope: "personal", organizationId: null });
  }, [setSelection]);

  const selectOrg = useCallback(
    (organizationId: string) => {
      setSelection({ scope: "org", organizationId });
    },
    [setSelection],
  );

  const query = useQuery({
    queryKey: weeklyPlanQueryKey(selection),
    queryFn: () =>
      getCurrentWeeklyPlan({
        data: {
          scope: selection.scope,
          organizationId: selection.organizationId,
        },
      }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: WeeklyPlanPayload) => {
      const plan = query.data ?? emptyPlan(selection);
      return saveCurrentWeeklyPlan({
        data: {
          weekKey: plan.weekKey,
          payload,
          scope: selection.scope,
          organizationId: selection.organizationId,
        },
      });
    },
    onSuccess: (saved) => {
      qc.setQueryData(weeklyPlanQueryKey(selection), saved);
    },
  });

  const plan = query.data ?? emptyPlan(selection);

  return {
    plan,
    selection,
    orgs,
    orgsLoading: orgsQuery.isLoading,
    selectPersonal,
    selectOrg,
    setSelection,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error,
    needsFill: weeklyPlanNeedsFill(query.data?.payload),
    focusHint: focusHintFromWeeklyPlan(query.data),
    save: (payload: WeeklyPlanPayload) => saveMutation.mutateAsync(payload),
    refetch: query.refetch,
  };
}

export type {
  WeeklyPlan,
  WeeklyPlanOrgOption,
  WeeklyPlanPayload,
  WeeklyPlanScopeSelection,
};
