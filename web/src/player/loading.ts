import { getItem } from '../api/item';
import { imageUrl } from '../api/client';
import { h, icon } from '../ui/dom';
import type { NowPlaying } from './session';

export interface LoadStep { icon: string; text: string }
export const BUFFER_DELAY_MS = 400;
const NS = 'http://www.w3.org/2000/svg';

export function loadingSteps(t: NowPlaying['transcode'], sourceLabel: string | null): LoadStep[] {
  const prep = t?.height && t.videoCodec
    ? `Preparing stream · ${sourceLabel ? `${sourceLabel} → ` : ''}${t.height}p ${t.videoCodec.toUpperCase()}`
    : 'Starting stream';
  return [{ icon: 'dns', text: 'Connecting to server' }, { icon: 'movie_edit', text: prep }, { icon: 'downloading', text: 'Buffering' }];
}

export function loadingPercent(phase: 0 | 1 | 2, completion: number | null, ahead: number | null): number | null {
  if (phase === 0) return 8;
  if (phase === 1) return completion === null ? null : Math.round(10 + 0.6 * completion);
  return ahead === null ? null : Math.round(70 + 30 * Math.min(1, ahead / 10));
}

function ring(r: number, w: number): { el: HTMLElement; set(p: number | null): void } {
  const C = 2 * Math.PI * r;
  const box = r * 2 + w * 2;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`);
  const mk = (cls: string) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', String(r + w)); c.setAttribute('cy', String(r + w)); c.setAttribute('r', String(r)); c.setAttribute('class', cls); svg.append(c); return c; };
  mk('tr');
  const ar = mk('ar');
  const pct = h('span', { class: 'tide-ld-pct' });
  const el = h('div', { class: 'tide-ld-ring' }, svg as unknown as Node, pct);
  return {
    el,
    set(p) {
      el.classList.toggle('indet', p === null);
      ar.setAttribute('stroke-dasharray', p === null ? `${C * 0.25} ${C}` : `${(C * p) / 100} ${C}`);
      pct.textContent = p === null ? '' : `${p}%`;
    },
  };
}

export interface Loading { el: HTMLElement; show(itemId: string): void; update(phase: 0 | 1 | 2, pct: number | null, steps: LoadStep[]): void; hide(): void; isOn(): boolean }

export function createLoading(): Loading {
  const el = h('div', { class: 'tide-ld', 'aria-live': 'polite' });
  let on = false;
  let built = '';
  let r: ReturnType<typeof ring> | null = null;
  let stepsBox: HTMLElement | null = null;
  return {
    el,
    show(itemId) {
      on = true;
      el.classList.add('show');
      if (built === itemId) return;
      built = itemId;
      r = ring(42, 4);
      stepsBox = h('div', { class: 'tide-ld-steps' });
      const bg = h('div', { class: 'tide-ld-bg' });
      const poster = h('div', { class: 'tide-ld-poster' });
      const logo = h('img', { class: 'tide-ld-logo', alt: '' }) as HTMLImageElement;
      logo.onerror = () => logo.remove();
      const line = h('b', { class: 'tide-ld-line' });
      el.replaceChildren(bg, h('div', { class: 'tide-ld-in' }, poster, h('div', { class: 'tide-ld-tx' }, logo, line, h('div', { class: 'tide-ld-row' }, r.el, stepsBox))));
      void getItem(itemId).then((it) => {
        if (built !== itemId) return;
        const sid = it.SeriesId ?? it.Id;
        bg.style.backgroundImage = `url("${imageUrl(sid, 'Backdrop/0', 300)}")`;
        poster.style.backgroundImage = `url("${imageUrl(sid, 'Primary', 400)}")`;
        logo.src = imageUrl(sid, 'Logo', 600);
        line.textContent = it.Type === 'Episode' ? `S${it.ParentIndexNumber ?? 0} · E${it.IndexNumber ?? 0} · ${it.Name}` : it.Name;
      }).catch(() => {});
    },
    update(phase, pct, steps) {
      r?.set(pct);
      if (!stepsBox) return;
      // Each step: an SVG ✓ (shown when done) + a font glyph (shown otherwise) + its text. Built once, then updated.
      if (stepsBox.children.length !== steps.length) {
        stepsBox.replaceChildren(...steps.map(() => h('div', { class: 'tide-ld-step' }, icon('check'), h('span', { class: 'tide-ms tide-ld-gl' }), h('span', { class: 'tide-ld-txt' }))));
      }
      [...stepsBox.children].forEach((d, i) => {
        d.className = `tide-ld-step${i < phase ? ' done' : i === phase ? ' on' : ''}`;
        d.querySelector('.tide-ld-gl')!.textContent = steps[i]!.icon;
        d.querySelector('.tide-ld-txt')!.textContent = steps[i]!.text;
      });
    },
    hide() { on = false; el.classList.remove('show'); },
    isOn: () => on,
  };
}

export interface Buffering { el: HTMLElement; set(waiting: boolean, pct: number | null): void }

export function createBuffering(): Buffering {
  const r = ring(28, 4);
  const el = h('div', { class: 'tide-buf' }, r.el, h('small', {}, 'Buffering'));
  r.el.querySelector('.tide-ld-pct')!.classList.add('tide-buf-pct');
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    el,
    set(waiting, pct) {
      r.set(pct);
      if (!waiting) { if (timer) clearTimeout(timer); timer = undefined; el.classList.remove('show'); return; }
      if (el.classList.contains('show') || timer) return;
      timer = setTimeout(() => { timer = undefined; el.classList.add('show'); }, BUFFER_DELAY_MS);
    },
  };
}
