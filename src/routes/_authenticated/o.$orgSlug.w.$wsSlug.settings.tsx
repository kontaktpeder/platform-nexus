import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useWs } from "./o.$orgSlug.w.$wsSlug";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/w/$wsSlug/settings")({
  component: ThemeSettings,
});

const HUES = [
  { label: "Indigo",  primary: "oklch(0.55 0.18 260)", secondary: "oklch(0.7 0.12 200)" },
  { label: "Emerald", primary: "oklch(0.6 0.14 155)",  secondary: "oklch(0.7 0.12 180)" },
  { label: "Sunset",  primary: "oklch(0.65 0.19 40)",  secondary: "oklch(0.75 0.14 70)" },
  { label: "Rose",    primary: "oklch(0.62 0.2 15)",   secondary: "oklch(0.7 0.14 340)" },
  { label: "Slate",   primary: "oklch(0.4 0.05 250)",  secondary: "oklch(0.6 0.03 250)" },
];

function ThemeSettings() {
  const { orgSlug, wsSlug } = Route.useParams();
  const { ws, theme, role } = useWs();
  const qc = useQueryClient();
  const canEdit = role === "owner" || role === "admin";

  const [primary, setPrimary] = useState(theme?.primary_color ?? "");
  const [secondary, setSecondary] = useState(theme?.secondary_color ?? "");
  const [radius, setRadius] = useState(theme?.radius ?? "1rem");
  const [heading, setHeading] = useState(theme?.heading_font ?? "Inter");
  const [body, setBody] = useState(theme?.body_font ?? "Inter");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("themes").update({
        primary_color: primary, secondary_color: secondary, radius, heading_font: heading, body_font: body,
      }).eq("workspace_id", ws.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-context", orgSlug, wsSlug] });
      toast.success("Tema oppdatert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyPreset = (p: typeof HUES[number]) => {
    setPrimary(p.primary);
    setSecondary(p.secondary);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <h1 className="font-heading text-2xl font-bold">Innstillinger</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tema for arbeidsflaten. Modulene arver automatisk.</p>

      <section className="surface-card mt-6 space-y-4 p-5">
        <h2 className="font-heading text-lg font-semibold">Palett</h2>
        <div className="flex flex-wrap gap-2">
          {HUES.map((h) => (
            <button
              key={h.label}
              disabled={!canEdit}
              onClick={() => applyPreset(h)}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              <span className="h-4 w-4 rounded-full" style={{ background: h.primary }} />
              {h.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Primærfarge (oklch)</Label>
            <Input value={primary} onChange={(e) => setPrimary(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Sekundærfarge</Label>
            <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Radius</Label>
            <Input value={radius} onChange={(e) => setRadius(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Overskriftsfont</Label>
            <Input value={heading} onChange={(e) => setHeading(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Brødtekstfont</Label>
            <Input value={body} onChange={(e) => setBody(e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={!canEdit || save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Lagre tema
        </Button>
      </section>
    </main>
  );
}
