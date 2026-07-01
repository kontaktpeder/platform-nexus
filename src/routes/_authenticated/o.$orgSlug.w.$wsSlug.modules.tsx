import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWs } from "./o.$orgSlug.w.$wsSlug";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/w/$wsSlug/modules")({
  component: ModulesPage,
});

function iconFor(name?: string | null): LucideIcon {
  if (!name) return Icons.Package;
  const key = name.split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join("");
  return (Icons as unknown as Record<string, LucideIcon>)[key] ?? Icons.Package;
}

function ModulesPage() {
  const { orgSlug, wsSlug } = Route.useParams();
  const { ws, modules, role } = useWs();
  const qc = useQueryClient();
  const canEdit = role === "owner" || role === "admin";

  const toggle = useMutation({
    mutationFn: async ({ moduleId, enabled }: { moduleId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("workspace_modules")
        .upsert({ workspace_id: ws.id, module_id: moduleId, enabled }, { onConflict: "workspace_id,module_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-context", orgSlug, wsSlug] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <h1 className="font-heading text-2xl font-bold">Moduler</h1>
      <p className="mt-1 text-sm text-muted-foreground">Slå på det arbeidsflaten skal bruke. Platform Core kobler dem sammen.</p>

      <ul className="mt-6 grid gap-3">
        {modules.map((m) => {
          const Icon = iconFor(m.icon);
          return (
            <li key={m.id} className="surface-card flex items-center gap-4 p-4">
              <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-heading text-base font-semibold">{m.name}</div>
                  {m.status === "beta" && <Badge variant="secondary">Beta</Badge>}
                  {m.status === "coming_soon" && <Badge variant="outline">Kommer</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{m.description}</div>
              </div>
              <Switch
                checked={m.enabled}
                disabled={!canEdit || m.status === "coming_soon" || toggle.isPending}
                onCheckedChange={(v) => toggle.mutate({ moduleId: m.id, enabled: v })}
              />
            </li>
          );
        })}
      </ul>
    </main>
  );
}
