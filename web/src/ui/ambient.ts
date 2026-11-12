import './ambient.css';
import { imageUrl } from '../api/client';
import { h } from './dom';

/** Dark, blurred, tiny copy of a backdrop fixed behind the page. Two layers crossfade (opacity only). */
/** `set(id, url)`: `url` is the tagged backdrop when known (null: the item has none, the glow stays dark). */
export function createAmbient(): { el: HTMLElement; set(id: string, url?: string | null): void } {
  const layers = [h('div', { class: 'tide-ambient' }), h('div', { class: 'tide-ambient' })];
  const el = h('div', { class: 'tide-ambient-wrap', 'aria-hidden': 'true' }, ...layers, h('div', { class: 'tide-ambient-veil' }));
  let idx = 0;
  let current = '';
  return {
    el,
    set(id: string, url?: string | null) {
      if (id === current) return;
      current = id;
      const next = layers[idx ^ 1]!;
      const src = url === undefined ? imageUrl(id, 'Backdrop/0', 160) : url;
      next.style.backgroundImage = src ? `url("${src}")` : 'none';
      next.classList.add('on');
      layers[idx]!.classList.remove('on');
      idx ^= 1;
    },
  };
}
