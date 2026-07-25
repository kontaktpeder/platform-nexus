import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2, ChevronRight, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createOrganization } from "@/lib/organization.functions";
import { setLastWorkspace } from "@/lib/last-workspace";
import { WorkspaceResumeCard } from "@/components/platform/WorkspaceResumeCard";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { useResolvedLastWorkspace } from "@/lib/last-workspace.hooks";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Organisasjoner — Platform Core" }] }),
  component: OrgPicker,
});

function OrgPicker() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createOrgFn = useServerFn(createOrganization);
  const lastWs = useResolvedLastWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const {
    data: orgs,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug, logo_url")
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const createOrg = useMutation({
    mutationFn: (n: string) => createOrgFn({ data: { name: n } }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["orgs"] });
      setOpen(false);
      setName("");
      toast.success("Organisasjon opprettet");
      setLastWorkspace(res.org.slug, res.workspace.slug);
      navigate({
        to: "/o/$orgSlug/w/$wsSlug",
        params: { orgSlug: res.org.slug, wsSlug: res.workspace.slug },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <GlobalTopBar title="Organisasjoner" subtitle="Arbeidsområder og moduler" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:py-6 sm:pb-28">
        {lastWs.data && <WorkspaceResumeCard workspace={lastWs.data} />}

        <section aria-labelledby="organisasjoner">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <h2 id="organisasjoner" className="truncate text-lg font-semibold sm:text-xl">
                Organisasjoner
              </h2>
              <p className="text-xs text-muted-foreground">Velg arbeidsområdet du skal jobbe i</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-11 shrink-0 gap-2 rounded-xl px-4">
                  <Plus aria-hidden="true" className="h-4 w-4" /> Ny
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100%-1.5rem)] rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Ny organisasjon</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="orgname">Navn</Label>
                  <Input
                    id="orgname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Gold of Sicily AS"
                    className="h-12"
                  />
                </div>
                <DialogFooter>
                  <Button
                    className="h-12 w-full sm:w-auto"
                    onClick={() => createOrg.mutate(name)}
                    disabled={!name.trim() || createOrg.isPending}
                  >
                    {createOrg.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Opprett
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="grid gap-2.5" aria-label="Laster organisasjoner">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : isError ? (
            <div className="surface-card p-5 text-center">
              <p className="text-sm font-medium">Kunne ikke hente organisasjonene</p>
              <Button variant="outline" className="mt-3 h-11" onClick={() => void refetch()}>
                Prøv igjen
              </Button>
            </div>
          ) : orgs && orgs.length > 0 ? (
            <ul className="grid gap-2.5">
              {orgs.map((org) => (
                <li key={org.id}>
                  <Link
                    to="/o/$orgSlug"
                    params={{ orgSlug: org.slug }}
                    className="surface-card flex min-h-20 items-center gap-3 p-3 transition-colors hover:border-primary/30 active:bg-muted sm:gap-4 sm:p-4"
                  >
                    <div className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-xl gradient-primary text-primary-foreground sm:h-14 sm:w-14">
                      {org.logo_url ? (
                        <img
                          src={org.logo_url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Building2 aria-hidden="true" className="h-5 w-5 sm:h-6 sm:w-6" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold sm:text-lg">{org.name}</div>
                      <div className="truncate text-xs text-muted-foreground sm:text-sm">{org.slug}</div>
                    </div>
                    <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="surface-card p-6 text-center sm:p-8">
              <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Ingen organisasjoner ennå</h3>
              <p className="mt-1 text-sm text-muted-foreground">Opprett den første for å komme i gang.</p>
              <Button className="mt-4 h-11" onClick={() => setOpen(true)}>
                Opprett organisasjon
              </Button>
            </div>
          )}
        </section>
      </main>
      <PlatformBottomNav />
    </div>
  );
}
