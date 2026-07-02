import type { MissionTier } from "@/lib/mission-actions";

export type InboxSource = "gmail" | "slack";

export type InboxAction = {
  key: string;
  source: InboxSource;
  title: string;
  sender: string;
  snippet: string;
  href: string | null;
  priority: number;
  tier: MissionTier;
};
