import './sections.css';
import { imageUrl } from '../api/client';
import { openDetails } from '../api/actions';
import { h } from '../ui/dom';
import type { RenderedRow } from './rowView';
import type { RowContext, RowDef } from './rows';

function lazySection(section: HTMLElement, load: () => Promise<void>): () => void {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      void load();
    }
  }, { rootMargin: '600px 0px' });
  io.observe(section);
  return () => io.disconnect();
}

function logoOrTitle(id: string, title: string, cls: string): HTMLElement {
  const text = () => h('span', { class: `${cls} ${cls}-text` }, title);
  const img = h('img', { class: cls, src: imageUrl(id, 'Logo', 480), alt: title, loading: 'lazy', decoding: 'async' }) as HTMLImageElement;
  img.onerror = () => img.replaceWith(text());
  return img;
}

// ── New this week (bento) ─────────────────────────────────────────────────────────────────────────────────────────

export function renderBento(def: RowDef, ctx: RowContext): RenderedRow {
  const grid = h('div', { class: 'tide-bento' });
  const section = h('section', { class: 'tide-row tide-row-bento', 'data-row': def.id }, h('div', { class: 'tide-row-head' }, h('h2', { class: 'tide-row-title' }, def.title(ctx))), grid);
  let disposed = false;
  const stop = lazySection(section, async () => {
    try {
      const list = await def.fetch(ctx);
      if (disposed) return;
      if (list.length < 3) { section.hidden = true; return; }
      grid.dataset.count = String(list.length);
      grid.replaceChildren(...list.map((item, i) => {
        const art = h('img', { class: 'tide-bento-art', alt: '', loading: 'lazy', decoding: 'async', src: imageUrl(item.Id, 'Backdrop/0', i === 0 ? 1280 : 720) }) as HTMLImageElement;
        art.onerror = () => { if (art.dataset.fallback) { art.remove(); return; } art.dataset.fallback = '1'; art.src = imageUrl(item.Id, 'Primary', 720); };
        return h('a', { class: `tide-bento-tile tide-bento-${i}`, href: '#', 'data-id': item.Id, 'aria-label': item.Name,
          onclick: (e: Event) => { e.preventDefault(); void openDetails(item.Id); } },
          h('span', { class: 'tide-card-shadow', 'aria-hidden': 'true' }),
          art, logoOrTitle(item.Id, item.Name, 'tide-bento-logo'), h('span', { class: 'tide-chip tide-chip-w tide-bento-new' }, 'NEW'));
      }));
    } catch (e) {
      console.warn('[Tide] new this week failed', e);
      section.hidden = true;
    }
  });
  return { el: section, dispose: () => { disposed = true; stop(); } };
}
