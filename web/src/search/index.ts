import { createSearchDialog, type SearchDialog } from './dialog';
import { onLocationChange } from '../router/location';
import { ROUTES } from '../router/selectors';
import type { ClientConfig } from '../types';

/** The stock app-bar search button is `a[href="#/search"]` in 12.4; `.headerSearchButton` on the legacy header. */
export const SEARCH_LINK = 'a[href="#/search"], .headerSearchButton';
export const isSearchRoute = (hash: string = location.hash): boolean => /^#\/search(\?|$)/.test(hash);
const typing = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');

export function initSearch(cfg: ClientConfig, make: () => SearchDialog = createSearchDialog): () => void {
  if (cfg.enableSearch === false) return () => {};
  let dialog: SearchDialog | null = null;
  const get = () => {
    if (!dialog) { dialog = make(); if (!dialog.el.isConnected) document.body.append(dialog.el); }
    return dialog;
  };
  let lastHash = isSearchRoute() ? '#/home' : location.hash || '#/home';

  // Capture phase on document: runs before React's listeners on the app root, so the route never changes.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.(SEARCH_LINK);
    if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    get().open();
  };
  const onKey = (e: KeyboardEvent) => {
    if (ROUTES.isPlayer() || typing(e.target) || dialog?.isOpen()) return;
    const k = e.key.toLowerCase();
    if ((e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) || (k === 'k' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      get().open();
    }
  };
  /** Someone landed on the stock search page (deep link, phone tab bar...): go back to where they were, open the dialog. */
  const onRoute = () => {
    if (!isSearchRoute()) { lastHash = location.hash || '#/home'; return; }
    location.replace(`${location.pathname}${location.search}${lastHash}`);
    get().open();
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey);
  const stopRoute = onLocationChange(onRoute);
  if (isSearchRoute()) onRoute();
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey);
    stopRoute();
    dialog?.close();
    dialog?.el.remove();
  };
}
