import type { User } from "@supabase/supabase-js";

/** Human-readable auth providers linked to this user (e.g. google, email). */
export function listAuthProviders(user: User | null | undefined): string[] {
  if (!user) return [];
  const fromIdentities = (user.identities ?? []).map((i) => i.provider);
  const fromMeta = (user.app_metadata?.providers as string[] | undefined) ?? [];
  return Array.from(new Set([...fromIdentities, ...fromMeta])).filter(Boolean);
}

export function hasEmailPasswordProvider(user: User | null | undefined): boolean {
  return listAuthProviders(user).includes("email");
}

export function hasGoogleProvider(user: User | null | undefined): boolean {
  return listAuthProviders(user).includes("google");
}
