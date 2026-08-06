/**
 * Platform surfaces.
 *
 * - desk: /desk — NEXUS OS (primary on all viewports)
 * - fortell: /desk/fortell — ChatGPT-style chat (persisted thread, full-bleed)
 * - capture: /hjem — quick field CTAs (Fang), reachable from OS dock
 *
 * Share data/functions across surfaces; do not share home/desk UI trees.
 */

export const DESKTOP_BREAKPOINT_PX = 768;

export type PlatformSurface = "capture" | "desk";

export function isDesktopViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`).matches;
}

/** Post-login landing — OS desk on phone and desktop. */
export function getLoginSurfaceTarget(): "/desk" {
  return "/desk";
}
