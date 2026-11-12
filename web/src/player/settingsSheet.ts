import { h, icon } from '../ui/dom';
import { trackLists } from './tracks';

export interface SheetData { audio: { index: number; label: string; sub: string }[]; subtitles: { index: number; label: string; sub: string }[]; audioIndex: number | null; subtitleIndex: number | null; quality: string[]; qualityCur: string; speed: number; subSize: 'S' | 'M' | 'L' | 'XL' }
export interface SettingsSheet { el: HTMLElement; open(): void; close(): void; isOpen(): boolean; setData(d: SheetData): void; dispose(): void }
type Kind = 'audio' | 'subtitles' | 'quality' | 'speed' | 'subSize';

export const streamsToSheet = trackLists;

export function createSettingsSheet(onPick: (kind: Kind, value: string) => void, onOpenChange: (open: boolean) => void): SettingsSheet {
  const el = h('div', { class: 'tide-pset', role: 'dialog', 'aria-label': 'Playback settings', 'aria-hidden': 'true' });
  let open = false;
  let last = '';
  const opt = (kind: Kind, value: string, label: string, sub: string, on: boolean) =>
    h('button', { class: `tide-pset-opt${on ? ' on' : ''}`, type: 'button', 'data-kind': kind, 'data-value': value }, h('span', {}, label, sub ? h('small', {}, sub) : null), icon('check', 'tide-pset-ck'));
  const chip = (kind: Kind, value: string, label: string, on: boolean) =>
    h('button', { class: `tide-pset-chip${on ? ' on' : ''}`, type: 'button', 'data-kind': kind, 'data-value': value }, label);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]');
    if (!t) return;
    const kind = t.dataset.kind as Kind;
    el.querySelectorAll(`[data-kind="${kind}"]`).forEach((x) => x.classList.toggle('on', x === t));
    onPick(kind, t.dataset.value!);
  });
  return {
    el,
    open() { if (open) return; open = true; el.classList.add('open'); el.removeAttribute('aria-hidden'); onOpenChange(true); },
    close() { if (!open) return; open = false; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); onOpenChange(false); },
    isOpen: () => open,
    setData(d) {
      // Called on every 2 s session poll: rebuilding an open sheet would drop hover / keyboard focus.
      const key = JSON.stringify(d);
      if (key === last) return;
      last = key;
      el.replaceChildren(
        h('div', { class: 'tide-pset-col' }, h('h5', {}, 'AUDIO'), ...d.audio.map((a) => opt('audio', String(a.index), a.label, a.sub, a.index === d.audioIndex))),
        h('div', { class: 'tide-pset-col' }, h('h5', {}, 'SUBTITLES'), opt('subtitles', '-1', 'Off', '', d.subtitleIndex === null),
          ...d.subtitles.map((s) => opt('subtitles', String(s.index), s.label, s.sub, s.index === d.subtitleIndex))),
        h('div', { class: 'tide-pset-col' },
          h('h5', {}, 'QUALITY'), h('div', { class: 'tide-pset-chips' }, ...d.quality.map((q) => chip('quality', q, q, q === d.qualityCur))),
          h('h5', {}, 'SPEED'), h('div', { class: 'tide-pset-chips' }, ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((x) => chip('speed', String(x), `${x}×`, x === d.speed))),
          h('h5', {}, 'SUBTITLE SIZE'), h('div', { class: 'tide-pset-chips' }, ...(['S', 'M', 'L', 'XL'] as const).map((x) => chip('subSize', x, x, x === d.subSize)))));
    },
    dispose() { /* nothing */ },
  };
}
