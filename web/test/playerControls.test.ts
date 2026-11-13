import { createControls, IDLE_MS } from '../src/player/controls';
import type { PlayerState } from '../src/player/bridge';

beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' }; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.documentElement.className = ''; });

function setup() {
  const bridge = { seek: vi.fn(), seekBy: vi.fn(), togglePlay: vi.fn(), fullscreen: vi.fn(), toggleMute: vi.fn(), setVolume: vi.fn(), read: () => st } as any;
  const deps = { bridge, onEpisodes: vi.fn(), onSettings: vi.fn(), onSubtitles: vi.fn(), onNext: vi.fn(), hasNext: () => true, isSeries: () => true };
  const c = createControls(deps);
  const host = document.createElement('div'); host.className = 'tide-player'; host.append(c.el); document.body.append(host);
  c.setItem({ logoId: 'ser', title: 'Silo', line: 'S3 · E1 · Who Are You?', stillId: 'e1' });
  return { c, deps, bridge, host };
}
let st: PlayerState = { percent: 0, position: 50, duration: 3000, paused: false, muted: false, volume: 80, buffered: 10, hasVideo: true };

test('renders L1 text and times; update changes text only (same nodes)', () => {
  const { c } = setup();
  expect(c.el.querySelector('.tide-pc-ep')?.textContent).toBe('S3 · E1 · Who Are You?');
  const cur = c.el.querySelector('.tide-pc-cur')!;
  c.update({ ...st, position: 60 });
  expect(cur.textContent).toBe('1:00');
  expect(c.el.querySelector('.tide-pc-cur')).toBe(cur);
  expect(c.el.querySelector('.tide-pc-rem')?.textContent).toBe('−49:00');
});

test('idle after 3 s while playing; wake shows; pinned never hides', () => {
  vi.useFakeTimers();
  const { c, host } = setup();
  c.update(st);
  c.wake();
  vi.advanceTimersByTime(IDLE_MS + 10);
  expect(c.isIdle()).toBe(true);
  expect(host.classList.contains('tide-pc-idle')).toBe(true);
  expect(document.documentElement.classList.contains('tide-player-idle')).toBe(true);
  c.wake();
  expect(c.isIdle()).toBe(false);
  c.setPinned(true);
  vi.advanceTimersByTime(IDLE_MS * 3);
  expect(c.isIdle()).toBe(false);
  c.setPinned(false);
  c.update({ ...st, paused: true });
  vi.advanceTimersByTime(IDLE_MS * 3);
  expect(c.isIdle()).toBe(false); // never hides while paused
});

test('pressing a control restarts the hide delay (a still mouse sends no pointermove)', () => {
  vi.useFakeTimers();
  const { c } = setup();
  c.update(st);
  c.wake();
  const back = c.el.querySelector<HTMLElement>('.tide-pc-rw')!;
  const scrub = c.el.querySelector<HTMLElement>('.tide-pc-track')!;
  for (const target of [back, back, scrub]) {
    vi.advanceTimersByTime(IDLE_MS - 500);
    target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  }
  vi.advanceTimersByTime(IDLE_MS - 500);
  expect(c.isIdle()).toBe(false);
  vi.advanceTimersByTime(600);
  expect(c.isIdle()).toBe(true);
  // Pressing the bare video surface is not a control press: it must not wake (touch taps toggle the controls).
  c.el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(c.isIdle()).toBe(true);
});

test('hide() (a touch tap) is real idle: the next tap or control press brings them back at once', () => {
  vi.useFakeTimers();
  const { c, host } = setup();
  c.update(st);
  c.wake();
  vi.advanceTimersByTime(500);
  c.hide();
  expect(c.isIdle()).toBe(true);
  expect(host.classList.contains('tide-pc-idle')).toBe(true);
  c.wake();
  expect(host.classList.contains('tide-pc-idle')).toBe(false);
  c.hide();
  vi.advanceTimersByTime(IDLE_MS * 2); // the pending hide delay must not undo or redo anything
  expect(c.isIdle()).toBe(true);
  c.el.querySelector('.tide-pc-rw')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(host.classList.contains('tide-pc-idle')).toBe(false);
});

test('skip intro shows inside the intro and seeks to its end', () => {
  const { c, bridge } = setup();
  c.setSegments({ skips: [{ kind: 'intro', start: 45, end: 95 }], credits: 2960 });
  c.update({ ...st, position: 50 });
  const skip = c.el.querySelector<HTMLButtonElement>('.tide-pc-skip')!;
  expect(skip.classList.contains('show')).toBe(true);
  skip.querySelector('button')!.click();
  expect(bridge.seek).toHaveBeenCalledWith(95);
  c.update({ ...st, position: 120 });
  expect(skip.classList.contains('show')).toBe(false);
  expect(c.el.querySelectorAll('.tide-pc-seg').length).toBe(2);
});

test('the skip pill covers recaps, previews and commercials too, labelled by type', () => {
  const { c, bridge } = setup();
  c.setSegments({ skips: [{ kind: 'recap', start: 0, end: 40 }, { kind: 'commercial', start: 600, end: 660 }], credits: null });
  const skip = c.el.querySelector<HTMLElement>('.tide-pc-skip')!;
  c.update({ ...st, position: 10 });
  expect(skip.classList.contains('show')).toBe(true);
  expect(skip.textContent).toContain('Skip recap');
  c.update({ ...st, position: 620 });
  expect(skip.textContent).toContain('Skip commercial');
  skip.querySelector('button')!.click();
  expect(bridge.seek).toHaveBeenCalledWith(660);
  c.update({ ...st, position: 300 });
  expect(skip.classList.contains('show')).toBe(false);
  expect(c.el.querySelectorAll('.tide-pc-seg').length).toBe(2);
});

test('keyboard map', () => {
  const { deps, bridge } = setup();
  const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key(' '); key('k'); key('ArrowLeft'); key('l'); key('e'); key('s'); key('f'); key('m'); key('n');
  expect(bridge.togglePlay).toHaveBeenCalledTimes(2);
  expect(bridge.seekBy).toHaveBeenNthCalledWith(1, -10);
  expect(bridge.seekBy).toHaveBeenNthCalledWith(2, 10);
  expect(deps.onEpisodes).toHaveBeenCalled();
  expect(deps.onSettings).toHaveBeenCalled();
  expect(bridge.fullscreen).toHaveBeenCalled();
  expect(bridge.toggleMute).toHaveBeenCalled();
  expect(deps.onNext).toHaveBeenCalled();
});

test('scrubber: drag previews locally and seeks once on release', () => {
  const { c, bridge } = setup();
  c.update(st);
  const track = c.el.querySelector<HTMLElement>('.tide-pc-track')!;
  track.getBoundingClientRect = () => ({ left: 100, width: 1000, top: 0, height: 6, right: 1100, bottom: 6 } as DOMRect);
  const ev = (t: string, x: number) => track.dispatchEvent(Object.assign(new Event(t, { bubbles: true }), { clientX: x, pointerId: 1, button: 0 }));
  ev('pointerdown', 600);
  ev('pointermove', 700);
  expect(c.el.querySelector('.tide-pc-cur')?.textContent).toBe('30:00');
  expect(bridge.seek).not.toHaveBeenCalled();
  document.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 700, pointerId: 1 }));
  expect(bridge.seek).toHaveBeenCalledWith(1800);
});

test('back button exits via onBack (default: history.back)', () => {
  const onBack = vi.fn();
  const bridge = { seek: vi.fn(), seekBy: vi.fn(), togglePlay: vi.fn() } as any;
  const c = createControls({ bridge, onEpisodes: vi.fn(), onSettings: vi.fn(), onSubtitles: vi.fn(), onNext: vi.fn(), hasNext: () => false, isSeries: () => false, onBack });
  document.body.append(c.el);
  c.el.querySelector<HTMLButtonElement>('.tide-pc-back')!.click();
  expect(onBack).toHaveBeenCalled();
  c.dispose();
});

test('subtitles button and the c key call onSubtitles; anchors and visibility', () => {
  const { c, deps } = setup() as any;
  document.querySelector<HTMLElement>('.tide-pc-subs')!.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
  expect(deps.onSubtitles).toHaveBeenCalledTimes(2);
  expect(c.anchor('subs')).toBe(document.querySelector('.tide-pc-subs'));
  expect(c.anchor('set')).toBe(document.querySelector('.tide-pc-set'));
  c.setSubsVisible(false);
  expect(document.querySelector<HTMLElement>('.tide-pc-subs')!.hidden).toBe(true);
});
