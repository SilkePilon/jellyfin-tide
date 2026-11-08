import { getSimilar } from '../api/item';
import { h } from '../ui/dom';
import { wideCard } from '../ui/cards';
import { createScroller } from '../home/scroller';

export function renderSimilar(id: string): { el: HTMLElement; dispose(): void } {
  const scroller = createScroller('tide-row-wide');
  const el = h('section', { class: 'tide-row tide-dsec tide-similar' },
    h('div', { class: 'tide-row-head' }, h('h2', { class: 'tide-row-title' }, 'More like this')), scroller.el);
  el.hidden = true;
  let disposed = false;
  void getSimilar(id).then((items) => {
    if (disposed || !items.length) return;
    scroller.track.replaceChildren(...items.map((i) => wideCard(i)));
    el.hidden = false;
    scroller.sync();
  }).catch((e) => console.warn('[Tide] similar failed', e));
  return { el, dispose: () => { disposed = true; scroller.dispose(); } };
}
