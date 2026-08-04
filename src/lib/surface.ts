/**
 * Platform surfaces — keep capture (mobile) and desk (Mac) isolated.
 *
 * - capture: /hjem — quick CTAs in the field
 * - desk: /desk — NEXUS OS dashboards; signal queue (Topp 3) on Hele livet
 * - desk/fortell: Fortell chat only
 *
 * Share data/functions across surfaces; do not share home/desk UI trees.
 */

export const DESKTOP_BREAKPOINT_PX = 768;

export type PlatformSurface = "capture" | "desk";

export function isDesktopViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`).matches;
}

/** Post-login landing: desktop → desk, mobile → capture Hjem. */
export function getLoginSurfaceTarget(): "/desk" | "/hjem" {
  return isDesktopViewport() ? "/desk" : "/hjem";
}
