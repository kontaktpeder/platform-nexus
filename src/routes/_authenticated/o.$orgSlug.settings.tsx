import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/platform/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/settings")({
  component: OrgSettings,
});

const ROLES = ["owner", "admin", "editor", "viewer"] as const;
type Role = typeof ROLES[number];

function OrgSettings() {
  const { orgSlug } = Route.useParams();
  const qc = useQueryClient();

  const { data: org } = useQuery({
    queryKey: ["org", orgSlug],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id, name, slug").eq("slug", orgSlug).maybeSingle();
      if (error) throw error;
      return data!;
    },
  });

  const { data: members } = useQuery({
    enabled: !!org,
    queryKey: ["members", org?.id],
    queryFn: async () => {
      const { data: mem, error } = await supabase
        .from("memberships")
        .select("id, user_id, role")
        .eq("org_id", org!.id);
      if (error) throw error;
      const ids = mem.map((m) => m.user_id);
      if (ids.length === 0) return [] as Array<typeof mem[number] & { profile: { display_name: string | null; avatar_url: string | null } | null }>;
      const { data: profs } = await supabase
        .from("profiles").select("id, display_name, avatar_url").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return mem.map((m) => ({ ...m, profile: map.get(m.user_id) ?? null }));
    },
  });

  const { data: myRole } = useQuery({
    enabled: !!org,
    queryKey: ["my-role", org?.id],
    queryFn: async () => {
      const { data } = await supabase.from("memberships").select("role").eq("org_id", org!.id).maybeSingle();
      return data?.role as Role | undefined;
    },
  });
  const canEdit = myRole === "owner" || myRole === "admin";

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      const { error } = await supabase.from("memberships").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members", org?.id] }); toast.success("Rolle oppdatert"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("memberships").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members", org?.id] }); toast.success("Medlem fjernet"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const addMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("memberships").insert({ org_id: org!.id, user_id: inviteUserId, role: inviteRole });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members", org?.id] }); setInviteUserId(""); toast.success("Medlem lagt til"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Innstillinger" subtitle={org?.name} back={{ to: "/o/$orgSlug", params: { orgSlug } }} />
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <section className="surface-card p-5">
          <h2 className="font-heading text-lg font-semibold">Medlemmer</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enkel rolleadministrasjon. Full invite-flyt kommer senere.</p>

          <ul className="mt-4 divide-y divide-border">
            {members?.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                  {(m.profile?.display_name?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.profile?.display_name ?? m.user_id.slice(0, 8)}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.user_id}</div>
                </div>
                {canEdit ? (
                  <Select value={m.role} onValueChange={(v) => changeRole.mutate({ id: m.id, role: v as Role })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{m.role}</Badge>
                )}
                {canEdit && m.role !== "owner" && (
                  <Button variant="ghost" size="sm" onClick={() => removeMember.mutate(m.id)}>Fjern</Button>
                )}
              </li>
            ))}
          </ul>

          {canEdit && (
            <div className="mt-4 space-y-2 rounded-xl border border-dashed border-border p-3">
              <div className="flex items-center gap-2 text-sm font-medium"><UserPlus className="h-4 w-4" /> Legg til medlem</div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <div className="space-y-1">
                  <Label className="text-xs">Bruker-ID</Label>
                  <Input value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)} placeholder="uuid" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rolle</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={() => addMember.mutate()} disabled={!inviteUserId.trim() || addMember.isPending}>
                    {addMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Legg til
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Brukeren må ha registrert seg først. Kopier ID-en fra profilen deres.</p>
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
