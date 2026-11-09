/**
 * While the user scrolls (page or a row), cards must not react to the pointer: content sliding under a still
 * cursor would start a hover animation on every card it passes (flicker + jank). `html.tide-is-scrolling` turns
 * pointer events off on cards until 180 ms after the last scroll event.
 *
 * Only scrolls the user caused count (wheel / touch / keys / pointer, incl. our eased glides that follow them).
 * Layout-driven scrolls (a row re-snapping because a hovered card grew) must not: that would drop the hover,
 * shrink the card, re-snap again and loop (seen as a flickering card at the row edge).
 */
export const SCROLL_IDLE_MS = 180;
/** A scroll counts as user-driven when it happens this soon after input (covers the 650 ms chevron glide). */
export const INPUT_WINDOW_MS = 900;

export function initScrollingState(now: () => number = () => performance.now()): () => void {
  const root = document.documentElement;
  let t: ReturnType<typeof setTimeout> | undefined;
  let lastInput = -Infinity;
  const onInput = () => { lastInput = now(); };
  const onScroll = () => {
    if (now() - lastInput > INPUT_WINDOW_MS) return;
    if (!root.classList.contains('tide-is-scrolling')) root.classList.add('tide-is-scrolling');
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => { t = undefined; root.classList.remove('tide-is-scrolling'); }, SCROLL_IDLE_MS);
  };
  const inputs = ['wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown'] as const;
  inputs.forEach((e) => document.addEventListener(e, onInput, { capture: true, passive: true }));
  // scroll does not bubble; capture on document also sees element (row) scrolls.
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => {
    inputs.forEach((e) => document.removeEventListener(e, onInput, { capture: true }));
    document.removeEventListener('scroll', onScroll, { capture: true });
    if (t !== undefined) clearTimeout(t);
    root.classList.remove('tide-is-scrolling');
  };
}
