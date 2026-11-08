import { imageUrl } from '../api/client';
import { h, icon } from '../ui/dom';

export const COUNTDOWN_S = 10;
export interface EndCard {
  el: HTMLElement;
  setNext(n: { id: string; title: string; runtime: string; stillId: string } | null, autoplay: boolean): void;
  update(position: number, creditsAt: number | null, playing: boolean, dt: number): void;
  isShowing(): boolean; dispose(): void;
}
const NS = 'http://www.w3.org/2000/svg';
const C = 2 * Math.PI * 20;

export function createEndCard(onPlayNext: () => void): EndCard {
  const el = h('div', { class: 'tide-end tide-pc-float' });
  let next: { id: string } | null = null;
  let autoplay = true;
  let left = COUNTDOWN_S;
  let dismissed = false;
  let fired = false;
  let showing = false;
  let cd: HTMLElement | null = null;
  let arc: SVGCircleElement | null = null;
  const go = () => { if (fired) return; fired = true; onPlayNext(); };
  return {
    el,
    setNext(n, auto) {
      next = n; autoplay = auto; left = COUNTDOWN_S; dismissed = false; fired = false;
      el.replaceChildren();
      cd = null; arc = null;
      if (!n) return;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 48 48');
      for (const cls of ['tide-end-tr', 'tide-end-ar']) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', '24'); c.setAttribute('cy', '24'); c.setAttribute('r', '20'); c.setAttribute('class', cls);
        svg.append(c);
        if (cls === 'tide-end-ar') arc = c;
      }
      const th = h('button', { class: 'tide-end-th', type: 'button', 'aria-label': `Play ${n.title}`, onclick: (e: Event) => { e.stopPropagation(); go(); } },
        h('span', { class: `tide-end-ring${auto ? '' : ' noring'}` }, svg as unknown as Node, icon('play_arrow')));
      th.style.backgroundImage = `url("${imageUrl(n.stillId, 'Primary', 400)}")`;
      cd = h('small', { class: 'tide-end-cd' });
      el.append(h('div', { class: 'tide-end-card' }, th,
        h('div', { class: 'tide-end-tx' }, cd, h('b', {}, n.title), h('small', {}, n.runtime),
          h('button', { class: 'tide-end-wc', type: 'button', onclick: (e: Event) => { e.stopPropagation(); dismissed = true; el.classList.remove('show'); showing = false; } }, 'Watch credits'))));
    },
    update(position, creditsAt, playing, dt) {
      const want = !!next && !dismissed && creditsAt !== null && position >= creditsAt;
      if (want !== showing) { showing = want; el.classList.toggle('show', want); document.querySelector('.tide-player')?.classList.toggle('tide-end-on', want); }
      if (!want || !cd) return;
      if (playing && autoplay) left = Math.max(0, left - dt);
      cd.textContent = autoplay ? `Next episode in ${Math.ceil(left)}s` : 'Up next';
      arc?.setAttribute('stroke-dasharray', `${C * (1 - left / COUNTDOWN_S)} ${C}`);
      if (autoplay && left <= 0) go();
    },
    isShowing: () => showing,
    dispose() { document.querySelector('.tide-player')?.classList.remove('tide-end-on'); },
  };
}
