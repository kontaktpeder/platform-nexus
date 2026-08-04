/** Day-atmosphere for NEXUS OS — living gradient that follows the clock. */

export type DayPhase =
  | "night"
  | "dawn"
  | "morning"
  | "midday"
  | "afternoon"
  | "evening";

export type DayAtmosphere = {
  phase: DayPhase;
  label: string;
  /** Soft multi-stop gradient for the OS content canvas */
  gradient: string;
  blobA: string;
  blobB: string;
  blobC: string;
  /** Accent wash for hero cards */
  hero: string;
  glow: string;
};

const PHASES: Record<DayPhase, Omit<DayAtmosphere, "phase">> = {
  night: {
    label: "Natt",
    gradient:
      "radial-gradient(120% 80% at 10% 0%, oklch(0.42 0.08 280 / 0.55) 0%, transparent 55%), radial-gradient(90% 70% at 90% 20%, oklch(0.38 0.07 230 / 0.45) 0%, transparent 50%), linear-gradient(165deg, oklch(0.22 0.04 260) 0%, oklch(0.28 0.05 250) 45%, oklch(0.32 0.04 280) 100%)",
    blobA: "oklch(0.55 0.14 280 / 0.35)",
    blobB: "oklch(0.48 0.12 230 / 0.3)",
    blobC: "oklch(0.42 0.1 320 / 0.25)",
    hero: "linear-gradient(135deg, oklch(0.35 0.08 260) 0%, oklch(0.42 0.1 280) 50%, oklch(0.38 0.08 230) 100%)",
    glow: "oklch(0.55 0.12 280 / 0.25)",
  },
  dawn: {
    label: "Gryning",
    gradient:
      "radial-gradient(100% 80% at 15% 10%, oklch(0.82 0.1 55 / 0.7) 0%, transparent 50%), radial-gradient(80% 60% at 85% 30%, oklch(0.78 0.12 25 / 0.45) 0%, transparent 55%), linear-gradient(160deg, oklch(0.88 0.06 40) 0%, oklch(0.9 0.05 85) 40%, oklch(0.86 0.07 220) 100%)",
    blobA: "oklch(0.78 0.14 45 / 0.45)",
    blobB: "oklch(0.72 0.14 25 / 0.35)",
    blobC: "oklch(0.75 0.08 220 / 0.3)",
    hero: "linear-gradient(135deg, oklch(0.55 0.1 30) 0%, oklch(0.62 0.12 45) 45%, oklch(0.58 0.08 200) 100%)",
    glow: "oklch(0.75 0.12 45 / 0.35)",
  },
  morning: {
    label: "Morgen",
    gradient:
      "radial-gradient(110% 90% at 0% 0%, oklch(0.92 0.08 85 / 0.85) 0%, transparent 55%), radial-gradient(90% 70% at 100% 10%, oklch(0.88 0.1 200 / 0.5) 0%, transparent 50%), radial-gradient(70% 50% at 50% 100%, oklch(0.9 0.08 150 / 0.35) 0%, transparent 55%), linear-gradient(155deg, oklch(0.95 0.04 90) 0%, oklch(0.93 0.04 200) 55%, oklch(0.94 0.03 85) 100%)",
    blobA: "oklch(0.88 0.12 85 / 0.5)",
    blobB: "oklch(0.82 0.1 200 / 0.4)",
    blobC: "oklch(0.85 0.1 150 / 0.35)",
    hero: "linear-gradient(135deg, oklch(0.48 0.08 210) 0%, oklch(0.55 0.1 180) 50%, oklch(0.7 0.1 85) 100%)",
    glow: "oklch(0.8 0.1 85 / 0.4)",
  },
  midday: {
    label: "Formiddag",
    gradient:
      "radial-gradient(100% 80% at 20% 0%, oklch(0.94 0.06 95 / 0.7) 0%, transparent 50%), radial-gradient(90% 70% at 90% 40%, oklch(0.9 0.08 195 / 0.45) 0%, transparent 55%), radial-gradient(60% 50% at 40% 90%, oklch(0.92 0.07 145 / 0.4) 0%, transparent 50%), linear-gradient(150deg, oklch(0.97 0.03 95) 0%, oklch(0.95 0.04 180) 50%, oklch(0.96 0.03 120) 100%)",
    blobA: "oklch(0.9 0.1 95 / 0.45)",
    blobB: "oklch(0.85 0.1 195 / 0.4)",
    blobC: "oklch(0.88 0.09 145 / 0.35)",
    hero: "linear-gradient(135deg, oklch(0.45 0.09 200) 0%, oklch(0.55 0.1 170) 55%, oklch(0.72 0.1 90) 100%)",
    glow: "oklch(0.85 0.1 195 / 0.35)",
  },
  afternoon: {
    label: "Ettermiddag",
    gradient:
      "radial-gradient(100% 80% at 10% 20%, oklch(0.9 0.08 70 / 0.55) 0%, transparent 50%), radial-gradient(90% 70% at 95% 15%, oklch(0.82 0.1 35 / 0.45) 0%, transparent 55%), radial-gradient(70% 55% at 60% 100%, oklch(0.78 0.08 250 / 0.3) 0%, transparent 50%), linear-gradient(155deg, oklch(0.94 0.04 75) 0%, oklch(0.9 0.05 40) 45%, oklch(0.88 0.05 250) 100%)",
    blobA: "oklch(0.82 0.12 55 / 0.45)",
    blobB: "oklch(0.75 0.12 30 / 0.4)",
    blobC: "oklch(0.72 0.08 250 / 0.3)",
    hero: "linear-gradient(135deg, oklch(0.48 0.1 35) 0%, oklch(0.55 0.1 55) 40%, oklch(0.45 0.08 220) 100%)",
    glow: "oklch(0.78 0.12 45 / 0.35)",
  },
  evening: {
    label: "Kveld",
    gradient:
      "radial-gradient(110% 90% at 5% 0%, oklch(0.55 0.12 30 / 0.55) 0%, transparent 50%), radial-gradient(90% 70% at 100% 20%, oklch(0.45 0.12 300 / 0.5) 0%, transparent 55%), radial-gradient(70% 50% at 40% 100%, oklch(0.4 0.1 260 / 0.4) 0%, transparent 50%), linear-gradient(165deg, oklch(0.42 0.08 35) 0%, oklch(0.35 0.08 300) 50%, oklch(0.3 0.06 260) 100%)",
    blobA: "oklch(0.62 0.14 30 / 0.4)",
    blobB: "oklch(0.55 0.14 300 / 0.4)",
    blobC: "oklch(0.48 0.1 260 / 0.35)",
    hero: "linear-gradient(135deg, oklch(0.4 0.1 30) 0%, oklch(0.38 0.12 300) 50%, oklch(0.35 0.08 260) 100%)",
    glow: "oklch(0.55 0.14 300 / 0.3)",
  },
};

/** Map local hour (0–23) to a day phase. */
export function getDayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

export function getDayAtmosphere(date = new Date()): DayAtmosphere {
  const phase = getDayPhase(date.getHours());
  return { phase, ...PHASES[phase] };
}

export function isDarkPhase(phase: DayPhase): boolean {
  return phase === "night" || phase === "evening";
}
