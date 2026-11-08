import './home.css';
import { api, getSession } from '../api/client';
import { getHome, putPrefs } from '../api/tide';
import { h, icon } from '../ui/dom';
import { createHero } from './hero';
import { openEditPanel } from './editPanel';
import { SELECTORS } from '../router/selectors';
import { pickGenres, renderRow, ROWS, visibleRows } from './rows';
import type { RowContext } from './rows';
import type { ClientConfig, HomeResponse, JfItem, UserPrefs } from '../types';
import { defaultPrefs } from '../types';

function toast(message: string): void {
  document.querySelector('.tide-home-toast')?.remove();
  const t = h('div', { class: 'tide-home-toast', role: 'status' }, message);
  t.onclick = () => t.remove();
  document.body.append(t);
  setTimeout(() => t.remove(), 6000);
}

export async function mountHome(host: HTMLElement, cfg: ClientConfig): Promise<() => void> {
  /** Stock children we hid, with their original `hidden` state so unmount restores exactly. */
  const stock = new Map<HTMLElement, boolean>();
  const hide = (el: Element) => {
    if (!(el instanceof HTMLElement) || el.classList.contains('tide-home') || stock.has(el)) return;
    stock.set(el, el.hidden);
    el.hidden = true;
  };
  [...host.children].forEach(hide);
  // React / legacy home code may (re)render children after we hid them: keep them hidden while mounted.
  const childObs = new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => hide(n as Element))));
  childObs.observe(host, { childList: true });
  document.body.classList.add('tide-on-home');
  const root = h('div', { class: 'tide-home' });
  host.prepend(root);
  // Full-bleed hero: jellyfin-web offsets the page below the fixed app bar (a spacer before `main`), so pull our
  // root back up to the document top and let the transparent app bar sit on the hero image. The offset is the
  // root's natural top relative to the document (scroll-independent), measured with our margin reset.
  const fitTop = (): number => {
    if (!root.isConnected) return -1;
    root.style.setProperty('--tide-home-offset', '0px');
    const top = root.getBoundingClientRect().top - document.documentElement.getBoundingClientRect().top;
    const px = Math.max(0, Math.round(top));
    root.style.setProperty('--tide-home-offset', `${px}px`);
    // The fixed app bar's height (12.4: 48px desktop, 56px+ phone with safe area): hero overlays sit below it.
    const bar = document.querySelector(SELECTORS.appBar);
    const barH = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
    if (barH > 0) root.style.setProperty('--tide-appbar-h', `${barH}px`);
    return px;
  };
  // Stock layout settles after mount (12.4 phone: section tabs push #indexPage to 86px, then go away). Re-measure
  // each frame until two consecutive reads agree (cap 60 frames).
  let settleFrame = 0;
  const settle = () => {
    cancelAnimationFrame(settleFrame);
    let prev = fitTop();
    let frames = 0;
    const tick = () => {
      const now = fitTop();
      if (now === prev || ++frames >= 60) { settleFrame = 0; return; }
      prev = now;
      settleFrame = requestAnimationFrame(tick);
    };
    settleFrame = requestAnimationFrame(tick);
  };
  // Whatever pushes the page down changes size: the app bar, the host's ancestors and their preceding siblings.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => settle()) : null;
  if (ro) {
    const watched = new Set<Element>();
    const bar = document.querySelector(SELECTORS.appBar);
    if (bar) watched.add(bar);
    for (let el: Element | null = host; el && el !== document.body; el = el.parentElement) {
      watched.add(el);
      for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) watched.add(sib);
    }
    watched.forEach((el) => ro.observe(el));
  }
  window.addEventListener('resize', settle);
  settle();
  let heroApi: ReturnType<typeof createHero> | null = null;
  let rowDisposers: (() => void)[] = [];
  let closePanel: (() => void) | null = null;
  const disposeRows = () => {
    rowDisposers.forEach((d) => d());
    rowDisposers = [];
  };

  const unmount = () => {
    childObs.disconnect();
    window.removeEventListener('resize', settle);
    cancelAnimationFrame(settleFrame);
    ro?.disconnect();
    heroApi?.destroy();
    heroApi = null;
    disposeRows();
    closePanel?.(); // removes the overlay and its document keydown listener
    closePanel = null;
    root.remove();
    stock.forEach((wasHidden, el) => (el.hidden = wasHidden));
    stock.clear();
    document.body.classList.remove('tide-on-home');
  };

  try {
    const userId = getSession()?.userId ?? '';
    let data: HomeResponse | null = null;
    try {
      data = await getHome();
    } catch (e) {
      console.warn('[Tide] /Tide/Home failed, rows only', e);
    }
    const defaults = defaultPrefs(cfg);
    const prefs: UserPrefs = data?.prefs ?? defaults;

    const [genres, recent] = await Promise.all([
      api<{ Items: { Name: string }[] }>('/Genres', { query: { userId, IncludeItemTypes: 'Movie,Series', Recursive: true } }).then((r) => r.Items.map((g) => g.Name)).catch(() => [] as string[]),
      api<{ Items: JfItem[] }>('/Items', { query: { userId, Recursive: true, IncludeItemTypes: 'Movie,Episode', IsPlayed: true, SortBy: 'DatePlayed', SortOrder: 'Descending', Limit: 1 } }).then((r) => r.Items[0] ?? null).catch(() => null),
    ]);

    if (!data) {
      const first = await api<{ Items: JfItem[] }>('/UserItems/Resume', { query: { userId, Limit: 1, MediaTypes: 'Video', Fields: 'Genres,Overview' } })
        .then((r) => r.Items[0] ?? null).catch(() => null);
      if (first) {
        data = {
          prefs, config: cfg,
          hero: [{
            id: first.SeriesId ?? first.Id, type: first.SeriesId ? 'Series' : 'Movie', reason: 'resume',
            name: first.SeriesName ?? first.Name, year: first.ProductionYear, genres: first.Genres ?? [], overview: first.Overview ?? '',
            hasLogo: true, hasThumb: false, isFavorite: !first.SeriesId && !!first.UserData?.IsFavorite, youtube: [], playTargetId: first.Id,
          }],
        };
      }
    }

    const build = (p: UserPrefs): void => {
      heroApi?.destroy();
      heroApi = null;
      disposeRows();
      root.replaceChildren();
      if (data?.hero.length) {
        heroApi = createHero(data.hero, cfg);
        root.append(heroApi.el);
      } else {
        root.append(h('div', { class: 'tide-hero-spacer' }));
      }
      const ctx: RowContext = { userId, prefs: p, newDays: cfg.newDays, genres, becauseOf: recent, picked: pickGenres(p, genres) };
      for (const id of visibleRows(p)) {
        const row = renderRow(ROWS[id], ctx);
        rowDisposers.push(row.dispose);
        root.append(row.el);
      }
      root.append(h('div', { class: 'tide-edit-home' },
        h('button', { class: 'tide-btn', onclick: () => {
          closePanel = openEditPanel(p, genres, async (np) => {
            try { build(await putPrefs(np)); } catch (e) {
              console.warn('[Tide] save prefs failed', e);
              toast('Couldn\u2019t save \u2014 try again');
            }
          }, defaults);
        } }, icon('tune'), 'Edit home')));
    };

    build(prefs);
    settle();
  } catch (e) {
    unmount(); // never leave the page blank
    throw e;
  }

  return unmount;
}
