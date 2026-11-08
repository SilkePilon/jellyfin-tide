import { h } from './dom';
import type { Quality } from '../types';

export function qualityBadge(q: Quality | null | undefined, full: boolean): HTMLElement | null {
  if (!q || !q.res) return null;
  const parts = [h('span', { class: 'tide-q-res' }, q.res), h('span', { class: 'tide-q-codec' }, q.codec)];
  if (full && q.range) parts.push(h('span', { class: 'tide-q-range' }, q.range));
  if (full && q.audio) parts.push(h('span', { class: 'tide-q-audio' }, q.audio));
  return h('span', { class: 'tide-q' }, ...parts);
}
