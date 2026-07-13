import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  retestModuleConnection,
  verifyAndSaveModuleConnection,
  saveModuleInvoicesApiKey,
} from "./module-verify.functions";

export function useVerifyAndSaveModuleConnection(orgSlug: string, wsSlug: string) {
  const fn = useServerFn(verifyAndSaveModuleConnection);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspace-context", orgSlug, wsSlug] });
      void qc.invalidateQueries({ queryKey: ["connection-hub", orgSlug] });
    },
  });
}

export function useRetestModuleConnection(orgSlug: string, wsSlug: string) {
  const fn = useServerFn(retestModuleConnection);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspace-context", orgSlug, wsSlug] });
      void qc.invalidateQueries({ queryKey: ["connection-hub", orgSlug] });
    },
  });
}

export function useSaveModuleInvoicesApiKey(orgSlug: string, wsSlug: string) {
  const fn = useServerFn(saveModuleInvoicesApiKey);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspace-context", orgSlug, wsSlug] });
      void qc.invalidateQueries({ queryKey: ["connection-hub", orgSlug] });
    },
  });
}
