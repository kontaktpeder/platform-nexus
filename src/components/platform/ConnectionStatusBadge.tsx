import { Badge } from "@/components/ui/badge";
import type { HubStatus } from "@/lib/connection-hub.types";

const VARIANT: Record<
  HubStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  connected: "default",
  partial: "secondary",
  error: "destructive",
  not_configured: "outline",
  disabled: "outline",
  unavailable: "destructive",
};

export function ConnectionStatusBadge({
  status,
  label,
}: {
  status: HubStatus;
  label: string;
}) {
  return (
    <Badge variant={VARIANT[status]} className="shrink-0 text-[11px] font-medium">
      {label}
    </Badge>
  );
}
