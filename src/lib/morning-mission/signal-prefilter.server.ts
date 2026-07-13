// Cheap pre-filter rules before the Morning Mission AI call.
import type { GmailRecentSignal } from "@/lib/inbox/gmail-recent.server";
import type { MissionActionState } from "@/lib/mission-action-state";

export type MissionSignal = {
  id: string;
  source: "gmail" | "finance" | "work" | "slack";
  subject: string;
  from: string;
  snippet: string;
  occurred_at: string | null;
  href: string | null;
  tags: string[];
  meta?: Record<string, string | number | boolean | null>;
};

export function gmailToSignal(g: GmailRecentSignal): MissionSignal {
  return {
    id: g.id,
    source: "gmail",
    subject: g.subject,
    from: g.from,
    snippet: g.snippet,
    occurred_at: g.occurredAt,
    href: g.href,
    tags: g.tags,
    meta: {
      from_email: g.fromEmail,
      to: g.to,
      is_unread: g.isUnread,
      is_sent: g.isSent,
      thread_id: g.threadId,
    },
  };
}

function isOwnTestMail(signal: MissionSignal, userEmail: string | null): boolean {
  if (!userEmail) return false;
  const email = (signal.meta?.from_email as string | null)?.toLowerCase();
  if (email !== userEmail.toLowerCase()) return false;
  const subj = signal.subject.toLowerCase().trim();
  return subj === "hei" || subj === "test" || subj.startsWith("test ");
}

function isDismissedSignal(id: string, states: MissionActionState[]): boolean {
  const s = states.find((x) => x.action_key === id || x.action_key === `brief:${id}`);
  if (!s) return false;
  return s.status === "dismissed" || s.status === "handled_locally";
}

export function prefilterSignals(input: {
  signals: MissionSignal[];
  userEmail: string | null;
  actionStates: MissionActionState[];
}): { forAi: MissionSignal[]; dropped: string[] } {
  const seen = new Set<string>();
  const dropped: string[] = [];
  const forAi: MissionSignal[] = [];

  for (const s of input.signals) {
    if (seen.has(s.id)) {
      dropped.push(s.id);
      continue;
    }
    seen.add(s.id);

    if (isDismissedSignal(s.id, input.actionStates)) {
      dropped.push(s.id);
      continue;
    }

    if (isOwnTestMail(s, input.userEmail)) {
      dropped.push(s.id);
      continue;
    }

    forAi.push(s);
  }

  return { forAi, dropped };
}
