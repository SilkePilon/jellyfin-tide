import { imageUrl, getSession } from '../api/client';
import { h, icon } from '../ui/dom';
import { clock, trickplayFrame, type TrickplayInfo } from './format';
import type { Bridge, PlayerState } from './bridge';
import type { Segments } from './segments';

export const IDLE_MS = 3000;
export interface ControlsDeps { bridge: Bridge; onEpisodes(): void; onSettings(): void; onNext(): void; hasNext(): boolean; isSeries(): boolean; onBack?(): void }
export interface Controls {
  el: HTMLElement;
  setItem(info: { logoId: string; title: string; line: string; trickplay?: { id: string; mediaSourceId: string; info: TrickplayInfo } | null; stillId: string }): void;
  setSegments(s: Segments): void;
  update(s: PlayerState): void;
  wake(): void; isIdle(): boolean; setPinned(on: boolean): void; dispose(): void;
}

const btn = (cls: string, name: string, label: string, onClick: () => void) =>
  h('button', { class: `tide-pc-b ${cls}`, type: 'button', 'aria-label': label, onclick: (e: Event) => { e.stopPropagation(); onClick(); } }, icon(name));
const pill = (cls: string, name: string, text: string, onClick: () => void) =>
  h('button', { class: `tide-pc-p ${cls}`, type: 'button', onclick: (e: Event) => { e.stopPropagation(); onClick(); } }, icon(name), text);

export function createControls(deps: ControlsDeps): Controls {
  const { bridge } = deps;
  let state: PlayerState | null = null;
  let segs: Segments = { intro: null, credits: null };
  let trick: { id: string; mediaSourceId: string; info: TrickplayInfo } | null = null;
  let stillId = '';
  let idle = false;
  let pinned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let drag: number | null = null; // seconds while dragging

  const logo = h('img', { class: 'tide-pc-logo', alt: '' }) as HTMLImageElement;
  const titleText = h('span', { class: 'tide-pc-title' });
  const epLine = h('div', { class: 'tide-pc-ep' });
  // Exit the player like the stock OSD's back arrow (leaving #/video stops playback).
  const back = btn('tide-pc-back', 'arrow_back', 'Back', () => (deps.onBack ? deps.onBack() : history.back()));
  const head = h('div', { class: 'tide-pc-hd tide-pc-ui' }, back, h('div', { class: 'tide-pc-hdtx' }, logo, titleText, epLine));

  const buf = h('div', { class: 'tide-pc-buf' });
  const fill = h('div', { class: 'tide-pc-fill' });
  const knob = h('div', { class: 'tide-pc-knob' });
  const segBox = h('div', { class: 'tide-pc-segs' });
  const track = h('div', { class: 'tide-pc-track' }, buf, segBox, fill, knob);
  const tipImg = h('i', { class: 'tide-pc-tipimg' });
  const tipTime = h('span', {});
  const tip = h('div', { class: 'tide-pc-tip' }, tipImg, tipTime);
  const scr = h('div', { class: 'tide-pc-scr' }, track, tip);
  const cur = h('span', { class: 'tide-pc-cur' }, '0:00');
  const rem = h('span', { class: 'tide-pc-rem' }, '−0:00');
  const play = btn('tide-pc-play', 'pause', 'Play/pause', () => bridge.togglePlay());
  const muteBtn = btn('tide-pc-mute', 'volume_up', 'Mute', () => bridge.toggleMute());
  const vol = h('input', { class: 'tide-pc-vol', type: 'range', min: '0', max: '100', 'aria-label': 'Volume', oninput: (e: Event) => bridge.setVolume(Number((e.target as HTMLInputElement).value)) }) as HTMLInputElement;
  vol.addEventListener('click', (e) => e.stopPropagation());
  const epBtn = pill('tide-pc-epbtn', 'video_library', 'Episodes', deps.onEpisodes);
  const nextBtn = pill('tide-pc-next', 'skip_next', 'Next episode', deps.onNext);
  const row = h('div', { class: 'tide-pc-row' },
    play, btn('tide-pc-rw', 'replay_10', 'Back 10 seconds', () => bridge.seekBy(-10)), btn('tide-pc-fw', 'forward_10', 'Forward 10 seconds', () => bridge.seekBy(10)),
    h('div', { class: 'tide-pc-volw' }, muteBtn, vol), h('span', { class: 'tide-pc-sp' }),
    epBtn, nextBtn,
    btn('tide-pc-subs', 'subtitles', 'Subtitles', deps.onSettings), btn('tide-pc-set', 'tune', 'Settings', deps.onSettings),
    btn('tide-pc-full', 'fullscreen', 'Full screen', () => bridge.fullscreen()));
  const bottom = h('div', { class: 'tide-pc-bt tide-pc-ui' }, scr, h('div', { class: 'tide-pc-times' }, cur, rem), row);
  const skip = h('div', { class: 'tide-pc-skip tide-pc-float' },
    h('button', { class: 'tide-pc-p tide-pc-w', type: 'button', onclick: (e: Event) => { e.stopPropagation(); if (segs.intro) bridge.seek(segs.intro[1]); } }, icon('fast_forward'), 'Skip intro'));
  const centre = h('div', { class: 'tide-pc-ctr tide-pc-ui' },
    btn('', 'replay_10', 'Back 10 seconds', () => bridge.seekBy(-10)), btn('tide-pc-big', 'pause', 'Play/pause', () => bridge.togglePlay()), btn('', 'forward_10', 'Forward 10 seconds', () => bridge.seekBy(10)));
  const el = h('div', { class: 'tide-pc' }, h('div', { class: 'tide-pc-shade tide-pc-ui' }), head, centre, skip, bottom);

  const host = () => el.parentElement;
  const setIdle = (on: boolean) => {
    idle = on;
    host()?.classList.toggle('tide-pc-idle', on);
    document.documentElement.classList.toggle('tide-player-idle', on);
  };
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (pinned || !state || state.paused) return;
    timer = setTimeout(() => setIdle(true), IDLE_MS);
  };
  const wake = () => { if (idle) setIdle(false); arm(); };

  const pctOf = (sec: number) => (state && state.duration > 0 ? Math.max(0, Math.min(100, (sec / state.duration) * 100)) : 0);
  const paintTime = (pos: number) => {
    if (!state) return;
    fill.style.transform = `scaleX(${pctOf(pos) / 100})`;
    knob.style.left = `${pctOf(pos)}%`;
    cur.textContent = clock(pos);
    rem.textContent = `−${clock(Math.max(0, state.duration - pos))}`;
  };
  const paintSegs = () => {
    segBox.replaceChildren();
    if (!state || state.duration <= 0) return;
    const add = (a: number, b: number) => { const s = h('i', { class: 'tide-pc-seg' }); s.style.left = `${pctOf(a)}%`; s.style.width = `${Math.max(0.4, pctOf(b) - pctOf(a))}%`; segBox.append(s); };
    if (segs.intro) add(segs.intro[0], segs.intro[1]);
    if (segs.credits !== null && segs.credits < state.duration) add(segs.credits, state.duration);
  };

  const at = (clientX: number) => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1))) * (state?.duration ?? 0);
  };
  const showTip = (sec: number, clientX: number) => {
    const r = track.getBoundingClientRect();
    tip.style.left = `${Math.max(0, Math.min(r.width, clientX - r.left))}px`;
    tipTime.textContent = clock(sec);
    const server = getSession()?.server ?? '';
    if (trick) {
      const f = trickplayFrame(sec, trick.info);
      tipImg.style.backgroundImage = `url("${server}/Videos/${trick.id}/Trickplay/${trick.info.Width}/${f.image}.jpg?mediaSourceId=${trick.mediaSourceId}")`;
      tipImg.style.backgroundPosition = `-${f.x}px -${f.y}px`;
      tipImg.style.backgroundSize = 'auto';
    } else {
      tipImg.style.backgroundImage = `url("${imageUrl(stillId, 'Primary', 320)}")`;
      tipImg.style.backgroundPosition = 'center';
      tipImg.style.backgroundSize = 'cover';
    }
  };
  track.addEventListener('pointermove', (e) => { if (drag === null) showTip(at(e.clientX), e.clientX); });
  const onMove = (e: PointerEvent) => { if (drag === null) return; drag = at(e.clientX); paintTime(drag); showTip(drag, e.clientX); };
  const onUp = (e: PointerEvent) => {
    if (drag === null) return;
    drag = at(e.clientX);
    bridge.seek(drag);
    drag = null;
    scr.classList.remove('drag');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
  track.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    drag = at(e.clientX);
    scr.classList.add('drag');
    paintTime(drag);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
  // The scrubber area must not toggle play.
  scr.addEventListener('click', (e) => e.stopPropagation());

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const map: Record<string, () => void> = {
      ' ': () => bridge.togglePlay(), k: () => bridge.togglePlay(),
      ArrowLeft: () => bridge.seekBy(-10), j: () => bridge.seekBy(-10),
      ArrowRight: () => bridge.seekBy(10), l: () => bridge.seekBy(10),
      e: deps.onEpisodes, s: deps.onSettings, f: () => bridge.fullscreen(), m: () => bridge.toggleMute(), n: deps.onNext,
    };
    const fn = map[k];
    wake();
    if (!fn) return;
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  document.addEventListener('keydown', onKey, true);
  el.addEventListener('pointermove', wake);

  return {
    el,
    setItem(info) {
      logo.hidden = false;
      logo.src = imageUrl(info.logoId, 'Logo', 600);
      logo.onerror = () => { logo.hidden = true; titleText.textContent = info.title; };
      titleText.textContent = '';
      epLine.textContent = info.line;
      trick = info.trickplay ?? null;
      stillId = info.stillId;
      epBtn.hidden = !deps.isSeries();
      nextBtn.hidden = !deps.hasNext();
    },
    setSegments(s) { segs = s; paintSegs(); },
    update(s) {
      const durChanged = !state || state.duration !== s.duration;
      const pausedChanged = !state || state.paused !== s.paused;
      state = s;
      if (durChanged) paintSegs();
      if (drag === null) paintTime(s.position);
      if (s.buffered !== null && s.duration > 0) buf.style.transform = `scaleX(${Math.min(1, (s.position + s.buffered) / s.duration)})`;
      const iconName = s.paused ? 'play_arrow' : 'pause';
      el.querySelectorAll('.tide-pc-play, .tide-pc-big').forEach((b) => b.replaceChildren(icon(iconName)));
      muteBtn.replaceChildren(icon(s.muted || s.volume === 0 ? 'volume_off' : 'volume_up'));
      if (document.activeElement !== vol) vol.value = String(s.volume);
      skip.classList.toggle('show', !!segs.intro && s.position >= segs.intro[0] && s.position < segs.intro[1]);
      nextBtn.hidden = !deps.hasNext();
      if (pausedChanged) { if (s.paused) wake(); else arm(); }
    },
    wake,
    isIdle: () => idle,
    setPinned(on) { pinned = on; if (on) wake(); else arm(); },
    dispose() {
      if (timer) clearTimeout(timer);
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.classList.remove('tide-player-idle');
    },
  };
}
