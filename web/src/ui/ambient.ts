import './ambient.css';
import { imageUrl } from '../api/client';
import { h } from './dom';

/** Dark, blurred, tiny copy of a backdrop fixed behind the page. Two layers crossfade (opacity only). */
export function createAmbient(): { el: HTMLElement; set(id: string): void } {
  const layers = [h('div', { class: 'tide-ambient' }), h('div', { class: 'tide-ambient' })];
  const el = h('div', { class: 'tide-ambient-wrap', 'aria-hidden': 'true' }, ...layers, h('div', { class: 'tide-ambient-veil' }));
  let idx = 0;
  let current = '';
  return {
    el,
    set(id: string) {
      if (id === current) return;
      current = id;
      const next = layers[idx ^ 1]!;
      next.style.backgroundImage = `url("${imageUrl(id, 'Backdrop/0', 160)}")`;
      next.classList.add('on');
      layers[idx]!.classList.remove('on');
      idx ^= 1;
    },
  };
}
