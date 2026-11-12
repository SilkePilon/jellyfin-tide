import { h, icon } from '../ui/dom';
import { cached, HOME_TTL, peek } from '../api/cache';
import { squareCard, wideCard } from '../ui/cards';
import { createScroller } from './scroller';
import { renderBento } from './sections';
import type { RowContext, RowDef } from './rows';
import type { JfItem } from '../types';

function card(def: RowDef, item: JfItem): HTMLElement {
  if (def.kind === 'square') return squareCard(item);
  if (def.kind === 'round') return squareCard(item, true);
  return wideCard(item);
}

export interface RenderedRow { el: HTMLElement; dispose(): void }

/** Renders a lazy section. `dispose` disconnects its observers (call before rebuilding / on unmount). */
export function renderRow(def: RowDef, ctx: RowContext): RenderedRow {
  if (def.id === 'newThisWeek') return renderBento(def, ctx);

  const titleText = def.title(ctx);
  const scroller = createScroller(`tide-row-${def.kind}`);
  const { track } = scroller;
  const header = h('div', { class: 'tide-row-head' },
    def.link ? h('a', { class: 'tide-row-title', href: def.link }, titleText, icon('chevron_right')) : h('h2', { class: 'tide-row-title' }, titleText));
  const section = h('section', { class: 'tide-row', 'data-row': def.id }, header, scroller.el);
  if (!titleText) section.hidden = true;
  let disposed = false;

  // Keyed by title too: genre rows change genre between visits unless pinned.
  const key = `row:${def.id}:${titleText}`;
  const show = (list: JfItem[]) => {
    if (!list.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    track.replaceChildren(...list.map((i) => card(def, i)));
    scroller.sync();
  };
  const load = async () => {
    track.replaceChildren(h('div', { class: 'tide-row-skeleton' }));
    try {
      const list = await cached(key, HOME_TTL, () => def.fetch(ctx));
      if (disposed) return;
      show(list);
    } catch (e) {
      console.warn(`[Tide] row ${def.id} failed`, e);
      track.replaceChildren(h('div', { class: 'tide-row-error' }, "Couldn't load · ", h('button', { onclick: () => void load() }, 'Retry')));
    }
  };

  // Data still cached from a moment ago (back from a details page): render now, no skeleton frame, no observer.
  const ready = titleText ? peek<JfItem[]>(key, HOME_TTL) : null;
  if (ready) {
    show(ready.v);
    return { el: section, dispose: () => { disposed = true; scroller.dispose(); } };
  }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      void load();
    }
  }, { rootMargin: '600px 0px' });
  io.observe(section);
  return {
    el: section,
    dispose: () => {
      disposed = true;
      io.disconnect();
      scroller.dispose();
    },
  };
}
