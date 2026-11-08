import { imageUrl } from '../api/client';
import { getEpisodes } from '../api/item';
import { h, icon } from '../ui/dom';
import { wideCard } from '../ui/cards';
import { menuItem, openPopover } from '../ui/popover';
import { animator, cardSpans, PAGE_MS } from '../ui/scrollAnim';
import { createScroller } from '../home/scroller';
import { episodeTag, nextInSeason, rowStartIndex } from './logic';
import type { JfItem } from '../types';

const watchedOf = (s: JfItem) => Math.max(0, (s.ChildCount ?? 0) - (s.UserData?.UnplayedItemCount ?? 0));

function countText(eps: JfItem[]): string {
  const w = eps.filter((e) => e.UserData?.Played).length;
  return w ? `${w} of ${eps.length} watched` : `${eps.length} episode${eps.length === 1 ? '' : 's'}`;
}

export interface EpisodesOpts { synopsis?: boolean; current?: { id: string; tag: string }; heading?: string }

export function renderEpisodes(seriesId: string, sorted: JfItem[], startIdx: number, next: JfItem | null, firstEps: JfItem[], opts?: EpisodesOpts): { el: HTMLElement; dispose(): void } {
  const cache = new Map<string, JfItem[]>([[sorted[startIdx]!.Id, firstEps]]);
  let cur = startIdx;
  const scroller = createScroller('tide-row-wide');
  const { track } = scroller;
  const label = h('span', { class: 'tide-ep-name' });
  const dd = h('button', { class: 'tide-ep-dd', type: 'button', 'aria-haspopup': 'menu' }, label, icon('expand_more'));
  const count = h('span', { class: 'tide-ep-count' });
  const ddWrap = h('span', { class: 'tide-ep-ddwrap' }, dd);
  const el = h('section', { class: 'tide-dsec tide-eps', 'aria-label': 'Episodes' },
    h('div', { class: 'tide-dsec-h' }, opts?.heading ? h('h2', {}, opts.heading) : null, ddWrap, count), scroller.el);

  const show = (eps: JfItem[], glide: boolean) => {
    label.textContent = sorted[cur]!.Name;
    count.textContent = countText(eps);
    const up = nextInSeason(eps, next);
    const tagFor = (e: JfItem) => opts?.current ? (e.Id === opts.current.id ? opts.current.tag : null) : episodeTag(e, next && next.Id === up?.Id ? next : null);
    track.replaceChildren(...eps.map((e) => wideCard(e, { episode: { tag: tagFor(e), synopsis: opts?.synopsis } })));
    scroller.sync();
    const ci = opts?.current ? eps.findIndex((e) => e.Id === opts.current!.id) : -1;
    const i = ci >= 0 ? Math.max(0, ci - 1) : rowStartIndex(eps, next);
    const go = () => {
      const { spans, max } = cardSpans(track);
      const to = Math.min(max, spans[i]?.start ?? 0);
      if (glide) { animator(track, 'x').jump(0); animator(track, 'x').to(to, PAGE_MS); } else animator(track, 'x').jump(to);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go); else go();
  };

  const pick = async (i: number) => {
    if (i === cur) return;
    cur = i;
    const s = sorted[i]!;
    let eps = cache.get(s.Id);
    if (!eps) {
      label.textContent = s.Name;
      try { eps = await getEpisodes(seriesId, s.Id); } catch (e) { console.warn('[Tide] episodes failed', e); eps = []; }
      cache.set(s.Id, eps);
      if (cur !== i) return; // user picked another season meanwhile
    }
    show(eps, true);
  };

  dd.addEventListener('click', () => {
    const list = h('div', { class: 'tide-ep-menu' }, ...sorted.map((s, i) => {
      const total = s.ChildCount ?? 0;
      const done = total > 0 && watchedOf(s) >= total;
      const poster = h('span', { class: 'tide-ep-mp' });
      poster.style.backgroundImage = `url("${imageUrl(s.Id, 'Primary', 100)}")`;
      const meta = [s.ProductionYear, done ? 'Watched' : watchedOf(s) ? `${watchedOf(s)} of ${total}` : `${total} episodes`].filter(Boolean).join(' · ');
      const item = menuItem('', null, () => void pick(i), done ? icon('check', 'tide-ep-mdone') : null);
      item.querySelector('.tide-pop-label')!.replaceChildren(
        h('b', {}, s.Name), h('span', { class: 'tide-ep-mm' }, meta),
        h('span', { class: 'tide-ep-mbar' }, h('i', { style: `transform:scaleX(${total ? watchedOf(s) / total : 0})` })));
      item.prepend(poster);
      if (i === cur) item.setAttribute('aria-current', 'true');
      return item;
    }));
    dd.classList.add('open');
    openPopover(dd, list, { onClose: () => dd.classList.remove('open') });
  });

  show(firstEps, false);
  return { el, dispose: () => scroller.dispose() };
}
