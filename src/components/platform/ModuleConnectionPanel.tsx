import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  resolveModuleOpenUrl,
  type ModuleConnectionRow,
  type ModuleConnectionStatus,
} from "@/lib/module-connections";
import {
  useRetestModuleConnection,
  useVerifyAndSaveModuleConnection,
} from "@/lib/module-verify.hooks";

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
  moduleDefaultUrl?: string | null;
  moduleKeyPrefix?: string | null;
};

const statusLabel: Record<ModuleConnectionStatus, string> = {
  pending: "Venter",
  connected: "Koblet",
  error: "Feil",
  disconnected: "Frakoblet",
};

function formatTime(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

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
  moduleDefaultUrl,
  moduleKeyPrefix,
}: Props) {
  const qc = useQueryClient();
  const [externalOrgId, setExternalOrgId] = useState(connection?.external_org_id ?? "");
  const [baseUrl, setBaseUrl] = useState(connection?.external_base_url ?? "");
  const [verifyApiKey, setVerifyApiKey] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["workspace-context", orgSlug, wsSlug] });

  const verify = useVerifyAndSaveModuleConnection(orgSlug, wsSlug);
  const retest = useRetestModuleConnection(orgSlug, wsSlug);

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
      setVerifyApiKey("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onTestAndSave = async () => {
    try {
      const res = await verify.mutateAsync({
        data: {
          orgId,
          workspaceId,
          moduleId,
          moduleSlug,
          external_org_id: externalOrgId.trim(),
          external_base_url: baseUrl.trim(),
          verify_api_key: verifyApiKey.trim(),
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Koblet til ${res.orgName}`);
      setVerifyApiKey("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verify feilet");
    }
  };

  const onRetest = async () => {
    if (!connection) return;
    try {
      const res = await retest.mutateAsync({
        data: { orgId, connectionId: connection.id },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Fortsatt koblet: ${res.orgName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retest feilet");
    }
  };

  if (!enabled) return null;

  const isConnected = connection?.status === "connected";
  const openUrl = connection ? resolveModuleOpenUrl(connection) : null;
  const lastVerified = formatTime(connection?.last_verified_at);
  const busy = verify.isPending || retest.isPending || disconnect.isPending;

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

      {isConnected && connection?.external_org_name && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          <span>
            <span className="font-medium text-foreground">{connection.external_org_name}</span>
            {lastVerified ? ` — sist verifisert ${lastVerified}` : null}
          </span>
        </div>
      )}

      {connection?.status === "error" && connection.error_message && (
        <p className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          {connection.error_message}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Opprett en verify-nøkkel i {moduleName} med scope{" "}
        <code className="font-mono">platform:read</code> +{" "}
        <code className="font-mono">platform:verify</code>. Nøkkelen lagres kryptert server-side og
        vises aldri i klienten.
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
            disabled={!canEdit || busy}
            className="font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`url-${moduleId}`} className="text-xs">
            Base URL
          </Label>
          <Input
            id={`url-${moduleId}`}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={moduleDefaultUrl ?? "https://modul.example.com"}
            disabled={!canEdit || busy}
            className="text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`key-${moduleId}`} className="text-xs">
            Verify-nøkkel {isConnected ? "(kun ved oppdatering)" : ""}
          </Label>
          <Input
            id={`key-${moduleId}`}
            type="password"
            autoComplete="off"
            value={verifyApiKey}
            onChange={(e) => setVerifyApiKey(e.target.value)}
            placeholder={moduleKeyPrefix ? `${moduleKeyPrefix}...` : "api_live_..."}
            disabled={!canEdit || busy}
            className="font-mono text-xs"
          />
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={onTestAndSave}
            disabled={
              busy ||
              !externalOrgId.trim() ||
              !baseUrl.trim() ||
              verifyApiKey.trim().length < 20
            }
          >
            {verify.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Test og lagre kobling"
            )}
          </Button>
          {isConnected && (
            <Button size="sm" variant="outline" onClick={onRetest} disabled={busy}>
              {retest.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              Test på nytt
            </Button>
          )}
          {connection && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => disconnect.mutate()}
              disabled={busy}
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
