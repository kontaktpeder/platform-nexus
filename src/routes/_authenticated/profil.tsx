import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Camera,
  ChevronRight,
  Inbox,
  LogOut,
  MapPin,
  Settings,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { GlobalTopBar } from "@/components/platform/GlobalTopBar";
import { MailSignaturesManager } from "@/components/platform/mail/MailSignaturesManager";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { gravatarUrl } from "@/lib/relation/avatar-url";
import { avatarFallbackStyle, initialsFromName } from "@/lib/relation/avatar-color";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({ meta: [{ title: "Profil — Nexus" }] }),
  component: ProfilPage,
});

function displayNameFromUser(user: NonNullable<ReturnType<typeof useAuth>["user"]>): string {
  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const cand = (md.full_name as string) || (md.name as string) || (md.display_name as string) || "";
  if (cand.trim()) return cand.trim();
  return user.email?.split("@")[0] ?? "Deg";
}

function ProfilPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    setIsStandalone(standalone);
  }, []);

  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const md = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const metaAvatar = typeof md.avatar_url === "string" ? md.avatar_url : null;
  const displayName =
    profileQ.data?.display_name?.trim() || (user ? displayNameFromUser(user) : "Deg");
  const avatarUrl =
    profileQ.data?.avatar_url || metaAvatar || (user?.email ? gravatarUrl(user.email, 160) : null);
  const fallbackStyle = avatarFallbackStyle(displayName);

  const saveNameMut = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Ikke innlogget");
      const trimmed = name.trim().slice(0, 80);
      if (!trimmed) throw new Error("Navn kan ikke være tomt");
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: trimmed,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return trimmed;
    },
    onSuccess: async () => {
      toast.success("Navn lagret");
      setEditingName(false);
      await qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const avatarMut = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Ikke innlogget");
      if (!file.type.startsWith("image/")) throw new Error("Velg et bilde");
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/avatar.${ext}`;
      await supabase.storage.from("avatars").remove([path]);
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatar_url = `${pub.publicUrl}?t=${Date.now()}`;
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: displayName,
        avatar_url,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return avatar_url;
    },
    onSuccess: async () => {
      toast.success("Avatar oppdatert");
      await qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
    onError: (e: Error) => {
      const msg = e.message.toLowerCase();
      if (msg.includes("bucket") || msg.includes("not found") || msg.includes("row-level")) {
        toast.error("Avatar-lagring er ikke satt opp ennå", {
          description: "Viser Google/Gravatar inntil videre",
        });
        return;
      }
      toast.error(e.message);
    },
  });

  async function signOut() {
    if (user?.id) sessionStorage.setItem("platform:auth:userIdBefore", user.id);
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    window.location.assign("/auth");
  }

  const links = [
    {
      to: "/mission" as const,
      label: "Mission / varsler",
      hint: "Oppfølginger og brief",
      icon: Sparkles,
    },
    {
      to: "/review" as const,
      label: "Innboks",
      hint: "Forslag å godkjenne",
      icon: Inbox,
    },
    {
      to: "/field" as const,
      label: "Felt (legacy)",
      hint: "Gammel besøkslogg — erstattes av notat",
      icon: MapPin,
    },
    {
      to: "/app" as const,
      label: "Organisasjoner",
      hint: "Workspaces og moduler",
      icon: Building2,
    },
    {
      to: "/settings" as const,
      label: "Innstillinger",
      hint: "Passord og konto",
      icon: Settings,
    },
  ];

  return (
    <PlatformShell>
      <GlobalTopBar title="Profil" subtitle="Deg og Nexus" />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-8 pt-4">
        <section className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="relative">
            <Avatar className="h-24 w-24 text-2xl">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
              <AvatarFallback style={fallbackStyle}>{initialsFromName(displayName)}</AvatarFallback>
            </Avatar>
            <button
              type="button"
              className="absolute -bottom-1 -right-1 grid h-10 w-10 place-items-center rounded-full border border-border bg-background shadow-sm"
              onClick={() => fileRef.current?.click()}
              aria-label="Bytt avatar"
              disabled={avatarMut.isPending}
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) avatarMut.mutate(file);
                e.target.value = "";
              }}
            />
          </div>

          {editingName ? (
            <form
              className="mt-4 flex w-full max-w-xs flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveNameMut.mutate(nameDraft);
              }}
            >
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="h-11 rounded-xl text-center"
                maxLength={80}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="h-10 flex-1 rounded-xl"
                  disabled={saveNameMut.isPending}
                >
                  Lagre
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-xl"
                  onClick={() => setEditingName(false)}
                >
                  Avbryt
                </Button>
              </div>
            </form>
          ) : (
            <>
              <h1 className="mt-4 text-xl font-semibold tracking-tight">{displayName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{user?.email ?? "—"}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 rounded-xl text-xs"
                onClick={() => {
                  setNameDraft(displayName);
                  setEditingName(true);
                }}
              >
                Endre navn
              </Button>
            </>
          )}
        </section>

        <MailSignaturesManager />

        <ul className="mt-4 space-y-2">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm transition-colors hover:bg-muted/40"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block text-xs text-muted-foreground">{item.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>

        <Button
          type="button"
          variant="outline"
          className="mt-6 h-12 w-full gap-2 rounded-xl"
          onClick={() => void signOut()}
        >
          <LogOut className="h-4 w-4" />
          Logg ut
        </Button>

        {!isStandalone && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            For app-modus uten Safari-footer: Del → Legg til på Hjem-skjerm (slett gammelt ikon
            først hvis du hadde et fra før).
          </p>
        )}
      </main>
    </PlatformShell>
  );
}
