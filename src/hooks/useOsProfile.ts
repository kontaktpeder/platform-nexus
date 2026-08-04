import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { avatarFallbackStyle, initialsFromName } from "@/lib/relation/avatar-color";

function displayNameFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const md = user.user_metadata ?? {};
  const cand =
    (md.full_name as string) ||
    (md.name as string) ||
    (md.display_name as string) ||
    "";
  if (cand.trim()) return cand.trim();
  return user.email?.split("@")[0] ?? "Deg";
}

/** Profile display + avatar for OS chrome (sidebar). */
export function useOsProfile() {
  const { user } = useAuth();

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
    profileQ.data?.display_name?.trim() ||
    (user ? displayNameFromUser(user) : "Deg");
  const avatarUrl = profileQ.data?.avatar_url || metaAvatar || null;
  const fallbackStyle = avatarFallbackStyle(displayName);
  const initials = initialsFromName(displayName);

  return {
    user,
    displayName,
    avatarUrl,
    fallbackStyle,
    initials,
    loading: profileQ.isLoading,
  };
}
