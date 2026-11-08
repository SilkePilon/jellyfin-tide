import { h, icon } from '../ui/dom';
import { squareCard, wideCard } from '../ui/cards';
import { createScroller } from './scroller';
import { renderBento, renderDiscover } from './sections';
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
  if (def.id === 'discover') return renderDiscover(def, ctx);
  if (def.id === 'newThisWeek') return renderBento(def, ctx);

  const titleText = def.title(ctx);
  const scroller = createScroller(`tide-row-${def.kind}`);
  const { track } = scroller;
  const header = h('div', { class: 'tide-row-head' },
    def.link ? h('a', { class: 'tide-row-title', href: def.link }, titleText, icon('chevron_right')) : h('h2', { class: 'tide-row-title' }, titleText));
  const section = h('section', { class: 'tide-row', 'data-row': def.id }, header, scroller.el);
  if (!titleText) section.hidden = true;
  let disposed = false;

  const load = async () => {
    track.replaceChildren(h('div', { class: 'tide-row-skeleton' }));
    try {
      const list = await def.fetch(ctx);
      if (disposed) return;
      if (!list.length) {
        section.hidden = true;
        return;
      }
      section.hidden = false;
      track.replaceChildren(...list.map((i) => card(def, i)));
      scroller.sync();
    } catch (e) {
      console.warn(`[Tide] row ${def.id} failed`, e);
      track.replaceChildren(h('div', { class: 'tide-row-error' }, "Couldn't load · ", h('button', { onclick: () => void load() }, 'Retry')));
    }
  };

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
