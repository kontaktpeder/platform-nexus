import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveLastWorkspace } from "@/lib/last-workspace";

export function useResolvedLastWorkspace() {
  return useQuery({
    queryKey: ["last-workspace-resolved"],
    queryFn: () => resolveLastWorkspace(supabase),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
}
