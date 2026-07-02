import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ModuleConnectionRow } from "@/lib/module-connections";

export type WorkspaceModule = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  version: string;
  status: "available" | "beta" | "coming_soon";
  default_url: string | null;
  api_endpoint: string | null;
  sort_order: number;
  enabled: boolean;
  config: Record<string, unknown>;
  connection: ModuleConnectionRow | null;
};

export type WorkspaceContext = Awaited<ReturnType<typeof loadWorkspaceContext>>;

export async function loadWorkspaceContext(orgSlug: string, wsSlug: string) {
  const { data: org, error: e1 } = await supabase
    .from("organizations")
    .select("id, name, slug, logo_url")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (e1) throw e1;
  if (!org) throw new Error("Organisasjon ikke funnet");

  const { data: ws, error: e2 } = await supabase
    .from("workspaces")
    .select("id, name, slug, icon, workspace_type, org_id")
    .eq("org_id", org.id)
    .eq("slug", wsSlug)
    .maybeSingle();
  if (e2) throw e2;
  if (!ws) throw new Error("Arbeidsflate ikke funnet");

  const [
    { data: theme },
    { data: modules },
    { data: enabled },
    { data: membership },
    { data: connections },
  ] = await Promise.all([
    supabase.from("themes").select("*").eq("workspace_id", ws.id).maybeSingle(),
    supabase.from("modules").select("*").order("sort_order"),
    supabase.from("workspace_modules").select("module_id, enabled, config").eq("workspace_id", ws.id),
    supabase.from("memberships").select("role").eq("org_id", org.id).maybeSingle(),
    supabase
      .from("module_connections")
      .select(
        "id, org_id, workspace_id, module_id, external_org_id, external_base_url, status, connected_by, connected_at, last_verified_at, error_message, external_org_name, resolved_org_home_url, module_slug",
      )
      .eq("workspace_id", ws.id),
  ]);

  const enabledMap = new Map((enabled ?? []).map((r) => [r.module_id, r]));
  const connectionMap = new Map(
    (connections ?? []).map((c) => [c.module_id, c as ModuleConnectionRow]),
  );

  const modulesWithState: WorkspaceModule[] = (modules ?? []).map((m) => ({
    ...m,
    enabled: enabledMap.get(m.id)?.enabled ?? false,
    connection: connectionMap.get(m.id) ?? null,
  }));

  return {
    org,
    ws,
    theme,
    modules: modulesWithState,
    connections: (connections ?? []) as ModuleConnectionRow[],
    role: membership?.role ?? ("viewer" as const),
  };
}

export function useWorkspaceContext(orgSlug: string, wsSlug: string) {
  return useQuery({
    queryKey: ["workspace-context", orgSlug, wsSlug],
    queryFn: () => loadWorkspaceContext(orgSlug, wsSlug),
  });
}

export function getModuleConnection(
  modules: WorkspaceModule[],
  slug: string,
): ModuleConnectionRow | null {
  return modules.find((m) => m.slug === slug)?.connection ?? null;
}
