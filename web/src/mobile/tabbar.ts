import { h, icon } from '../ui/dom';
import { ROUTES } from '../router/selectors';
import { onLocationChange } from '../router/location';

const STYLE_ID = 'tide-tabbar-style';

let active: (() => void) | null = null;

/** Phone tab bar (shown < 700px). Idempotent; returns a disposer that removes the bar and its listeners. */
export function initTabbar(): () => void {
  if (active) {
    if (document.querySelector('.tide-tabbar')) return active;
    active(); // bar was removed externally: drop stale listeners and rebuild
  }
  const tabs: [string, string, string][] = [['home', 'Home', ROUTES.home], ['movie', 'Movies', ROUTES.movies], ['tv', 'Shows', ROUTES.shows], ['search', 'Search', ROUTES.search]];
  const bar = h('nav', { class: 'tide-tabbar', 'aria-label': 'Main' }, ...tabs.map(([ic, label, href]) =>
    h('a', { href, 'data-href': href }, h('span', { class: 'tide-tab-pill' }, icon(ic)), label)));
  const mark = () => {
    bar.querySelectorAll('a').forEach((a) => a.classList.toggle('on', location.hash.startsWith(a.dataset.href ?? '~')));
    // Out of the way on the player and other full-screen routes.
    const off = /^#\/(video|login|selectserver|queue|nowplaying)/.test(location.hash);
    bar.classList.toggle('off', off);
    document.body.classList.toggle('tide-has-tabbar', !off);
  };
  let last: string | null = null;
  const sync = () => {
    if (location.hash === last) return;
    last = location.hash;
    mark();
  };
  const unsubscribe = onLocationChange(sync);
  sync();
  document.body.append(bar);
  const dispose = () => {
    unsubscribe();
    bar.remove();
    document.body.classList.remove('tide-has-tabbar');
    if (active === dispose) active = null;
  };
  active = dispose;
  if (document.getElementById(STYLE_ID)) return dispose;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body.tide .tide-tabbar { display: none; }
    @media (max-width: 699px) {
      body.tide .tide-tabbar { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 1500; height: calc(64px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); background: var(--tide-s1); border-top: 1px solid var(--tide-line); justify-content: space-around; align-items: center; }
      body.tide .tide-tabbar.off { display: none; }
      body.tide .tide-tabbar a { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; color: var(--tide-di); text-decoration: none; min-width: 64px; min-height: 44px; justify-content: center; }
      body.tide .tide-tabbar a.on { color: #fff; }
      body.tide .tide-tab-pill { padding: 4px 18px; border-radius: 16px; }
      body.tide .tide-tabbar a.on .tide-tab-pill { background: #fff; color: #000; }
      body.tide.tide-has-tabbar { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
    }`;
  document.head.append(style);
  return dispose;
}
