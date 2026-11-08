import { getSession } from '../api/client';
import { h, icon } from '../ui/dom';
import { ROUTES } from '../router/selectors';
import { castList } from './logic';
import type { JfPerson } from '../api/item';

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

function chip(p: JfPerson): HTMLElement {
  const ph = h('span', { class: 'tide-chipp-ph' });
  if (p.PrimaryImageTag) ph.style.backgroundImage = `url("${getSession()?.server ?? ''}/Items/${p.Id}/Images/Primary?maxWidth=120&quality=88&tag=${p.PrimaryImageTag}")`;
  else ph.append(h('span', { class: 'tide-chipp-ini' }, initials(p.Name)));
  return h('a', { class: 'tide-chipp', href: ROUTES.details(p.Id) }, ph,
    h('span', { class: 'tide-chipp-tx' }, h('b', {}, p.Name), h('span', {}, p.Type === 'Actor' ? p.Role ?? '' : p.Type)));
}

export function renderCast(people: JfPerson[] | undefined): HTMLElement | null {
  const short = castList(people, false);
  const full = castList(people, true);
  if (!full.length) return null;
  let expanded = false;
  const grid = h('div', { class: 'tide-cast-grid' });
  const toggle = full.length > short.length ? h('button', { class: 'tide-cast-all', type: 'button' }) : null;
  const paint = () => {
    grid.replaceChildren(...(expanded ? full : short.length ? short : full.slice(0, 12)).map(chip));
    toggle?.replaceChildren(expanded ? 'Show less' : 'See all', icon(expanded ? 'expand_less' : 'chevron_right'));
  };
  toggle?.addEventListener('click', () => { expanded = !expanded; paint(); });
  paint();
  return h('section', { class: 'tide-dsec tide-cast', 'aria-label': 'Cast and crew' },
    h('div', { class: 'tide-dsec-h' }, h('h2', {}, 'Cast & crew'), toggle), grid);
}
