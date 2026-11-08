import './cards.css';
import { fmtRuntime, h, icon } from './dom';
import { qualityBadge } from './quality';
import { toggleButton } from './toggle';
import { imageUrl } from '../api/client';
import { openDetails, play, setFavourite, setWatched } from '../api/actions';
import type { JfItem, Quality } from '../types';

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

function isNew(item: JfItem, newDays: number, now: number): boolean {
  if (!item.DateCreated) return false;
  return now - Date.parse(item.DateCreated) <= newDays * 864e5;
}

function corner(item: JfItem): HTMLElement | null {
  const ud = item.UserData ?? {};
  if (item.Type === 'Series' && (ud.UnplayedItemCount ?? 0) > 0) return h('span', { class: 'tide-corner tide-corner-count' }, String(ud.UnplayedItemCount));
  if (ud.Played) return h('span', { class: 'tide-corner tide-corner-done' }, icon('check'));
  if (ud.IsFavorite) return h('span', { class: 'tide-corner tide-corner-fav' }, icon('favorite'));
  return null;
}

function stop(fn: () => void | Promise<void>): EventListener {
  return (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    void fn();
  };
}

export function posterCard(item: JfItem, opts: { quality?: Quality | null; newDays: number; now?: number }): HTMLElement {
  const now = opts.now ?? Date.now();
  const ud = { ...item.UserData };
  const pct = ud.PlayedPercentage && !ud.Played ? Math.round(ud.PlayedPercentage) : 0;
  const badges = h('div', { class: 'tide-poster-badges' },
    isNew(item, opts.newDays, now) ? h('span', { class: 'tide-chip tide-chip-w tide-chip-new' }, 'NEW') : null,
    qualityBadge(opts.quality, false));
  const ratings = h('div', { class: 'tide-poster-ratings' },
    item.CommunityRating ? h('span', { class: 'tide-chip' }, icon('star', 'tide-star'), item.CommunityRating.toFixed(1)) : null,
    item.CriticRating ? h('span', { class: 'tide-chip' }, icon('local_fire_department', 'tide-critic'), `${Math.round(item.CriticRating)}%`) : null);
  const hover = h('div', { class: 'tide-poster-hover' }, ratings,
    h('div', { class: 'tide-poster-actions' },
      h('button', { class: 'tide-ib tide-ib-w', 'aria-label': 'Play', onclick: stop(() => play(item.Id)) }, icon('play_arrow')),
      toggleButton({ icon: 'check', label: 'Mark watched', on: !!ud.Played, save: (on) => setWatched(item.Id, on), onChange: (on) => { ud.Played = on; syncCorner(); } }),
      toggleButton({ icon: 'favorite', label: 'Favourite', on: !!ud.IsFavorite, cls: 'tide-fav-toggle', save: (on) => setFavourite(item.Id, on), onChange: (on) => { ud.IsFavorite = on; syncCorner(); } }),
      h('button', { class: 'tide-ib tide-ib-more', 'aria-label': 'More', onclick: stop(() => openDetails(item.Id)) }, icon('more_horiz'))));
  let cornerEl = corner(item);
  /** Keep the corner badge (watched ✓ / favourite ♥) in step with the toggles. */
  const syncCorner = () => {
    const next = corner({ ...item, UserData: ud });
    if (cornerEl && next) cornerEl.replaceWith(next);
    else if (cornerEl) cornerEl.remove();
    else if (next) badges.after(next);
    cornerEl = next;
  };
  const poster = h('div', { class: 'tide-poster', style: `background-image:url("${imageUrl(item.Id, 'Primary', 500)}")` },
    badges, cornerEl,
    pct ? h('div', { class: 'tide-poster-progress' }, (() => { const i = h('i'); i.style.width = `${pct}%`; return i; })()) : null,
    hover);
  const card: HTMLElement = h('a', { class: 'tide-card tide-card-poster', href: '#', 'data-id': item.Id, onclick: (e: Event) => {
    e.preventDefault();
    if (card.dataset.tideLongpress) { delete card.dataset.tideLongpress; return; }
    void openDetails(item.Id);
  } },
    poster,
    h('div', { class: 'tide-card-title' }, item.Name),
    h('div', { class: 'tide-card-sub' }, subLine(item)));
  attachLongPress(card);
  return card;
}

export function landscapeCard(item: JfItem): HTMLElement {
  const isEp = item.Type === 'Episode' && !!item.SeriesId;
  const img = isEp ? imageUrl(item.Id, 'Primary', 640) : imageUrl(item.Id, 'Backdrop/0', 640);
  const logoId = isEp ? (item.SeriesId as string) : item.Id;
  const pct = Math.round(item.UserData?.PlayedPercentage ?? 0);
  const left = minutesLeft(item);
  const sub = isEp
    ? [`S${item.ParentIndexNumber ?? 0} · E${item.IndexNumber ?? 0}`, item.Name]
    : [item.ProductionYear ? String(item.ProductionYear) : null, fmtRuntime(item.RunTimeTicks)];
  if (left !== null) sub.push(`${left}m left`);
  const logo = h('img', { class: 'tide-land-logo', src: imageUrl(logoId, 'Logo', 300), alt: '' }) as HTMLImageElement;
  logo.onerror = () => logo.remove();
  const bar = h('i');
  bar.style.width = `${pct}%`;
  const imgEl = h('div', { class: 'tide-land-img' }, logo,
    h('div', { class: 'tide-land-play' }, icon('play_arrow')),
    pct ? h('div', { class: 'tide-land-progress' }, bar) : null);
  imgEl.style.backgroundImage = `url("${img}")`;
  return h('a', { class: 'tide-card tide-card-land', href: '#', 'data-id': item.Id, onclick: stop(() => play(item.Id)) },
    imgEl,
    h('div', { class: 'tide-card-title' }, isEp ? item.SeriesName ?? item.Name : item.Name),
    h('div', { class: 'tide-card-sub' }, sub.filter(Boolean).join(' · ')));
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
