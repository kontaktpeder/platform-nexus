// Server-only helpers for the Knowledge layer.
// Uses the authenticated user Supabase client (RLS enforced).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { slugify } from "@/lib/slug";
import type { EntityType } from "./types";

type DB = SupabaseClient<Database>;

export async function slugifyEntityName(
  client: DB,
  userId: string,
  name: string,
): Promise<string> {
  const base = slugify(name) || "entity";
  let candidate = base;
  let n = 1;
  // Bounded loop; slug is user-scoped unique.
  while (n < 100) {
    const { data, error } = await client
      .from("entities")
      .select("id")
      .eq("user_id", userId)
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

export type CreateEntityInput = {
  type: EntityType;
  name: string;
  importance?: number;
  summary?: string | null;
  metadata?: Record<string, unknown>;
};
