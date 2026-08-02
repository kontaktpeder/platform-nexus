import { scrollElementIntoContainer } from "@/lib/scrollFocusIntoView";

/**
 * Focus a sheet field early so iOS still treats it as part of the open tap.
 */
export function focusSheetField(el: HTMLElement | null, opts?: { footerReserve?: number }) {
  if (!el) return;

  const focusNow = () => {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  };

  focusNow();

  const reserve = opts?.footerReserve ?? 128;
  window.requestAnimationFrame(() => {
    focusNow();
    scrollElementIntoContainer(el, { footerReserve: reserve });
  });
  window.setTimeout(() => scrollElementIntoContainer(el, { footerReserve: reserve }), 200);
}

/** Blur + hide keyboard so sheet drag isn't gated by a focused field. */
export function blurSheetField() {
  const ae = document.activeElement;
  if (ae instanceof HTMLElement) ae.blur();
}
