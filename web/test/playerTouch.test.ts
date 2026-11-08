import { attachTouch, DOUBLE_TAP_MS } from '../src/player/touch';

function layer() {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 } as DOMRect);
  document.body.append(el);
  return el;
}
const tp = (el: Element, type: string, x: number, y = 250) => el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerType: 'touch', clientX: x, clientY: y, pointerId: 1 }));
const tap = (el: Element, x: number) => { tp(el, 'pointerdown', x); tp(el, 'pointerup', x); };

test('tap toggles controls after the double-tap window; double-tap zones seek or play', () => {
  vi.useFakeTimers();
  const el = layer();
  const d = { toggleControls: vi.fn(), togglePlay: vi.fn(), seekBy: vi.fn(), openShelf: vi.fn(), ripple: vi.fn() };
  const stop = attachTouch(el, d);
  tap(el, 500);
  expect(d.toggleControls).not.toHaveBeenCalled();
  vi.advanceTimersByTime(DOUBLE_TAP_MS + 10);
  expect(d.toggleControls).toHaveBeenCalledTimes(1);
  tap(el, 100); tap(el, 100);
  expect(d.seekBy).toHaveBeenLastCalledWith(-10);
  expect(d.ripple).toHaveBeenLastCalledWith(-1);
  tap(el, 900); tap(el, 900);
  expect(d.seekBy).toHaveBeenLastCalledWith(10);
  tap(el, 500); tap(el, 500);
  expect(d.togglePlay).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(DOUBLE_TAP_MS * 2);
  expect(d.toggleControls).toHaveBeenCalledTimes(1);
  stop();
  vi.useRealTimers();
});

test('swipe up opens the shelf; taps on controls are ignored', () => {
  vi.useFakeTimers();
  const el = layer();
  const btn = document.createElement('button');
  btn.className = 'tide-pc-b';
  el.append(btn);
  const d = { toggleControls: vi.fn(), togglePlay: vi.fn(), seekBy: vi.fn(), openShelf: vi.fn(), ripple: vi.fn() };
  attachTouch(el, d);
  tp(el, 'pointerdown', 500, 400); tp(el, 'pointermove', 500, 300); tp(el, 'pointerup', 500, 300);
  expect(d.openShelf).toHaveBeenCalled();
  tap(btn, 500);
  vi.advanceTimersByTime(DOUBLE_TAP_MS + 10);
  expect(d.toggleControls).not.toHaveBeenCalled();
  vi.useRealTimers();
});
