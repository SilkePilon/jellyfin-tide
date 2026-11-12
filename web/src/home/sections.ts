import './sections.css';
import { openDetails } from '../api/actions';
import { h } from '../ui/dom';
import { cached, HOME_TTL, peek } from '../api/cache';
import { backdropOf, chain, logoOf, primaryOf, sources } from '../ui/images';
import type { RenderedRow } from './rowView';
import type { RowContext, RowDef } from './rows';
import type { JfItem } from '../types';

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

function logoOrTitle(item: JfItem, title: string, cls: string): HTMLElement {
  const text = () => h('span', { class: `${cls} ${cls}-text` }, title);
  const img = h('img', { class: cls, alt: title, loading: 'lazy', decoding: 'async' }) as HTMLImageElement;
  return chain(img, sources([logoOf(item, 480), item.Id, 'Logo', 480]), () => img.replaceWith(text())) ? img : text();
}

// ── New this week (bento) ─────────────────────────────────────────────────────────────────────────────────────────

export function renderBento(def: RowDef, ctx: RowContext): RenderedRow {
  const grid = h('div', { class: 'tide-bento' });
  const section = h('section', { class: 'tide-row tide-row-bento', 'data-row': def.id }, h('div', { class: 'tide-row-head' }, h('h2', { class: 'tide-row-title' }, def.title(ctx))), grid);
  let disposed = false;
  const show = (list: JfItem[]) => {
    if (list.length < 3) { section.hidden = true; return; }
    grid.dataset.count = String(list.length);
    grid.replaceChildren(...list.map((item, i) => {
      const w = i === 0 ? 1280 : 720;
      const art = h('img', { class: 'tide-bento-art', alt: '', loading: 'lazy', decoding: 'async' }) as HTMLImageElement;
      const hasArt = chain(art, sources([backdropOf(item, w), item.Id, 'Backdrop/0', w], [primaryOf(item, 720), item.Id, 'Primary', 720]), () => art.remove());
      return h('a', { class: `tide-bento-tile tide-bento-${i}`, href: '#', 'data-id': item.Id, 'aria-label': item.Name,
        onclick: (e: Event) => { e.preventDefault(); void openDetails(item.Id); } },
        h('span', { class: 'tide-card-shadow', 'aria-hidden': 'true' }),
        hasArt ? art : null, logoOrTitle(item, item.Name, 'tide-bento-logo'), h('span', { class: 'tide-chip tide-chip-w tide-bento-new' }, 'NEW'));
    }));
  };
  const ready = peek<JfItem[]>(`row:${def.id}`, HOME_TTL);
  if (ready) { show(ready.v); return { el: section, dispose: () => { disposed = true; } }; }
  const stop = lazySection(section, async () => {
    try {
      const list = await cached(`row:${def.id}`, HOME_TTL, () => def.fetch(ctx));
      if (disposed) return;
      show(list);
    } catch (e) {
      console.warn('[Tide] new this week failed', e);
      section.hidden = true;
    }
  });
  return { el: section, dispose: () => { disposed = true; stop(); } };
}
