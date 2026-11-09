import { imageUrl } from '../api/client';
import { h, icon } from '../ui/dom';

export const PAUSE_MS = 4000;
export interface PausedScreen {
  el: HTMLElement;
  setItem(d: { posterId: string; logoId: string; line: string; meta: string; overview: string; next: { id: string; label: string; runtime: string } | null }, onNext: () => void): void;
  arm(paused: boolean, blocked: boolean): void; dismiss(): void; isOn(): boolean; dispose(): void;
}

export function createPausedScreen(host: HTMLElement): PausedScreen {
  const el = h('div', { class: 'tide-pz', 'aria-hidden': 'true' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let on = false;
  const set = (v: boolean) => { on = v; host.classList.toggle('tide-pz-on', v); el.toggleAttribute('aria-hidden', !v); };
  const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
  return {
    el,
    setItem(d, onNext) {
      const poster = h('div', { class: 'tide-pz-poster' });
      poster.style.backgroundImage = `url("${imageUrl(d.posterId, 'Primary', 420)}")`;
      const logo = h('img', { class: 'tide-pz-logo', src: imageUrl(d.logoId, 'Logo', 600), alt: '' }) as HTMLImageElement;
      logo.onerror = () => logo.remove();
      const nx = d.next ? h('button', { class: 'tide-pz-next', type: 'button', 'data-pz-next': '', onclick: (e: Event) => { e.stopPropagation(); onNext(); } },
        Object.assign(h('i', { class: 'tide-pz-th' }), { style: `background-image:url("${imageUrl(d.next.id, 'Primary', 300)}")` }),
        h('span', {}, h('small', {}, 'UP NEXT'), h('b', {}, d.next.label), h('em', {}, d.next.runtime))) : null;
      el.replaceChildren(
        h('div', { class: 'tide-pz-block' }, poster,
          h('div', { class: 'tide-pz-text' }, h('span', { class: 'tide-pz-kick' }, 'YOU’RE WATCHING'), logo,
            h('div', { class: 'tide-pz-line' }, d.line), h('div', { class: 'tide-pz-meta' }, d.meta), h('p', { class: 'tide-pz-syn' }, d.overview))),
        h('div', { class: 'tide-pz-paused' }, icon('pause_circle'), 'Paused'),
        ...(nx ? [nx] : []));
    },
    arm(paused, blocked) {
      // Called on every player state change (position, buffer, volume...). While still paused and unblocked, an
      // already-running timer must keep running: buffering keeps changing state, and restarting would never fire.
      if (!paused) { clear(); set(false); return; }
      if (blocked) { clear(); return; }
      if (on || timer) return;
      timer = setTimeout(() => { timer = undefined; set(true); }, PAUSE_MS);
    },
    dismiss() { clear(); set(false); },
    isOn: () => on,
    dispose() { clear(); host.classList.remove('tide-pz-on'); },
  };
}
