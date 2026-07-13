import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const ORG_KEY = "platform:lastOrgSlug";
const WS_KEY = "platform:lastWsSlug";

export type ResolvedLastWorkspace = {
  orgSlug: string;
  wsSlug: string;
  orgName: string;
  wsName: string;
};

export function getLastWorkspace(): { orgSlug: string; wsSlug: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const orgSlug = window.localStorage.getItem(ORG_KEY);
    const wsSlug = window.localStorage.getItem(WS_KEY);
    if (!orgSlug || !wsSlug) return null;
    return { orgSlug, wsSlug };
  } catch {
    return null;
  }
}

export function setLastWorkspace(orgSlug: string, wsSlug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORG_KEY, orgSlug);
    window.localStorage.setItem(WS_KEY, wsSlug);
  } catch {
    /* ignore */
  }
}

/** Resolve last workspace slugs to display names; null if org/ws no longer exists. */
export async function resolveLastWorkspace(
  supabase: SupabaseClient<Database>,
): Promise<ResolvedLastWorkspace | null> {
  const last = getLastWorkspace();
  if (!last) return null;

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", last.orgSlug)
    .maybeSingle();
  if (orgErr || !org) return null;

  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("org_id", org.id)
    .eq("slug", last.wsSlug)
    .maybeSingle();
  if (wsErr || !ws) return null;

  return {
    orgSlug: org.slug,
    wsSlug: ws.slug,
    orgName: org.name,
    wsName: ws.name,
  };
}

/** Prefer last workspace after login; otherwise org picker (Hjem). */
export function getAuthenticatedHomeTarget(): {
  to: "/app";
  params?: undefined;
} | {
  to: "/o/$orgSlug/w/$wsSlug";
  params: { orgSlug: string; wsSlug: string };
} {
  const last = getLastWorkspace();
  if (last) {
    return { to: "/o/$orgSlug/w/$wsSlug", params: last };
  }
  return { to: "/app" };
}
