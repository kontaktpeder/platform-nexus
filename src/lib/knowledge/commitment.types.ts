// Knowledge v3 — Commitments (client-safe types).
// Storage: public.user_commitments. See docs/KNOWLEDGE.v3.md.

export type CommitmentStatus = "suggested" | "open" | "done" | "dismissed";
export type CommitmentConfidence = "low" | "medium" | "high";
export type CommitmentSource = "gmail" | "slack" | "workspace" | "manual";

export type UserCommitment = {
  id: string;
  user_id: string;
  entity_id: string | null;
  source: CommitmentSource;
  source_ref: string;
  title: string;
  due_date: string | null; // YYYY-MM-DD (Europe/Oslo)
  status: CommitmentStatus;
  confidence: CommitmentConfidence;
  reason: string | null;
  metadata: {
    detected_phrase?: string;
    timezone?: string;
    [k: string]: unknown;
  };
  created_at: string;
  updated_at: string;
};

export const COMMITMENT_STATUS_LABEL: Record<CommitmentStatus, string> = {
  suggested: "Foreslått",
  open: "Åpen",
  done: "Ferdig",
  dismissed: "Avvist",
};

export const COMMITMENT_CONFIDENCE_LABEL: Record<CommitmentConfidence, string> = {
  low: "Lav",
  medium: "Middels",
  high: "Høy",
};

export const OSLO_TZ = "Europe/Oslo";

export function todayOsloISO(now: Date = new Date()): string {
  // en-CA gives YYYY-MM-DD; Europe/Oslo forces the local calendar day.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OSLO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
