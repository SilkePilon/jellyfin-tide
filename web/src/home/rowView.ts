import { getQuality } from '../api/tide';
import { h, icon } from '../ui/dom';
import { landscapeCard, posterCard, squareCard } from '../ui/cards';
import { qualityBadge } from '../ui/quality';
import type { RowContext, RowDef } from './rows';
import type { JfItem } from '../types';

function card(def: RowDef, item: JfItem, ctx: RowContext): HTMLElement {
  if (def.kind === 'landscape') return landscapeCard(item);
  if (def.kind === 'square') return squareCard(item);
  if (def.kind === 'round') return squareCard(item, true);
  return posterCard(item, { newDays: ctx.newDays });
}

export interface RenderedRow { el: HTMLElement; dispose(): void }

async function addQualityBadges(track: HTMLElement, list: JfItem[]): Promise<void> {
  const q = await getQuality(list.map((i) => i.Id)).catch(() => ({}) as Record<string, null>);
  track.querySelectorAll<HTMLElement>('.tide-card-poster').forEach((c) => {
    const badge = qualityBadge(q[c.dataset.id ?? ''] ?? null, false);
    const slot = c.querySelector('.tide-poster-badges');
    if (badge && slot && !slot.querySelector('.tide-q')) slot.append(badge);
  });
}

/** Renders a lazy row. `dispose` disconnects its observers (call before rebuilding / on unmount). */
export function renderRow(def: RowDef, ctx: RowContext): RenderedRow {
  const track = h('div', { class: `tide-row-track tide-row-${def.kind}` });
  const titleText = def.title(ctx);
  const header = h('div', { class: 'tide-row-head' },
    def.link ? h('a', { class: 'tide-row-title', href: def.link }, titleText, icon('chevron_right')) : h('h2', { class: 'tide-row-title' }, titleText),
    h('div', { class: 'tide-row-arrows' },
      h('button', { class: 'tide-ib', 'aria-label': 'Scroll left', onclick: () => track.scrollBy({ left: -track.clientWidth * 0.9, behavior: 'smooth' }) }, icon('chevron_left')),
      h('button', { class: 'tide-ib', 'aria-label': 'Scroll right', onclick: () => track.scrollBy({ left: track.clientWidth * 0.9, behavior: 'smooth' }) }, icon('chevron_right'))));
  const section = h('section', { class: 'tide-row', 'data-row': def.id }, header, track);
  if (!titleText && def.id !== 'continue') section.hidden = true;

  /** Arrows only when the track actually overflows (a two-item row has nothing to scroll to). */
  const syncArrows = () => section.classList.toggle('tide-row-scrolls', track.scrollWidth > track.clientWidth + 1);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(syncArrows) : null;
  ro?.observe(track);
  let disposed = false;

  const load = async () => {
    track.replaceChildren(h('div', { class: 'tide-row-skeleton' }));
    let list: JfItem[];
    try {
      list = await def.fetch(ctx);
      if (disposed) return;
      if (!list.length) {
        section.hidden = true;
        return;
      }
      section.hidden = false;
      track.replaceChildren(...list.map((i) => card(def, i, ctx)));
      syncArrows();
    } catch (e) {
      console.warn(`[Tide] row ${def.id} failed`, e);
      track.replaceChildren(h('div', { class: 'tide-row-error' }, "Couldn't load · ", h('button', { onclick: () => void load() }, 'Retry')));
      return;
    }
    // Badges are decoration: a failure here must never replace the cards with the error state.
    if (def.kind === 'poster') {
      try {
        await addQualityBadges(track, list);
      } catch (e) {
        console.warn(`[Tide] row ${def.id} badges failed`, e);
      }
    }
  };

  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      void load();
    }
  }, { rootMargin: '600px 0px' });
  io.observe(section);
  const dispose = () => {
    disposed = true;
    io.disconnect();
    ro?.disconnect();
  };
  return { el: section, dispose };
}
