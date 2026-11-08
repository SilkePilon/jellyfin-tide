import './details.css';
import { imageUrl } from '../api/client';
import { play, playShuffle, refreshItem, setFavourite, setWatched } from '../api/actions';
import { getLocalTrailerId, isAdmin, type JfDetail } from '../api/item';
import { fmtRuntime, h, icon } from '../ui/dom';
import { minutesLeft, progressRing } from '../ui/cards';
import { toggleButton } from '../ui/toggle';
import { qualityBadge } from '../ui/quality';
import { menuItem, openPopover } from '../ui/popover';
import { openYouTubeModal } from '../ui/trailerModal';
import { epLabel, yearSpan, youtubeId } from './logic';
import type { JfItem, Quality } from '../types';

export interface Header { el: HTMLElement; col: HTMLElement; setTarget(ep: JfItem | null): void; setQuality(q: Quality | null): void }

export function primaryLabel(item: JfDetail, ep: JfItem | null): { text: string; left: string | null; pct: number; target: string } {
  const t = item.Type === 'Series' ? ep : item;
  if (!t) return { text: 'Play', left: null, pct: 0, target: item.Id };
  const pos = t.UserData?.PlaybackPositionTicks ?? 0;
  const pct = pos && !t.UserData?.Played ? Math.round(t.UserData?.PlayedPercentage ?? (pos / (t.RunTimeTicks || 1)) * 100) : 0;
  const suffix = item.Type === 'Series' ? ` ${epLabel(t)}` : '';
  const left = pct ? `${minutesLeft(t) ?? 0}m left` : item.Type === 'Series' ? fmtRuntime(t.RunTimeTicks) : null;
  return { text: `${pct ? 'Resume' : 'Play'}${suffix}`, left, pct, target: t.Id };
}

function metaLine(item: JfDetail): HTMLElement {
  const parts: (Node | null)[] = [
    yearSpan(item) ? h('span', {}, yearSpan(item)) : null,
    item.Genres?.[0] ? h('span', {}, item.Genres[0]) : null,
    item.Type === 'Series'
      ? (item.ChildCount ? h('span', {}, `${item.ChildCount} season${item.ChildCount === 1 ? '' : 's'}`) : null)
      : (fmtRuntime(item.RunTimeTicks) ? h('span', {}, fmtRuntime(item.RunTimeTicks)!) : null),
    item.CommunityRating ? h('span', {}, icon('star', 'tide-star'), ` ${item.CommunityRating.toFixed(1)}`) : null,
    item.Type === 'Movie' && item.CriticRating ? h('span', { class: 'tide-dh-critic' }, h('i', { class: 'tide-dh-dot', 'aria-hidden': 'true' }), ` ${item.CriticRating}%`) : null,
  ];
  const facts = parts.filter((n): n is HTMLElement => !!n);
  const out: Node[] = [];
  facts.forEach((n, i) => { if (i) out.push(h('span', { class: 'tide-hero-dot', 'aria-hidden': 'true' }, '·')); out.push(n); });
  return h('div', { class: 'tide-dh-meta' }, ...out,
    item.OfficialRating ? h('span', { class: 'tide-chip' }, item.OfficialRating) : null,
    h('span', { class: 'tide-dh-q' }));
}

export function renderHeader(item: JfDetail): Header {
  const poster = h('div', { class: 'tide-dh-poster' });
  poster.style.backgroundImage = `url("${imageUrl(item.Id, 'Primary', 700)}")`;
  const titleText = () => h('h1', { class: 'tide-dh-title' }, item.Name);
  const logo: HTMLElement = h('img', { class: 'tide-dh-logo', src: imageUrl(item.Id, 'Logo', 900), alt: item.Name });
  (logo as HTMLImageElement).onerror = () => logo.replaceWith(titleText());

  const desc = h('p', { class: 'tide-dh-desc', tabindex: '0' }, item.Overview ?? '');
  desc.addEventListener('click', () => desc.classList.toggle('open'));

  // Primary: ring + label + dim time (R3, same parts as the hero Resume).
  const primary = h('button', { class: 'tide-btn tide-btn-w tide-btn-lg tide-dh-primary', type: 'button' }) as HTMLButtonElement;
  let target = item.Id;
  primary.addEventListener('click', () => void play(target));
  const paint = (ep: JfItem | null) => {
    const l = primaryLabel(item, ep);
    target = l.target;
    primary.replaceChildren(
      l.pct ? progressRing(l.pct, 'tide-ring tide-hero-ring') : icon('play_arrow'),
      h('span', {}, l.text),
      ...(l.left ? [h('span', { class: 'tide-hero-left' }, l.left)] : []));
  };
  if (item.Type === 'Series') { primary.disabled = true; primary.append(icon('play_arrow'), h('span', {}, 'Play')); } else paint(null);

  const yt = youtubeId(item.RemoteTrailers?.map((t) => t.Url).find((u) => youtubeId(u)));
  const trailer = (item.LocalTrailerCount ?? 0) > 0 || yt
    ? h('button', { class: 'tide-btn tide-btn-lg tide-dh-trailer', type: 'button', onclick: async () => {
      const local = (item.LocalTrailerCount ?? 0) > 0 ? await getLocalTrailerId(item.Id).catch(() => null) : null;
      if (local) void play(local);
      else if (yt) openYouTubeModal(yt);
    } }, icon('movie'), 'Trailer')
    : null;
  const fav = toggleButton({ icon: 'favorite', label: 'Favourite', on: !!item.UserData?.IsFavorite, cls: 'tide-ib-xl tide-fav-toggle', save: (on) => setFavourite(item.Id, on) });
  const seen = toggleButton({ icon: 'check', label: 'Watched', on: !!item.UserData?.Played, cls: 'tide-ib-xl', save: (on) => setWatched(item.Id, on) });

  const more = h('button', { class: 'tide-ib tide-ib-xl tide-dh-more', type: 'button', 'aria-label': 'More', 'aria-haspopup': 'menu' }, icon('more_horiz'));
  more.addEventListener('click', async () => {
    const list = h('div', {});
    const pos = item.Type === 'Movie' ? item.UserData?.PlaybackPositionTicks ?? 0 : 0;
    if (item.Type === 'Series' || pos > 0) list.append(menuItem('Play from start', 'replay', () => void play(target, 0)));
    if (item.Type === 'Series') list.append(menuItem('Shuffle', 'shuffle', () => void playShuffle(item.Id)));
    list.append(menuItem('Copy link', 'link', () => void navigator.clipboard?.writeText(location.href)));
    if (await isAdmin()) {
      list.append(menuItem('Refresh metadata', 'refresh', () => void refreshItem(item.Id)));
      list.append(menuItem('Edit metadata', 'edit', () => { location.hash = `#/metadata?id=${encodeURIComponent(item.Id)}`; }));
    }
    openPopover(more, list, { align: 'left' });
  });
  const moreWrap = h('span', { class: 'tide-dh-morewrap' }, more);

  const btns = h('div', { class: 'tide-dh-btns' }, primary, trailer, fav, seen, moreWrap);
  const col = h('div', { class: 'tide-dh-col' },
    logo, metaLine(item),
    item.Type === 'Movie' && item.Taglines?.[0] ? h('div', { class: 'tide-dh-tag' }, item.Taglines[0]) : null,
    desc, btns);
  const el = h('header', { class: 'tide-dh' }, poster, col);
  return {
    el, col,
    setTarget: (ep) => { primary.disabled = false; paint(ep); },
    setQuality: (q) => { const b = qualityBadge(q, true); const slot = el.querySelector('.tide-dh-q'); if (slot) slot.replaceChildren(...(b ? [b] : [])); },
  };
}
