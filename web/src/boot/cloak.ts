import './cloak.css';
import { ROUTES } from '../router/selectors';

/**
 * Cloak: hide the stock Home / details page (and show a quiet spinner) from the moment client.js runs until Tide's own
 * page has mounted, declined or failed. Without it the stock page paints first (while Tide waits for the session,
 * its config, the page host and its data) and then swaps to Tide: a visible flash on every visit.
 *
 * Holds are named (the boot, one per takeover). `html.tide-cloak` is on while any hold is active. Every hold expires
 * on its own after HOLD_MS, so a hung request can never leave the page blank.
 */
export const HOLD_MS = 10_000;
const HINT_KEY = 'tide:takeovers';
const CLASS = 'tide-cloak';

export interface Hint { home: boolean; details: boolean }

const holds = new Map<string, ReturnType<typeof setTimeout>>();
let indicator: HTMLElement | null = null;

function render(): void {
  const on = holds.size > 0;
  document.documentElement.classList.toggle(CLASS, on);
  if (on && !indicator && document.body) {
    indicator = document.createElement('div');
    indicator.className = 'tide-cloak-ind';
    indicator.setAttribute('role', 'progressbar');
    indicator.setAttribute('aria-label', 'Loading');
    document.body.append(indicator);
  }
}

export function hold(id: string, ms = HOLD_MS): void {
  const prev = holds.get(id);
  if (prev !== undefined) clearTimeout(prev);
  holds.set(id, setTimeout(() => release(id), ms));
  render();
}

export function release(id: string): void {
  const t = holds.get(id);
  if (t === undefined) return;
  clearTimeout(t);
  holds.delete(id);
  render();
}

export function releaseAll(): void {
  holds.forEach((t) => clearTimeout(t));
  holds.clear();
  render();
}

export function isCloaked(): boolean {
  return holds.size > 0;
}

/** Which takeovers the last config enabled (unknown on the first ever load: assume on). */
export function readHint(): Hint {
  try {
    const h = JSON.parse(localStorage.getItem(HINT_KEY) ?? 'null') as Partial<Hint> | null;
    return { home: h?.home !== false, details: h?.details !== false };
  } catch {
    return { home: true, details: true };
  }
}

export function saveHint(h: Hint): void {
  try { localStorage.setItem(HINT_KEY, JSON.stringify(h)); } catch { /* storage blocked */ }
}

/** Would Tide take over this route (going by the hint)? */
export function wouldTakeOver(h: Hint, loc: Location = location): boolean {
  return (h.home && ROUTES.isHome(loc)) || (h.details && ROUTES.isDetails(loc));
}

/** Boot hold: from script start until the router has taken over (or Tide stays out of the way). */
export function startBootCloak(): void {
  if (wouldTakeOver(readHint())) hold('boot');
}

/**
 * Start Tide's fonts now (client.css with their @font-face is already loaded): otherwise the browser only requests
 * them once Tide renders text, a full round trip after the content is ready (icons stay blank meanwhile).
 */
export function preloadFonts(): void {
  try {
    const f = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!f?.load) return;
    void f.load('400 24px "Tide Symbols"', 'play_arrow').catch(() => {});
    void f.load('600 16px "Inter Variable"', 'Tide').catch(() => {});
  } catch { /* no font loading API */ }
}
