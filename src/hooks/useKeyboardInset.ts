import { useEffect, useState } from "react";

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function isEditableFocused(): boolean {
  const ae = document.activeElement;
  if (!ae || ae === document.body) return false;
  return ae.matches(EDITABLE_SELECTOR);
}

/**
 * Keyboard overlap in px (visualViewport). Used by PlatformSheet to lift scroll room.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let focusOutTimerA = 0;
    let focusOutTimerB = 0;

    const setSafe = (value: number) => {
      const next = Math.max(0, Math.round(value));
      if (!cancelled) {
        setInset(next);
        document.documentElement.style.setProperty("--keyboard-inset", `${next}px`);
      }
    };

    const fromVisualViewport = () => {
      const vv = window.visualViewport;
      if (!vv) return 0;
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      return overlap < 48 ? 0 : overlap;
    };

    const syncViewport = () => setSafe(fromVisualViewport());

    const clearIfBlurred = () => {
      if (!isEditableFocused()) setSafe(0);
      else syncViewport();
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", syncViewport);
      vv.addEventListener("scroll", syncViewport);
    }
    window.addEventListener("resize", syncViewport);

    const onFocusOut = () => {
      window.clearTimeout(focusOutTimerA);
      window.clearTimeout(focusOutTimerB);
      focusOutTimerA = window.setTimeout(clearIfBlurred, 120);
      focusOutTimerB = window.setTimeout(clearIfBlurred, 360);
    };

    document.addEventListener("focusout", onFocusOut);
    syncViewport();

    return () => {
      cancelled = true;
      document.documentElement.style.setProperty("--keyboard-inset", "0px");
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      document.removeEventListener("focusout", onFocusOut);
      window.clearTimeout(focusOutTimerA);
      window.clearTimeout(focusOutTimerB);
    };
  }, []);

  return inset;
}
