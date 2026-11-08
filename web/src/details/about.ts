import { h } from '../ui/dom';
import { qualityBadge } from '../ui/quality';
import { aboutFacts, fileFacts } from './logic';
import type { JfDetail, JfSource } from '../api/item';
import type { Quality } from '../types';

export function renderAbout(item: JfDetail, file: { src: JfSource | undefined; label: string } | null, q: Quality | null): HTMLElement | null {
  const about = aboutFacts(item);
  const rows = fileFacts(file?.src);
  if (!about.length && !rows.length) return null;
  const panels = h('div', { class: 'tide-details-panels' },
    about.length ? h('div', { class: 'tide-panel tide-about' }, h('h3', {}, 'About'),
      h('div', { class: 'tide-facts' }, ...about.map(([k, v]) => h('div', { class: 'tide-fact' }, h('span', {}, k), h('b', {}, v))))) : null,
    rows.length ? h('div', { class: 'tide-panel tide-file' }, h('h3', {}, file!.label, qualityBadge(q, true)),
      ...rows.map(([k, v]) => h('div', { class: 'tide-frow' }, h('span', {}, k), h('b', {}, v)))) : null);
  return h('section', { class: 'tide-dsec tide-detailsinfo', 'aria-label': 'Details' },
    h('div', { class: 'tide-dsec-h' }, h('h2', {}, 'Details')), panels);
}
