// Mission action ServerFns. Mission metadata + Gmail mutations.
// Slack/Finance/Work: dismiss/snooze/handled_locally only in v1.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { snoozeUntil } from "@/lib/mission-snooze";
import { getActionSourceFromKey } from "@/lib/mission-actions";

const actionSchema = z.object({
  actionKey: z.string().min(1),
  action: z.enum([
    "mark_read",
    "archive",
    "dismiss",
    "snooze",
    "handled_locally",
    "open_only",
  ]),
  snoozePreset: z.enum(["later_today", "tomorrow", "next_week"]).optional(),
});

function parseGmailMessageId(actionKey: string): string | null {
  if (!actionKey.startsWith("gmail:")) return null;
  const id = actionKey.slice("gmail:".length);
  return id.length ? id : null;
}

export const executeMissionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => actionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const source = getActionSourceFromKey(data.actionKey);

    // Commitment: mutate user_commitments status directly.
    if (source === "commitment") {
      const id = data.actionKey.slice("commitment:".length);
      const newStatus =
        data.action === "handled_locally"
          ? "done"
          : data.action === "dismiss"
            ? "dismissed"
            : data.action === "snooze"
              ? null // fall through to state upsert below
              : null;
      if (newStatus) {
        await supabase
          .from("user_commitments")
          .update({ status: newStatus } as never)
          .eq("user_id", userId)
          .eq("id", id);
        return { ok: true as const };
      }
      // For snooze fall through to normal mission_action_state path below.
    }

    // Gmail-only mutations

    if (data.action === "mark_read" || data.action === "archive") {
      if (source !== "gmail") {
        throw new Response("mark_read/archive only supported for Gmail", {
          status: 400,
        });
      }
      const messageId = parseGmailMessageId(data.actionKey);
      if (!messageId) {
        throw new Response("Invalid Gmail actionKey", { status: 400 });
      }
      const { markGmailMessageRead, archiveGmailMessage } = await import(
        "@/lib/inbox/gmail.server"
      );
      // Perform Gmail mutation first — throw on failure, no state write.
      if (data.action === "mark_read") await markGmailMessageRead(messageId);
      else await archiveGmailMessage(messageId);
      // On success also write handled_locally so the card hides immediately,
      // even if Gmail refetch is slow or the query still matches transiently.
      const { upsertMissionActionState } = await import(
        "@/lib/mission-action-state.server"
      );
      await upsertMissionActionState(supabase, {
        userId,
        actionKey: data.actionKey,
        status: "handled_locally",
      });
      return { ok: true as const };
    }

    if (data.action === "open_only") {
      return { ok: true as const };
    }

    const { upsertMissionActionState } = await import(
      "@/lib/mission-action-state.server"
    );

    if (data.action === "snooze") {
      const preset = data.snoozePreset ?? "tomorrow";
      const until = snoozeUntil(preset);
      await upsertMissionActionState(supabase, {
        userId,
        actionKey: data.actionKey,
        status: "snoozed",
        snoozedUntil: until,
      });
      return { ok: true as const };
    }

    if (data.action === "dismiss") {
      await upsertMissionActionState(supabase, {
        userId,
        actionKey: data.actionKey,
        status: "dismissed",
      });
      return { ok: true as const };
    }

    if (data.action === "handled_locally") {
      await upsertMissionActionState(supabase, {
        userId,
        actionKey: data.actionKey,
        status: "handled_locally",
      });
      return { ok: true as const };
    }

    return { ok: true as const };
  });

export const undoMissionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ actionKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { deleteMissionActionState } = await import(
      "@/lib/mission-action-state.server"
    );
    await deleteMissionActionState(context.supabase, {
      userId: context.userId,
      actionKey: data.actionKey,
    });
    return { ok: true as const };
  });

export const getMissionActionStates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listMissionActionStates } = await import(
      "@/lib/mission-action-state.server"
    );
    return listMissionActionStates(context.supabase, context.userId);
  });
