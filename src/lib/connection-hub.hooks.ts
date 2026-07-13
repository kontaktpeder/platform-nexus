import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgConnectionHub } from "@/lib/connection-hub.functions";

/** Live org connection hub — refetches when invalidated after module verify/retest/disconnect. */
export function useOrgConnectionHub(orgSlug: string) {
  const fetchHub = useServerFn(getOrgConnectionHub);
  return useQuery({
    queryKey: ["connection-hub", orgSlug],
    queryFn: () => fetchHub({ data: { orgSlug } }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
