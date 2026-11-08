import { initSmoothScroll, isMouseNotch, scrollTarget, wheelPixels } from '../src/theme/smoothScroll';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: true, heroSlotSeconds: 30, newDays: 14, version: 't' };
const wheel = (init: WheelEventInit) => new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });

function scroller(h = 3000, ch = 1000, overflow = 'auto'): HTMLElement {
  const el = document.createElement('div');
  el.style.overflowY = overflow;
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: h });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: ch });
  document.body.append(el);
  return el;
}

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); delete (window as any).matchMedia; });

test('mouse notch vs trackpad', () => {
  expect(isMouseNotch(wheel({ deltaY: 100 }))).toBe(true);
  expect(isMouseNotch(wheel({ deltaY: 120 }))).toBe(true);
  expect(isMouseNotch(wheel({ deltaY: 3, deltaMode: 1 }))).toBe(true);
  expect(isMouseNotch(wheel({ deltaY: 4.5 }))).toBe(false);
  expect(isMouseNotch(wheel({ deltaY: 12 }))).toBe(false);
  expect(isMouseNotch(wheel({ deltaY: 53.5 }))).toBe(false);
});

test('wheel pixels: lines and pages', () => {
  const el = scroller();
  expect(wheelPixels(wheel({ deltaY: 100 }), el, 'y')).toBe(100);
  expect(wheelPixels(wheel({ deltaY: 3, deltaMode: 1 }), el, 'y')).toBe(120);
  expect(wheelPixels(wheel({ deltaY: 1, deltaMode: 2 }), el, 'y')).toBe(900);
});

test('nearest scrollable ancestor that can move; passes through at limits', () => {
  const outer = scroller();
  const inner = document.createElement('div');
  inner.style.overflowY = 'auto';
  Object.defineProperty(inner, 'scrollHeight', { configurable: true, value: 500 });
  Object.defineProperty(inner, 'clientHeight', { configurable: true, value: 200 });
  const leaf = document.createElement('span');
  inner.append(leaf);
  outer.append(inner);
  expect(scrollTarget(leaf, 'y', 1)).toBe(inner);
  inner.scrollTop = 300; // at its bottom
  expect(scrollTarget(leaf, 'y', 1)).toBe(outer);
  expect(scrollTarget(leaf, 'y', -1)).toBe(inner);
});

test('a notch eases the page over several frames and lands one notch further', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
  const el = scroller();
  const leaf = document.createElement('p');
  el.append(leaf);
  const stop = initSmoothScroll(cfg);
  const e = wheel({ deltaY: 100 });
  leaf.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
  vi.advanceTimersByTime(48);
  expect(el.scrollTop).toBeGreaterThan(0);
  expect(el.scrollTop).toBeLessThan(100);
  leaf.dispatchEvent(wheel({ deltaY: 100 })); // accumulates
  vi.advanceTimersByTime(600);
  expect(el.scrollTop).toBe(200);
  stop();
});

test('left alone: trackpad, ctrl-zoom, native-scroll opt-out, form controls', () => {
  const el = scroller();
  const stop = initSmoothScroll(cfg);
  const leaf = document.createElement('p');
  el.append(leaf);
  for (const e of [wheel({ deltaY: 4.5 }), wheel({ deltaY: 100, ctrlKey: true })]) {
    leaf.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  }
  const opt = document.createElement('div');
  opt.setAttribute('data-tide-native-scroll', '');
  el.append(opt);
  const e2 = wheel({ deltaY: 100 });
  opt.dispatchEvent(e2);
  expect(e2.defaultPrevented).toBe(false);
  const sel = document.createElement('select');
  el.append(sel);
  const e3 = wheel({ deltaY: 100 });
  sel.dispatchEvent(e3);
  expect(e3.defaultPrevented).toBe(false);
  stop();
});

test('off under reduced motion and when the setting is off', () => {
  const el = scroller();
  const leaf = document.createElement('p');
  el.append(leaf);
  const stop1 = initSmoothScroll({ ...cfg, enableSmoothScroll: false });
  const e1 = wheel({ deltaY: 100 });
  leaf.dispatchEvent(e1);
  expect(e1.defaultPrevented).toBe(false);
  stop1();
  (window as any).matchMedia = (q: string) => ({ matches: q.includes('reduce') });
  const stop2 = initSmoothScroll(cfg);
  const e2 = wheel({ deltaY: 100 });
  leaf.dispatchEvent(e2);
  expect(e2.defaultPrevented).toBe(false);
  stop2();
});

test('shift+wheel over a Tide row eases the row horizontally', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
  const track = document.createElement('div');
  track.className = 'tide-row-track';
  track.style.overflowX = 'auto';
  Object.defineProperty(track, 'scrollWidth', { configurable: true, value: 4000 });
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: 1000 });
  document.body.append(track);
  const stop = initSmoothScroll(cfg);
  const e = wheel({ deltaY: 100, shiftKey: true });
  track.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
  vi.advanceTimersByTime(600);
  expect(track.scrollLeft).toBe(100);
  stop();
});

test('body with overflow:auto resolves to the document scroller, not body', () => {
  document.body.style.overflowY = 'auto';
  const root = (document.scrollingElement ?? document.documentElement) as HTMLElement;
  Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 4000 });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: 900 });
  Object.defineProperty(document.body, 'scrollHeight', { configurable: true, value: 4000 });
  Object.defineProperty(document.body, 'clientHeight', { configurable: true, value: 900 });
  const leaf = document.createElement('p');
  document.body.append(leaf);
  expect(scrollTarget(leaf, 'y', 1)).toBe(root);
  document.body.style.overflowY = '';
  delete (root as any).scrollHeight; delete (root as any).clientHeight;
  delete (document.body as any).scrollHeight; delete (document.body as any).clientHeight;
});
