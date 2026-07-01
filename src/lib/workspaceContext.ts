import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceContext = Awaited<ReturnType<typeof loadWorkspaceContext>>;

export async function loadWorkspaceContext(orgSlug: string, wsSlug: string) {
  const { data: org, error: e1 } = await supabase
    .from("organizations").select("id, name, slug, logo_url").eq("slug", orgSlug).maybeSingle();
  if (e1) throw e1;
  if (!org) throw new Error("Organisasjon ikke funnet");

  const { data: ws, error: e2 } = await supabase
    .from("workspaces").select("id, name, slug, icon, workspace_type, org_id")
    .eq("org_id", org.id).eq("slug", wsSlug).maybeSingle();
  if (e2) throw e2;
  if (!ws) throw new Error("Arbeidsflate ikke funnet");

  const [{ data: theme }, { data: modules }, { data: enabled }, { data: membership }] = await Promise.all([
    supabase.from("themes").select("*").eq("workspace_id", ws.id).maybeSingle(),
    supabase.from("modules").select("*").order("sort_order"),
    supabase.from("workspace_modules").select("module_id, enabled, config").eq("workspace_id", ws.id),
    supabase.from("memberships").select("role").eq("org_id", org.id).maybeSingle(),
  ]);

  const enabledMap = new Map((enabled ?? []).map((r) => [r.module_id, r]));
  const modulesWithState = (modules ?? []).map((m) => ({
    ...m,
    enabled: enabledMap.get(m.id)?.enabled ?? false,
  }));
  return { org, ws, theme, modules: modulesWithState, role: membership?.role ?? "viewer" as const };
}

export function useWorkspaceContext(orgSlug: string, wsSlug: string) {
  return useQuery({
    queryKey: ["workspace-context", orgSlug, wsSlug],
    queryFn: () => loadWorkspaceContext(orgSlug, wsSlug),
  });
}
