/**
 * Fortell thread server fns — load active chat / start new chat.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  archiveAndStartFortellThread,
  getOrCreateActiveFortellThread,
  type FortellStoredMessage,
} from "@/lib/fortell-memory.server";

export type FortellThreadPayload = {
  threadId: string;
  messages: FortellStoredMessage[];
};

export const getActiveFortellThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FortellThreadPayload> => {
    const { supabase, userId } = context;
    return getOrCreateActiveFortellThread(supabase, userId);
  });

export const startNewFortellThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FortellThreadPayload> => {
    const { supabase, userId } = context;
    const { threadId } = await archiveAndStartFortellThread(supabase, userId);
    return { threadId, messages: [] };
  });
