import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/platform/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Loader2, UserPlus } from "lucide-react";
import {
  inviteOrgMemberByEmail,
  listOrgMembersWithEmail,
} from "@/lib/membership.functions";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/settings")({
  component: OrgSettings,
});

const ROLES = ["owner", "admin", "editor", "viewer"] as const;
type Role = (typeof ROLES)[number];
const INVITE_ROLES = ["admin", "editor", "viewer"] as const;

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} kopiert`);
  } catch {
    toast.error("Kunne ikke kopiere");
  }
}

function OrgSettings() {
  const { orgSlug } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listOrgMembersWithEmail);
  const inviteFn = useServerFn(inviteOrgMemberByEmail);

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

  const { data: membersPayload } = useQuery({
    enabled: !!org,
    queryKey: ["members", org?.id],
    queryFn: () => listFn({ data: { orgId: org!.id } }),
  });
  const members = membersPayload?.members;
  const canEdit = membersPayload?.canInvite ?? false;

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      const { error } = await supabase.from("memberships").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", org?.id] });
      toast.success("Rolle oppdatert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("memberships").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", org?.id] });
      toast.success("Medlem fjernet");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof INVITE_ROLES)[number]>("editor");
  const inviteMember = useMutation({
    mutationFn: async () =>
      inviteFn({
        data: { orgId: org!.id, email: inviteEmail.trim(), role: inviteRole },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["members", org?.id] });
      setInviteEmail("");
      if (res.alreadyMember) toast.message("Brukeren er allerede medlem");
      else if (res.invited) toast.success("Invitasjon sendt på e-post");
      else toast.success("Medlem lagt til");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Innstillinger" subtitle={org?.name} back={{ to: "/o/$orgSlug", params: { orgSlug } }} />
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        {org && (
          <section className="surface-card p-5 space-y-3">
            <h2 className="font-heading text-lg font-semibold">Organisasjon</h2>
            <p className="text-sm text-muted-foreground">
              Lim inn denne ID-en i Work → Innstillinger → Platform-kobling når du eksporterer til
              Finance.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Platform org-ID</Label>
              <div className="flex gap-2">
                <Input readOnly value={org.id} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void copyText(org.id, "Org-ID")}
                  aria-label="Kopier org-ID"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>
        )}

        <section className="surface-card p-5">
          <h2 className="font-heading text-lg font-semibold">Medlemmer</h2>
          <p className="mt-1 text-sm text-muted-foreground">Inviter på e-post og administrer roller.</p>

          <ul className="mt-4 divide-y divide-border">
            {members?.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                  {(m.profile?.display_name?.[0] ?? m.email?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.profile?.display_name ?? m.email ?? m.userId.slice(0, 8)}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.email ?? m.userId}
                  </div>
                </div>
                {canEdit ? (
                  <Select value={m.role} onValueChange={(v) => changeRole.mutate({ id: m.id, role: v as Role })}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{m.role}</Badge>
                )}
                {canEdit && m.role !== "owner" && (
                  <Button variant="ghost" size="sm" onClick={() => removeMember.mutate(m.id)}>
                    Fjern
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {canEdit && (
            <div className="mt-4 space-y-2 rounded-xl border border-dashed border-border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserPlus className="h-4 w-4" /> Inviter via e-post
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <div className="space-y-1">
                  <Label className="text-xs">E-post</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="navn@firma.no"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rolle</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as (typeof INVITE_ROLES)[number])}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVITE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => inviteMember.mutate()}
                    disabled={!inviteEmail.trim() || inviteMember.isPending}
                  >
                    {inviteMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Inviter
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Nye brukere får e-postinvitasjon. Eksisterende legges til direkte.
              </p>
            </div>
          )}
        </section>

        <section className="surface-card p-5">
          <h2 className="font-heading text-lg font-semibold">Koblinger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Se hva som er koblet til Finance, Work, Gmail og Slack — og hva som mangler.
          </p>
          <div className="mt-3">
            <Button asChild variant="default" size="sm">
              <a href={`/o/${orgSlug}/connections`}>Åpne koblingsoversikt →</a>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
