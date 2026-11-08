import { imageUrl } from '../api/client';
import { play } from '../api/actions';
import { fmtRuntime, h, icon } from '../ui/dom';
import { minutesLeft } from '../ui/cards';
import { epLabel } from './logic';
import type { JfItem } from '../types';

export function renderNextUp(ep: JfItem, kicker = 'NEXT UP'): HTMLElement {
  const pos = ep.UserData?.PlaybackPositionTicks ?? 0;
  const pct = pos && ep.RunTimeTicks ? Math.round((pos / ep.RunTimeTicks) * 100) : 0;
  const left = pos ? `${minutesLeft(ep) ?? 0}m left` : fmtRuntime(ep.RunTimeTicks) ?? '';
  const thumb = h('span', { class: 'tide-nu-th' });
  thumb.style.backgroundImage = `url("${imageUrl(ep.Id, 'Primary', 400)}")`;
  if (pct) thumb.append(h('span', { class: 'tide-nu-pb' }, h('i', { style: `transform:scaleX(${pct / 100})` })));
  return h('button', { class: 'tide-nu', type: 'button', 'aria-label': `Play ${epLabel(ep)} ${ep.Name}`, onclick: () => void play(ep.Id) },
    thumb,
    h('span', { class: 'tide-nu-tx' },
      h('span', { class: 'tide-nu-k' }, `${kicker} · ${epLabel(ep)}`),
      h('span', { class: 'tide-nu-t' }, ep.Name),
      h('span', { class: 'tide-nu-m' }, left)),
    h('span', { class: 'tide-nu-go', 'aria-hidden': 'true' }, icon('play_arrow')));
}
