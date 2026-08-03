import type { Json } from "@/integrations/supabase/types";

/** JSON object safe for TanStack Start server-fn serialization. */
export type JsonObject = { [key: string]: Json };

/** Curated personal dossier stored per user. */
export type PersonalContextRecord = {
  userId: string;
  schemaVersion: string;
  dossier: JsonObject;
  rawMarkdown: string;
  source: string | null;
  generatedAt: string | null;
  updatedAt: string;
};

export type PersonalContextUpsert = {
  dossier: JsonObject;
  rawMarkdown: string;
  source?: string | null;
  generatedAt?: string | null;
  schemaVersion?: string;
};

export function asDossierObject(
  value: Json | Record<string, unknown> | null | undefined,
): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

export function toJsonObject(value: Record<string, unknown>): JsonObject {
  return value as JsonObject;
}
