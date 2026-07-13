import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Layers, Link2, Loader2, Plus, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slug";
import { TopBar } from "@/components/platform/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const WS_TYPES = [
  { value: "drift", label: "Drift" },
  { value: "produksjon", label: "Produksjon" },
  { value: "nettside", label: "Nettside" },
  { value: "catering", label: "Catering" },
  { value: "studio", label: "Studio" },
  { value: "garage", label: "Bilgarasje" },
  { value: "event", label: "Event" },
  { value: "annet", label: "Annet" },
] as const;

export const Route = createFileRoute("/_authenticated/o/$orgSlug/")({
  component: WorkspacePicker,
});

function WorkspacePicker() {
  const { orgSlug } = Route.useParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsType, setWsType] = useState<typeof WS_TYPES[number]["value"]>("drift");

  const { data: org } = useQuery({
    queryKey: ["org", orgSlug],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id, name, slug").eq("slug", orgSlug).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: workspaces, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["workspaces", org?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, slug, icon, workspace_type")
        .eq("org_id", org!.id)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createWs = useMutation({
    mutationFn: async () => {
      const slug = slugify(wsName) || `ws-${Date.now()}`;
      const { data, error } = await supabase
        .from("workspaces")
        .insert({ org_id: org!.id, name: wsName, slug, workspace_type: wsType })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", org?.id] });
      setOpen(false);
      setWsName("");
      toast.success("Arbeidsflate opprettet");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={org?.name ?? "Laster…"} subtitle="Velg arbeidsflate" back={{ to: "/app" }} />

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-xl font-semibold">Arbeidsflater</h2>
          <div className="flex items-center gap-2">
            <Link to="/o/$orgSlug/connections" params={{ orgSlug }}>
              <Button variant="outline" size="sm" className="gap-2">
                <Link2 className="h-4 w-4" />
                Koblinger
              </Button>
            </Link>
            <Link to="/o/$orgSlug/settings" params={{ orgSlug }}>
              <Button variant="ghost" size="icon" aria-label="Innstillinger">
                <Settings2 className="h-4 w-4" />
              </Button>
            </Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Ny</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Ny arbeidsflate</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="wsname">Navn</Label>
                    <Input id="wsname" value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Drift" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={wsType} onValueChange={(v) => setWsType(v as typeof WS_TYPES[number]["value"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WS_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => createWs.mutate()} disabled={!wsName.trim() || createWs.isPending}>
                    {createWs.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Opprett
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : workspaces && workspaces.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {workspaces.map((ws) => {
              const typeLabel = WS_TYPES.find((t) => t.value === ws.workspace_type)?.label ?? ws.workspace_type;
              return (
                <li key={ws.id}>
                  <Link
                    to="/o/$orgSlug/w/$wsSlug"
                    params={{ orgSlug, wsSlug: ws.slug }}
                    className="surface-card group flex h-full flex-col justify-between gap-3 p-5 transition-all hover:shadow-lift active:scale-[0.99]"
                  >
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-heading text-lg font-semibold">{ws.name}</div>
                      <div className="text-xs text-muted-foreground">{typeLabel}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="surface-card p-8 text-center">
            <Layers className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h3 className="font-heading text-lg font-semibold">Ingen arbeidsflater</h3>
            <p className="mt-1 text-sm text-muted-foreground">Opprett din første arbeidsflate.</p>
            <Button className="mt-4" onClick={() => setOpen(true)}>Opprett arbeidsflate</Button>
          </div>
        )}
      </main>
    </div>
  );
}
