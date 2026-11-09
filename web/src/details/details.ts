import { getQuality } from '../api/tide';
import { imageUrl } from '../api/client';
import { getEpisodes, getItem, getNextUp, getResumeEpisode, getSeasons, type JfDetail, type JfSource } from '../api/item';
import { h } from '../ui/dom';
import { createAmbient } from '../ui/ambient';
import { backdropOf, chain, heroWidth, sources } from '../ui/images';
import { ROUTES, SELECTORS } from '../router/selectors';
import type { Takeover } from '../router/hook';
import { renderHeader } from './header';
import { renderNextUp } from './nextUp';
import { renderEpisodes } from './episodes';
import { renderCast } from './cast';
import { renderSimilar } from './similar';
import { renderAbout } from './about';
import { chooseNextUp, defaultSeason, epLabel, nextInSeason, sortSeasons } from './logic';
import type { ClientConfig, JfItem, Quality } from '../types';

/** Indirection so tests can observe the Season → series redirect. */
export const nav = { replace: (hash: string) => location.replace(hash) };

export async function mountDetails(host: HTMLElement, _cfg: ClientConfig, loc: Location): Promise<(() => void) | null> {
  const params = ROUTES.detailsParams(loc);
  const id = params?.get('id');
  if (!id) return null;
  // Hide the stock page now, not after the item loads: otherwise it flashes for a moment and then swaps to Tide.
  // Restored below if this item is not one Tide shows (or loading fails).
  const wasTaken = host.classList.contains('tide-taken');
  host.classList.add('tide-taken');
  const release = () => { if (!wasTaken) host.classList.remove('tide-taken'); };
  let item: JfDetail;
  try {
    item = await getItem(id);
  } catch (e) {
    release();
    throw e;
  }
  if (item.Type === 'Season' && item.SeriesId) {
    release();
    const server = params?.get('serverId');
    nav.replace(`#/details?id=${encodeURIComponent(item.SeriesId)}&season=${item.IndexNumber ?? 0}${server ? `&serverId=${encodeURIComponent(server)}` : ''}`);
    return null;
  }
  if (item.Type !== 'Movie' && item.Type !== 'Series' && item.Type !== 'Episode') { release(); return null; }

  const disposers: (() => void)[] = [];
  let disposed = false;
  const ambient = createAmbient();
  ambient.set(item.Id, backdropOf(item, 160));
  const header = renderHeader(item);
  // Same background system as the home hero: a sharp backdrop at the top that dissolves (mask) into the ambient glow.
  const bgImg = h('img', { class: 'tide-dbg-img', alt: '', fetchpriority: 'high' }) as HTMLImageElement;
  const hasBg = chain(bgImg, sources([backdropOf(item, heroWidth()), item.Type === 'Episode' ? item.SeriesId ?? item.Id : item.Id, 'Backdrop/0', heroWidth()]), () => bgImg.remove());
  const bg = h('div', { class: 'tide-dbg', 'aria-hidden': 'true' }, hasBg ? bgImg : null, h('div', { class: 'tide-dbg-shade' }));
  const root = h('div', { class: 'tide-details' }, ambient.el, bg, header.el);
  host.prepend(root);
  document.body.classList.add('tide-on-details');
  // Full-bleed backdrop under the transparent app bar: pull the root up by its natural page offset (as home does).
  const fitTop = () => {
    if (!root.isConnected) return;
    root.style.setProperty('--tide-details-offset', '0px');
    const top = root.getBoundingClientRect().top - document.documentElement.getBoundingClientRect().top;
    root.style.setProperty('--tide-details-offset', `${Math.max(0, Math.round(top))}px`);
  };
  fitTop();
  window.addEventListener('resize', fitTop);

  const cast = renderCast(item.People);
  if (cast) root.append(cast);
  if (item.Type !== 'Episode') {
    const similar = renderSimilar(item.Id);
    disposers.push(similar.dispose);
    root.append(similar.el);
  }

  let quality: Quality | null = null;
  const qualityP = getQuality([item.Id]).then((r) => (quality = r[item.Id] ?? null)).catch(() => null);
  let aboutEl: HTMLElement | null = null;
  const placeAbout = (file: { src: JfSource | undefined; label: string } | null) => {
    if (disposed) return;
    aboutEl?.remove();
    aboutEl = renderAbout(item, file, quality);
    if (aboutEl) root.append(aboutEl);
  };

  void qualityP.then(() => { if (!disposed) header.setQuality(quality); });

  if (item.Type === 'Series') {
    void (async () => {
      try {
        const [resume, nu, seasons] = await Promise.all([
          getResumeEpisode(item.Id).catch(() => null),
          getNextUp(item.Id).catch(() => null),
          getSeasons(item.Id),
        ]);
        if (disposed || !seasons.length) return;
        const next = chooseNextUp(resume, nu);
        const sorted = sortSeasons(seasons);
        const hint = params?.get('season');
        const startIdx = defaultSeason(sorted, hint !== null && hint !== undefined && hint !== '' ? Number(hint) : null, next);
        const firstEps = await getEpisodes(item.Id, sorted[startIdx]!.Id);
        if (disposed) return;
        const target: JfItem | null = next ?? nextInSeason(firstEps, null) ?? firstEps[0] ?? null;
        header.setTarget(target);
        if (next) header.col.append(renderNextUp(next));
        const eps = renderEpisodes(item.Id, sorted, startIdx, next, firstEps);
        disposers.push(eps.dispose);
        header.el.after(eps.el);
        // The episode's file info and the quality badge load in parallel.
        const [full] = await Promise.all([target ? getItem(target.Id).catch(() => null) : Promise.resolve(null), qualityP]);
        placeAbout(target ? { src: full?.MediaSources?.[0], label: `Your file · ${epLabel(target)}` } : null);
      } catch (e) {
        console.warn('[Tide] series sections failed', e);
        header.setTarget(null);
        placeAbout(null);
      }
    })();
  } else if (item.Type === 'Episode' && item.SeriesId && item.SeasonId) {
    void (async () => {
      try {
        const [eps, seasons] = await Promise.all([getEpisodes(item.SeriesId!, item.SeasonId!), getSeasons(item.SeriesId!)]);
        if (disposed) return;
        header.setNextEpisode(eps[eps.findIndex((e) => e.Id === item.Id) + 1] ?? null);
        const sorted = sortSeasons(seasons);
        const idx = Math.max(0, sorted.findIndex((s) => s.Id === item.SeasonId));
        const row = renderEpisodes(item.SeriesId!, sorted, idx, null, eps, { current: { id: item.Id, tag: 'NOW VIEWING' }, heading: 'More from' });
        disposers.push(row.dispose);
        header.el.after(row.el);
      } catch (e) { console.warn('[Tide] episode sections failed', e); }
    })();
    void qualityP.then(() => placeAbout({ src: item.MediaSources?.[0], label: 'Your file' }));
  } else {
    void qualityP.then(() => placeAbout({ src: item.MediaSources?.[0], label: 'Your file' }));
  }

  return () => {
    disposed = true;
    disposers.forEach((d) => d());
    window.removeEventListener('resize', fitTop);
    root.remove();
    host.classList.remove('tide-taken');
    document.body.classList.remove('tide-on-details');
  };
}

export const DETAILS_TAKEOVER: Takeover = {
  id: 'details',
  rootClass: 'tide-details',
  cloak: true,
  matches: (cfg, loc) => cfg.enableDetails !== false && ROUTES.isDetails(loc),
  key: (loc) => ROUTES.detailsParams(loc)?.get('id') ?? '',
  findHost: () => document.querySelector<HTMLElement>(SELECTORS.detailsHost),
  mount: mountDetails,
};
