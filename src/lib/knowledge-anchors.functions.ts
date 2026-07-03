// Server functions for Knowledge Anchors v0.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// TSS serialization validator rejects `unknown` fields in metadata jsonb.
// Round-trip through JSON to strip and cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(v: unknown): any {
  return JSON.parse(JSON.stringify(v ?? null));
}

export const getAnchorContexts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAnchorEntitiesWithCounts } = await import(
      "@/lib/knowledge/anchor-entities.server"
    );
    const rows = await listAnchorEntitiesWithCounts(context.supabase, context.userId);
    return normalize(rows);
  });

export const ensureKnowledgeAnchors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureAnchorEntities } = await import(
      "@/lib/knowledge/anchor-entities.server"
    );
    const res = await ensureAnchorEntities(context.supabase, context.userId);
    return normalize(res);
  });
