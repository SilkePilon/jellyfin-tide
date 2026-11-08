/**
 * While anything scrolls (page or a row), cards must not react to the pointer: content sliding under a still
 * cursor would start a hover animation on every card it passes (flicker + jank). `html.tide-is-scrolling` turns
 * pointer events off on cards until 180 ms after the last scroll event.
 */
export const SCROLL_IDLE_MS = 180;

export function initScrollingState(): () => void {
  const root = document.documentElement;
  let t: ReturnType<typeof setTimeout> | undefined;
  const onScroll = () => {
    if (!root.classList.contains('tide-is-scrolling')) root.classList.add('tide-is-scrolling');
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => { t = undefined; root.classList.remove('tide-is-scrolling'); }, SCROLL_IDLE_MS);
  };
  // scroll does not bubble; capture on document also sees element (row) scrolls.
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => {
    document.removeEventListener('scroll', onScroll, { capture: true });
    if (t !== undefined) clearTimeout(t);
    root.classList.remove('tide-is-scrolling');
  };
}
