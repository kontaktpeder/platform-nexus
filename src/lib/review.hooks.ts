import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReviewCount } from "@/lib/review.functions";

export function useReviewInboxCount() {
  const fetchCount = useServerFn(getReviewCount);
  return useQuery({
    queryKey: ["review-count"],
    queryFn: () => fetchCount() as Promise<{ total: number }>,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
