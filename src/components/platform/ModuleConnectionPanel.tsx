import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  useSaveModuleInvoicesApiKey,
} from "@/lib/module-verify.hooks";
import { getFinanceInvoicesAccess } from "@/lib/module-verify.functions";

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
  const [invoicesApiKey, setInvoicesApiKey] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["workspace-context", orgSlug, wsSlug] });

  const verify = useVerifyAndSaveModuleConnection(orgSlug, wsSlug);
  const retest = useRetestModuleConnection(orgSlug, wsSlug);
  const saveInvoicesKey = useSaveModuleInvoicesApiKey(orgSlug, wsSlug);
  const fetchInvoicesAccess = useServerFn(getFinanceInvoicesAccess);
  const invoicesAccess = useQuery({
    enabled: moduleSlug === "finance" && !!connection?.id && connection.status === "connected",
    queryKey: ["finance-invoices-access", connection?.id],
    queryFn: () =>
      fetchInvoicesAccess({
        data: { orgId, connectionId: connection!.id },
      }),
    staleTime: 60_000,
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
  const busy = verify.isPending || retest.isPending || disconnect.isPending || saveInvoicesKey.isPending;

  const onSaveInvoicesKey = async () => {
    if (!connection) return;
    try {
      await saveInvoicesKey.mutateAsync({
        data: {
          orgId,
          connectionId: connection.id,
          invoices_api_key: invoicesApiKey.trim(),
        },
      });
      toast.success("Faktura-nøkkel lagret — Send purring i Mission er klar");
      setInvoicesApiKey("");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre faktura-nøkkel");
    }
  };

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
        Verify-nøkkel trenger scope <code className="font-mono">platform:read</code> +{" "}
        <code className="font-mono">platform:verify</code>. For Send purring fra Mission trenger
        nøkkelen også <code className="font-mono">invoices:read</code> — enten på verify-nøkkelen
        eller som egen faktura-nøkkel nedenfor.
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

      {moduleSlug === "finance" && isConnected && (
        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
          {invoicesAccess.data?.invoicesCapable ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Faktura-tilgang OK — verify-nøkkelen har <code className="font-mono">invoices:read</code>.
              Egen faktura-nøkkel er ikke nødvendig.
            </p>
          ) : (
            <>
              <p className="text-xs font-medium">Faktura-nøkkel for Mission</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Verify-nøkkelen mangler <code className="font-mono">invoices:read</code>. Lim inn en
                nøkkel med det scopet her, eller oppdater verify-nøkkelen over og test på nytt.
              </p>
              {canEdit && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`inv-key-${moduleId}`} className="sr-only">
                      Faktura-nøkkel
                    </Label>
                    <Input
                      id={`inv-key-${moduleId}`}
                      type="password"
                      autoComplete="off"
                      value={invoicesApiKey}
                      onChange={(e) => setInvoicesApiKey(e.target.value)}
                      placeholder="fc_live_... (invoices:read)"
                      disabled={busy}
                      className="font-mono text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onSaveInvoicesKey}
                    disabled={busy || invoicesApiKey.trim().length < 20}
                  >
                    {saveInvoicesKey.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Lagre faktura-nøkkel"
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

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
