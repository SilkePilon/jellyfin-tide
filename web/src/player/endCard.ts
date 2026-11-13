import { imageUrl } from '../api/client';
import { h, icon } from '../ui/dom';

export const COUNTDOWN_S = 10;
/** Position updates arrive about once a second on Jellyfin Desktop; without one for longer, playback has stalled. */
export const STALE_S = 1.5;
export interface EndCard {
  el: HTMLElement;
  setNext(n: { id: string; title: string; runtime: string; stillId: string } | null, autoplay: boolean): void;
  update(position: number, creditsAt: number | null, playing: boolean, dt: number): void;
  isShowing(): boolean; dispose(): void;
}
const NS = 'http://www.w3.org/2000/svg';

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
  let running = false; // the countdown was running at the last update
  let lastAt = 0;
  let raf = 0;
  const go = () => { if (fired) return; fired = true; onPlayNext(); };
  // The ring is drawn every frame from the countdown, up to STALE_S past the last update, so it fills smoothly
  // between the player's coarse position updates and never runs ahead of a stalled or paused video.
  const paint = () => {
    raf = 0;
    if (!showing || !arc) return;
    const ahead = running ? Math.min((performance.now() - lastAt) / 1000, STALE_S) : 0;
    arc.setAttribute('stroke-dashoffset', String((Math.max(0, left - ahead) / COUNTDOWN_S) * 100));
    if (running) raf = requestAnimationFrame(paint);
  };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  return {
    el,
    setNext(n, auto) {
      next = n; autoplay = auto; left = COUNTDOWN_S; dismissed = false; fired = false; running = false; stop();
      el.replaceChildren();
      cd = null; arc = null;
      if (!n) return;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 48 48');
      for (const cls of ['tide-end-tr', 'tide-end-ar']) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', '24'); c.setAttribute('cy', '24'); c.setAttribute('r', '20'); c.setAttribute('class', cls);
        c.setAttribute('pathLength', '100'); c.setAttribute('stroke-dasharray', '100 100'); c.setAttribute('stroke-dashoffset', '100');
        svg.append(c);
        if (cls === 'tide-end-ar') arc = c;
      }
      const th = h('button', { class: 'tide-end-th', type: 'button', 'aria-label': `Play ${n.title}`, onclick: (e: Event) => { e.stopPropagation(); go(); } },
        h('span', { class: `tide-end-ring${auto ? '' : ' noring'}` }, svg as unknown as Node, icon('play_arrow')));
      th.style.backgroundImage = `url("${imageUrl(n.stillId, 'Primary', 400)}")`;
      cd = h('small', { class: 'tide-end-cd' });
      el.append(h('div', { class: 'tide-end-card' }, th,
        h('div', { class: 'tide-end-tx' }, cd, h('b', {}, n.title), h('small', {}, n.runtime),
          h('button', { class: 'tide-end-wc', type: 'button', onclick: (e: Event) => { e.stopPropagation(); dismissed = true; el.classList.remove('show'); showing = false; stop(); } }, 'Watch credits'))));
    },
    update(position, creditsAt, playing, dt) {
      const want = !!next && !dismissed && creditsAt !== null && position >= creditsAt;
      if (want !== showing) {
        showing = want; el.classList.toggle('show', want); document.querySelector('.tide-player')?.classList.toggle('tide-end-on', want);
        running = false; // time spent before (re)showing does not count
      }
      if (!want || !cd) { stop(); return; }
      // dt is the time since the previous update, spent in that update's state; a stall counts at most STALE_S.
      if (running) left = Math.max(0, left - Math.min(dt, STALE_S));
      running = playing && autoplay;
      lastAt = performance.now();
      cd.textContent = autoplay ? `Next episode in ${Math.ceil(left)}s` : 'Up next';
      stop(); paint();
      if (autoplay && left <= 0) go();
    },
    isShowing: () => showing,
    dispose() { stop(); document.querySelector('.tide-player')?.classList.remove('tide-end-on'); },
  };
}
