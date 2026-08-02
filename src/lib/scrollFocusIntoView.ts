/**
 * Scroll an element into view inside its nearest scroll container only.
 * Avoids scrolling the page/calendar (double-slide with keyboard).
 */
export function scrollElementIntoContainer(el: HTMLElement, opts?: { footerReserve?: number }) {
  try {
    const parent = findScrollParent(el);
    // Never fall back to document scrollIntoView — that jumps the calendar/page.
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    // Footer CTAs ~56–72px; shell already lifts for keyboard
    const footerReserve = opts?.footerReserve ?? 80;
    const topPad = 12;
    const visibleBottom = parentRect.bottom - footerReserve;

    if (elRect.top < parentRect.top + topPad) {
      parent.scrollTop -= parentRect.top + topPad - elRect.top;
    } else if (elRect.bottom > visibleBottom) {
      parent.scrollTop += elRect.bottom - visibleBottom;
    }
  } catch {
    /* older browsers */
  }
}

/** Focus without jumping the page; optionally nudge scroll after layout. */
export function focusFieldSoftly(el: HTMLElement | null) {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  window.requestAnimationFrame(() => {
    window.setTimeout(() => scrollElementIntoContainer(el), 60);
  });
}

/**
 * Scroll the focused field into view inside its nearest scroll container only.
 * Delayed twice so iOS PWA keyboard + layout settle before measuring.
 */
export function scrollFocusIntoView(e: { currentTarget: HTMLElement }) {
  const el = e.currentTarget;
  window.setTimeout(() => scrollElementIntoContainer(el), 80);
  window.setTimeout(() => scrollElementIntoContainer(el), 280);
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  let fallback: HTMLElement | null = null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      // Prefer a parent that already overflows; otherwise keep as fallback
      // so we still scroll inside the popup once content grows.
      if (node.scrollHeight > node.clientHeight + 1) return node;
      if (!fallback) fallback = node;
    }
    node = node.parentElement;
  }
  return fallback;
}
