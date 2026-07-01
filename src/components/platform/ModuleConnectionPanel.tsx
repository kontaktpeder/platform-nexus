import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, Loader2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  connectionInputSchema,
  moduleAppUrl,
  normalizeBaseUrl,
  validateConnectionInput,
  type ModuleConnectionRow,
  type ModuleConnectionStatus,
} from "@/lib/module-connections";

type Props = {
  orgId: string;
  workspaceId: string;
  moduleId: string;
  moduleSlug: string;
  moduleName: string;
  enabled: boolean;
  connection: ModuleConnectionRow | null;
  canEdit: boolean;
  orgSlug: string;
  wsSlug: string;
};

const statusLabel: Record<ModuleConnectionStatus, string> = {
  pending: "Venter",
  connected: "Koblet",
  error: "Feil",
  disconnected: "Frakoblet",
};

export function ModuleConnectionPanel({
  orgId,
  workspaceId,
  moduleId,
  moduleSlug,
  moduleName,
  enabled,
  connection,
  canEdit,
  orgSlug,
  wsSlug,
}: Props) {
  const qc = useQueryClient();
  const [externalOrgId, setExternalOrgId] = useState(connection?.external_org_id ?? "");
  const [baseUrl, setBaseUrl] = useState(connection?.external_base_url ?? "");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["workspace-context", orgSlug, wsSlug] });

  const save = useMutation({
    mutationFn: async () => {
      const check = validateConnectionInput({
        external_org_id: externalOrgId,
        external_base_url: baseUrl,
      });
      if (!check.ok) throw new Error(check.error);

      const parsed = connectionInputSchema.parse({
        external_org_id: externalOrgId,
        external_base_url: baseUrl,
      });

      const { data: user } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const payload = {
        org_id: orgId,
        workspace_id: workspaceId,
        module_id: moduleId,
        external_org_id: parsed.external_org_id,
        external_base_url: normalizeBaseUrl(parsed.external_base_url),
        status: "connected" as const,
        connected_by: user.user?.id ?? null,
        connected_at: now,
        last_verified_at: now,
        error_message: null,
      };

      const { error } = await supabase
        .from("module_connections")
        .upsert(payload, { onConflict: "workspace_id,module_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${moduleName} koblet til eksisterende organisasjon`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      if (!connection) return;
      const { error } = await supabase
        .from("module_connections")
        .delete()
        .eq("id", connection.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kobling fjernet");
      setExternalOrgId("");
      setBaseUrl("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!enabled) return null;

  const isConnected = connection?.status === "connected";
  const openUrl =
    isConnected && connection
      ? moduleAppUrl(connection.external_base_url, connection.external_org_id, moduleSlug)
      : null;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          Kobling til eksisterende {moduleName}-org
        </div>
        {connection && (
          <Badge variant={isConnected ? "default" : "outline"}>
            {statusLabel[connection.status] ?? connection.status}
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Lim inn organisasjon-ID fra {moduleName}. Platform oppretter ikke ny org — den peker bare
        på eksisterende data.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ext-${moduleId}`} className="text-xs">
            Ekstern organisasjon-ID (UUID)
          </Label>
          <Input
            id={`ext-${moduleId}`}
            value={externalOrgId}
            onChange={(e) => setExternalOrgId(e.target.value)}
            placeholder="bbc194b3-3067-4eb9-9918-87bed9ab7670"
            disabled={!canEdit || save.isPending}
            className="font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`url-${moduleId}`} className="text-xs">
            Base URL (app eller API-root)
          </Label>
          <Input
            id={`url-${moduleId}`}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://finance.example.com"
            disabled={!canEdit || save.isPending}
            className="text-xs"
          />
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre kobling"}
          </Button>
          {connection && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              <Unlink className="mr-1 h-4 w-4" />
              Fjern
            </Button>
          )}
        </div>
      )}

      {openUrl && (
        <a
          href={openUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Åpne {moduleName} <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
