/** Soft avatar hue from a name — stable, not random per render. */

const HUES = [260, 200, 160, 30, 340, 280, 220, 140] as const;

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarHueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 1000;
  return HUES[h % HUES.length];
}

export function avatarFallbackStyle(name: string): { backgroundColor: string; color: string } {
  const hue = avatarHueFromName(name);
  return {
    backgroundColor: `oklch(0.92 0.04 ${hue})`,
    color: `oklch(0.35 0.08 ${hue})`,
  };
}
