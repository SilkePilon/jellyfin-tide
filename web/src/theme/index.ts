import '@fontsource-variable/inter';
import './tokens.css';
import './global.css';
import { onLocationChange } from '../router/location';
import { SELECTORS } from '../router/selectors';
import { labelNavLinks, measureUserBox } from './navbar';
import type { ClientConfig } from '../types';

export function updateScrolled(y: number): void {
  document.body.classList.toggle('tide-scrolled', y > 80);
}

function parseHash(hash: string): { path: string; params: URLSearchParams } {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  return { path: path.replace(/\/$/, '') || '/', params: new URLSearchParams(query) };
}

/**
 * Whether an app-bar link points at the current page. Libraries match on path + `topParentId` (any tab inside the
 * library); a link that names a `tab` must match it (Favourites is `#/home?tab=1`, not active on plain home).
 */
export function navMatches(href: string, hash: string): boolean {
  if (!href.startsWith('#/')) return false;
  const a = parseHash(href);
  const b = parseHash(hash);
  if (a.path === '/' || a.path !== b.path) return false;
  const tab = a.params.get('tab');
  if (tab !== null ? tab !== b.params.get('tab') : a.path === '/home' && b.params.has('tab')) return false;
  const lib = a.params.get('topParentId');
  return !lib || lib === b.params.get('topParentId');
}

/**
 * N1 pills: stock 12.4 never marks the current library in the app bar, so set `aria-current="page"` on the matching
 * link ourselves (styled as the white pill). Re-applied on route changes and app-bar re-renders.
 */
export function markActiveNav(hash: string = location.hash): void {
  document.querySelectorAll<HTMLAnchorElement>(`${SELECTORS.appBar} a.MuiButton-root[href]`).forEach((a) => {
    const on = navMatches(a.getAttribute('href') ?? '', hash);
    if (on && a.getAttribute('aria-current') !== 'page') a.setAttribute('aria-current', 'page');
    else if (!on && a.hasAttribute('aria-current')) a.removeAttribute('aria-current');
  });
}

export function initTheme(cfg: ClientConfig): void {
  if (!cfg.enableTheme) return;
  document.body.classList.add('tide-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', '#000000');
  window.addEventListener('scroll', () => updateScrolled(window.scrollY), { passive: true });
  updateScrolled(window.scrollY);
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; markActiveNav(); labelNavLinks(); measureUserBox(); });
  };
  onLocationChange(queue);
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  markActiveNav();
  labelNavLinks();
  measureUserBox();
  window.addEventListener('resize', queue);
}
