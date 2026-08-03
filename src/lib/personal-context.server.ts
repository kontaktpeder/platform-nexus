import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { buildPersonalContextPromptBlock } from "@/lib/personal-context/prompt";
import {
  asDossierObject,
  type PersonalContextRecord,
  type PersonalContextUpsert,
} from "@/lib/personal-context/types";

type DB = SupabaseClient<Database>;

function mapRow(row: {
  user_id: string;
  schema_version: string;
  dossier: Database["public"]["Tables"]["user_personal_context"]["Row"]["dossier"];
  raw_markdown: string;
  source: string | null;
  generated_at: string | null;
  updated_at: string;
}): PersonalContextRecord {
  return {
    userId: row.user_id,
    schemaVersion: row.schema_version,
    dossier: asDossierObject(row.dossier),
    rawMarkdown: row.raw_markdown ?? "",
    source: row.source,
    generatedAt: row.generated_at,
    updatedAt: row.updated_at,
  };
}

export async function getPersonalContext(
  client: DB,
  userId: string,
): Promise<PersonalContextRecord | null> {
  const { data, error } = await client
    .from("user_personal_context")
    .select(
      "user_id, schema_version, dossier, raw_markdown, source, generated_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapRow(data);
}

export async function upsertPersonalContext(
  client: DB,
  userId: string,
  input: PersonalContextUpsert,
): Promise<PersonalContextRecord> {
  const payload = {
    user_id: userId,
    schema_version: input.schemaVersion?.trim() || "1.0",
    dossier: input.dossier as Json,
    raw_markdown: input.rawMarkdown.slice(0, 50000),
    source: input.source?.trim().slice(0, 200) || null,
    generated_at: input.generatedAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("user_personal_context")
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "user_id, schema_version, dossier, raw_markdown, source, generated_at, updated_at",
    )
    .single();
  if (error) throw error;
  return mapRow(data);
}

/** Load capped prompt block for Fortell / Inbox / Mission. */
export async function loadPersonalContextPromptBlock(
  client: DB,
  userId: string,
): Promise<string | null> {
  const record = await getPersonalContext(client, userId);
  return buildPersonalContextPromptBlock(record);
}
