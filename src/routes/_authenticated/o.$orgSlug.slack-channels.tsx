import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/platform/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Hash, Trash2, Zap, RefreshCw } from "lucide-react";
import {
  listSlackChannelRules,
  upsertSlackChannelRule,
  setSlackChannelRuleEnabled,
  deleteSlackChannelRule,
  testSlackChannelIngest,
  type SlackChannelRule,
} from "@/lib/slack-channel-rules.functions";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/slack-channels")({
  component: SlackChannelsPage,
});

function SlackChannelsPage() {
  const { orgSlug } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listSlackChannelRules);
  const upsertFn = useServerFn(upsertSlackChannelRule);
  const toggleFn = useServerFn(setSlackChannelRuleEnabled);
  const deleteFn = useServerFn(deleteSlackChannelRule);
  const testFn = useServerFn(testSlackChannelIngest);

  const { data: org } = useQuery({
    queryKey: ["org", orgSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .eq("slug", orgSlug)
        .maybeSingle();
      if (error) throw error;
      return data!;
    },
  });

  const rulesQuery = useQuery({
    enabled: !!org?.id,
    queryKey: ["slack-rules", org?.id],
    queryFn: () => listFn({ data: { organizationId: org!.id } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["slack-rules", org?.id] });

  const [channelId, setChannelId] = useState("");
  const [channelName, setChannelName] = useState("");

  const addRule = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          organizationId: org!.id,
          slackChannelId: channelId,
          slackChannelName: channelName || null,
        },
      }),
    onSuccess: () => {
      setChannelId("");
      setChannelName("");
      toast.success("Kanal lagt til");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (v: { ruleId: string; enabled: boolean }) => toggleFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (ruleId: string) => deleteFn({ data: { ruleId } }),
    onSuccess: () => { invalidate(); toast.success("Regel fjernet"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: (ruleId: string) => testFn({ data: { ruleId } }),
    onSuccess: (res) => {
      toast.success(
        `Test: ${res.inserted} nye, ${res.skipped} kjent${res.errors.length ? `, ${res.errors.length} feil` : ""}`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title="Slack-kanaler"
        subtitle={org?.name}
        back={{ to: "/o/$orgSlug/settings", params: { orgSlug } }}
      />
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <section className="surface-card p-5">
          <h2 className="font-heading text-lg font-semibold">Kanal-whitelist</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform leser bare Slack-kanaler som er eksplisitt lagt til her. DMs og @-nevninger fungerer som før.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">Kanal-ID</Label>
              <Input
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="C0123ABCD"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Navn (valgfritt)</Label>
              <Input
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="drift"
              />
            </div>
            <Button
              onClick={() => addRule.mutate()}
              disabled={!channelId.trim() || addRule.isPending}
            >
              {addRule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Legg til
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Finn kanal-ID i Slack: Høyreklikk kanal → Kopier lenke. ID-en er den siste delen (starter med C).
          </p>
        </section>

        <section className="surface-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-heading text-base font-semibold">Aktive regler</h3>
            <Button size="sm" variant="ghost" onClick={invalidate}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Oppdater
            </Button>
          </div>

          {rulesQuery.isLoading && (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {rulesQuery.data && rulesQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Ingen kanaler er lagt til enda.</p>
          )}

          <ul className="divide-y divide-border">
            {rulesQuery.data?.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                onToggle={(enabled) => toggle.mutate({ ruleId: r.id, enabled })}
                onDelete={() => remove.mutate(r.id)}
                onTest={() => test.mutate(r.id)}
                testing={test.isPending && test.variables === r.id}
              />
            ))}
          </ul>
        </section>

        <p className="text-xs text-muted-foreground">
          Signaler fra whitelistede kanaler dukker opp i <Link className="underline" to="/review">Review</Link>.
          Mission viser bare relevante meldinger (nevninger, oppgaver, frister, driftshendelser).
        </p>
      </main>
    </div>
  );
}

function RuleRow(props: {
  rule: SlackChannelRule;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onTest: () => void;
  testing: boolean;
}) {
  const { rule } = props;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Hash className="h-4 w-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {rule.slack_channel_name ? `#${rule.slack_channel_name}` : rule.slack_channel_id}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {rule.slack_channel_id}
          {rule.last_ingested_at && (
            <> · sist hentet {new Date(rule.last_ingested_at).toLocaleString("nb-NO")}</>
          )}
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] uppercase">{rule.ingest_mode}</Badge>
      <Switch checked={rule.enabled} onCheckedChange={props.onToggle} />
      <Button size="sm" variant="outline" onClick={props.onTest} disabled={props.testing}>
        {props.testing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1 h-3.5 w-3.5" />}
        Test
      </Button>
      <Button size="sm" variant="ghost" onClick={props.onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
