/**
 * Home's scroll position per history entry. jellyfin-web restores scroll before Tide's Home has its full height, so
 * Back from a details page landed halfway up the page. React Router gives every history entry its own `state.key`:
 * Back returns to the same entry (restore), a fresh visit is a new entry (start at the top).
 */
const positions = new Map<string, number>();
const MAX = 50;

export function entryKey(): string | null {
  const s = history.state as { key?: unknown; idx?: unknown } | null;
  const k = s?.key ?? s?.idx;
  return k === undefined || k === null ? null : String(k);
}

/**
 * Snapshot Home's scroll position at every user input while Home is mounted (the input that leaves the page is the
 * last one). Not on scroll events: jellyfin-web scrolls to the top *before* the route changes, which would overwrite
 * the position. Returns the stop function.
 */
export function trackHomeScroll(isHome: () => boolean): () => void {
  const save = () => {
    const k = entryKey();
    if (k === null || !isHome()) return;
    positions.delete(k);
    positions.set(k, window.scrollY);
    if (positions.size > MAX) positions.delete(positions.keys().next().value as string);
  };
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  events.forEach((e) => window.addEventListener(e, save, { capture: true, passive: true }));
  return () => events.forEach((e) => window.removeEventListener(e, save, { capture: true }));
}

export function savedHomeScroll(): number | null {
  const k = entryKey();
  return k === null ? null : positions.get(k) ?? null;
}

/** Jump (no smooth scroll) to `y`, and hold it for a few frames against late restores, unless the user scrolls. */
export function restoreScroll(y: number, frames = 20): void {
  const root = document.documentElement;
  let n = 0;
  let userMoved = false;
  const stopUser = () => { userMoved = true; };
  const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
  inputs.forEach((e) => window.addEventListener(e, stopUser, { passive: true, once: true }));
  const jump = () => {
    if (userMoved) return;
    if (Math.abs(window.scrollY - y) > 1) {
      const prev = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, y);
      root.style.scrollBehavior = prev;
    }
    if (++n < frames) requestAnimationFrame(jump);
    else inputs.forEach((e) => window.removeEventListener(e, stopUser));
  };
  jump();
}
