import { CUSTOMER_ORG_FILTER_LABEL } from "@/lib/customers.functions";
import type { OwnerContext } from "@/lib/knowledge/types";
import { cn } from "@/lib/utils";

export function OwnerContextChip({
  ownerContext,
  className,
}: {
  ownerContext: OwnerContext | null | undefined;
  className?: string;
}) {
  if (!ownerContext || ownerContext === "unknown") return null;
  return (
    <span
      className={cn(
        "inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground",
        className,
      )}
    >
      {CUSTOMER_ORG_FILTER_LABEL[ownerContext]}
    </span>
  );
}
