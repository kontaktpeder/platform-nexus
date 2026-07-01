import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slug";
import { TopBar } from "@/components/platform/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Mine organisasjoner — Platform Core" }] }),
  component: OrgPicker,
});

function OrgPicker() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug, logo_url")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createOrg = useMutation({
    mutationFn: async (n: string) => {
      const slug = slugify(n) || `org-${Date.now()}`;
      const { data, error } = await supabase
        .from("organizations")
        .insert({ name: n, slug, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orgs"] });
      setOpen(false);
      setName("");
      toast.success("Organisasjon opprettet");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Mine organisasjoner" subtitle="Velg hvor du vil jobbe i dag" />

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-xl font-semibold">Organisasjoner</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Ny</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Ny organisasjon</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Label htmlFor="orgname">Navn</Label>
                <Input id="orgname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gold of Sicily AS" />
              </div>
              <DialogFooter>
                <Button onClick={() => createOrg.mutate(name)} disabled={!name.trim() || createOrg.isPending}>
                  {createOrg.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Opprett
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-3">
            {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : orgs && orgs.length > 0 ? (
          <ul className="grid gap-3">
            {orgs.map((org) => (
              <li key={org.id}>
                <Link
                  to="/o/$orgSlug"
                  params={{ orgSlug: org.slug }}
                  className="surface-card flex items-center gap-4 p-4 transition-all hover:shadow-lift active:scale-[0.99]"
                >
                  <div className="grid h-14 w-14 flex-none place-items-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      <Building2 className="h-6 w-6" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-lg font-semibold">{org.name}</div>
                    <div className="truncate text-sm text-muted-foreground">{org.slug}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="surface-card p-8 text-center">
            <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h3 className="font-heading text-lg font-semibold">Ingen organisasjoner ennå</h3>
            <p className="mt-1 text-sm text-muted-foreground">Opprett den første for å komme i gang.</p>
            <Button className="mt-4" onClick={() => setOpen(true)}>Opprett organisasjon</Button>
          </div>
        )}
      </main>
    </div>
  );
}
