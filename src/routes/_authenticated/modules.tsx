import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/platform/TopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/modules")({
  head: () => ({ meta: [{ title: "Modules — Platform Core" }] }),
  component: ModulesRegistry,
});

function ModulesRegistry() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-modules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modules")
        .select("id, slug, name, description, status, version")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar title="Modules" subtitle="Registry" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24">
        <p className="mb-4 text-sm text-muted-foreground">
          Enable modules per workspace under the workspace's Modules tab.
        </p>

        {isLoading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="grid gap-2">
            {(data ?? []).map((m) => (
              <li key={m.id} className="surface-card flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-base font-semibold">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.slug}</span>
                  </div>
                  {m.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={m.status === "available" ? "default" : "secondary"}>
                    {m.status}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">v{m.version}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <PlatformBottomNav />
    </div>
  );
}
