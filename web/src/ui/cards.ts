import './cards.css';
import { fmtRuntime, h, icon } from './dom';
import { toggleButton } from './toggle';
import { imageUrl } from '../api/client';
import { openDetails, play, setFavourite } from '../api/actions';
import type { JfItem } from '../types';

export function subLine(item: JfItem): string {
  const parts: string[] = [];
  if (item.ProductionYear) parts.push(String(item.ProductionYear));
  if (item.Genres?.[0]) parts.push(item.Genres[0]);
  if (item.Type === 'Series') {
    const n = item.ChildCount ?? 1;
    parts.push(`${n} season${n === 1 ? '' : 's'}`);
  } else {
    const rt = fmtRuntime(item.RunTimeTicks);
    if (rt) parts.push(rt);
  }
  return parts.join(' · ');
}

export function minutesLeft(item: JfItem): number | null {
  const pos = item.UserData?.PlaybackPositionTicks;
  if (!pos || !item.RunTimeTicks) return null;
  return Math.max(0, Math.round((item.RunTimeTicks - pos) / 6e8));
}

function stop(fn: () => void | Promise<void>): EventListener {
  return (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    void fn();
  };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const RING_LEN = 87.96; // 2πr, r = 14 in a 32×32 viewBox

/** Progress ring (track + arc) around a ▶ icon. Used on cards (resting badge → hover Play) and the hero Resume. */
export function progressRing(percent: number, cls = 'tide-ring'): HTMLElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  for (const [c, extra] of [['tide-ring-track', null], ['tide-ring-arc', percent]] as const) {
    const circle = document.createElementNS(SVGNS, 'circle');
    circle.setAttribute('cx', '16'); circle.setAttribute('cy', '16'); circle.setAttribute('r', '14');
    circle.setAttribute('class', c);
    if (extra !== null) {
      const p = Math.max(0, Math.min(100, extra));
      circle.setAttribute('stroke-dasharray', String(RING_LEN));
      circle.setAttribute('stroke-dashoffset', (RING_LEN * (1 - p / 100)).toFixed(2));
    }
    svg.append(circle);
  }
  return h('span', { class: cls }, svg as unknown as Node, icon('play_arrow'));
}

/** "★ 8.2 · 2022 · Action · 2h 10m" (movie/series) or "S1 · E6 · Name · 30m left" (episode). */
export function hoverLine(item: JfItem): string {
  const left = minutesLeft(item);
  const parts: string[] = [];
  if (item.Type === 'Episode') {
    parts.push(`S${item.ParentIndexNumber ?? 0} · E${item.IndexNumber ?? 0}`, item.Name);
  } else {
    if (item.CommunityRating) parts.push(`\u2605 ${item.CommunityRating.toFixed(1)}`);
    parts.push(subLine(item));
  }
  if (left !== null && (item.UserData?.PlaybackPositionTicks ?? 0) > 0) parts.push(`${left}m left`);
  return parts.filter(Boolean).join(' · ');
}

/**
 * Home v2 card: large 16:9 artwork with the logo, no text under it. Hover / focus / long-press reveals title,
 * details and actions. Items with a resume position show a progress ring that turns into the Play button.
 */
export function episodeSub(item: JfItem): string {
  const rt = fmtRuntime(item.RunTimeTicks);
  const left = minutesLeft(item);
  const extra = item.UserData?.Played ? 'Watched' : left !== null && (item.UserData?.PlaybackPositionTicks ?? 0) > 0 ? `${left}m left` : null;
  return [rt, extra].filter(Boolean).join(' · ');
}

export interface WideCardOpts { episode?: { tag: string | null; synopsis?: boolean } }

export function wideCard(item: JfItem, opts: WideCardOpts = {}): HTMLElement {
  const epMode = !!opts.episode;
  const isEp = item.Type === 'Episode' && !!item.SeriesId;
  const logoId = isEp ? (item.SeriesId as string) : item.Id;
  const title = epMode ? `${item.IndexNumber ?? 0}. ${item.Name}` : isEp ? item.SeriesName ?? item.Name : item.Name;
  const ud = { ...item.UserData };
  const pct = !ud.Played && (ud.PlaybackPositionTicks ?? 0) > 0 ? Math.round(ud.PlayedPercentage ?? ((ud.PlaybackPositionTicks ?? 0) / (item.RunTimeTicks || 1)) * 100) : 0;

  const art = h('img', { class: 'tide-wide-art', alt: '', loading: 'lazy', decoding: 'async',
    src: isEp ? imageUrl(item.Id, 'Primary', 720) : imageUrl(item.Id, 'Backdrop/0', 720) }) as HTMLImageElement;
  art.onerror = () => {
    // Items without a backdrop fall back to their primary image once (episodes: to the series backdrop).
    if (art.dataset.fallback) { art.remove(); return; }
    art.dataset.fallback = '1';
    art.src = imageUrl(isEp ? (item.SeriesId as string) : item.Id, isEp ? 'Backdrop/0' : 'Primary', 720);
  };
  let rest: HTMLElement;
  if (epMode) {
    rest = h('span', { class: 'tide-wide-ep' },
      h('span', { class: 'tide-wide-ep-k' }, item.ParentIndexNumber === 0 ? 'SPECIAL' : `EPISODE ${item.IndexNumber ?? 0}`),
      h('span', { class: 'tide-wide-ep-n' }, item.Name));
  } else {
    const textLogo = () => h('span', { class: 'tide-wide-logo tide-wide-logo-text' }, title);
    rest = h('img', { class: 'tide-wide-logo', src: imageUrl(logoId, 'Logo', 360), alt: title, loading: 'lazy', decoding: 'async' });
    (rest as HTMLImageElement).onerror = () => rest.replaceWith(textLogo());
  }

  const fav = toggleButton({ icon: 'favorite', label: 'Favourite', on: !!ud.IsFavorite, cls: 'tide-fav-toggle tide-wide-btn',
    save: (on) => setFavourite(item.Id, on), onChange: (on) => { ud.IsFavorite = on; } });
  const playBtn = pct
    ? progressRing(pct, 'tide-ring tide-wide-ring')
    : h('span', { class: 'tide-wide-play tide-wide-btn' }, icon('play_arrow'));
  playBtn.setAttribute('role', 'button');
  playBtn.setAttribute('tabindex', '-1');
  playBtn.setAttribute('aria-label', pct ? `Resume ${title}` : `Play ${title}`);
  playBtn.addEventListener('click', stop(() => play(item.Id)));

  const card: HTMLElement = h('a', {
    class: `tide-card tide-wide${pct ? ' tide-wide-progress' : ''}${epMode ? ' tide-wide-epmode' : ''}`, href: '#', 'data-id': item.Id, 'aria-label': title,
    onclick: (e: Event) => {
      e.preventDefault();
      if (card.dataset.tideLongpress) { delete card.dataset.tideLongpress; return; }
      if (card.closest('[data-tide-dragged]')) return; // a drag-to-scroll just ended on this card
      if (epMode) void play(item.Id);
      else void openDetails(item.Id);
    },
  },
    h('span', { class: 'tide-card-shadow', 'aria-hidden': 'true' }),
    art, rest,
    epMode && opts.episode?.tag ? h('span', { class: 'tide-wide-tag' }, opts.episode.tag) : null,
    epMode && ud.Played ? h('span', { class: 'tide-wide-done', 'aria-label': 'Watched' }, icon('check')) : null,
    h('span', { class: 'tide-wide-info' },
      h('span', { class: 'tide-wide-title' }, title),
      h('span', { class: 'tide-wide-sub' }, epMode ? episodeSub(item) : hoverLine(item)),
      epMode && item.Overview && opts.episode?.synopsis !== false ? h('span', { class: 'tide-wide-syn' }, item.Overview) : null),
    h('span', { class: 'tide-wide-acts' }, playBtn, fav));
  attachLongPress(card);
  return card;
}

export function squareCard(item: JfItem, round = false): HTMLElement {
  const img = h('div', { class: `tide-sq-img${round ? ' tide-round' : ''}` });
  img.style.backgroundImage = `url("${imageUrl(item.Id, 'Primary', 400)}")`;
  return h('a', { class: 'tide-card tide-card-sq', href: '#', 'data-id': item.Id, onclick: stop(() => openDetails(item.Id)) },
    img,
    h('div', { class: 'tide-card-title' }, item.Name),
    h('div', { class: 'tide-card-sub' }, item.AlbumArtist ?? (item.ProductionYear ? String(item.ProductionYear) : '')));
}

/** Phone: long-press (500 ms) toggles the hover layer instead of opening. */
function attachLongPress(card: HTMLElement): void {
  let t: ReturnType<typeof setTimeout> | undefined;
  card.addEventListener('touchstart', () => {
    delete card.dataset.tideLongpress;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      document.querySelectorAll('.tide-card.tide-pressed').forEach((c) => c !== card && c.classList.remove('tide-pressed'));
      card.classList.toggle('tide-pressed');
      card.dataset.tideLongpress = '1';
      t = undefined;
    }, 500);
  }, { passive: true });
  const cancel = () => { if (t) { clearTimeout(t); t = undefined; } };
  card.addEventListener('touchend', cancel);
  card.addEventListener('touchcancel', cancel);
  card.addEventListener('touchmove', cancel);
  card.addEventListener('contextmenu', (e) => { if (t || card.dataset.tideLongpress) e.preventDefault(); });
}
