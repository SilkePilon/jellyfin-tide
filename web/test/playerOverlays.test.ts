import { createEndCard, COUNTDOWN_S } from '../src/player/endCard';
import { createPausedScreen, PAUSE_MS } from '../src/player/paused';

beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' }; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

test('paused screen appears after 4 s paused, not when blocked, and dismisses', () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  const pz = createPausedScreen(host);
  host.append(pz.el);
  const onNext = vi.fn();
  pz.setItem({ posterId: 'ser', logoId: 'ser', line: 'S3 · E1 · Who Are You?', meta: '2026 · 51m · 38m left', overview: 'x', next: { id: 'e2', label: '2. It’s All Good', runtime: '51m' } }, onNext);
  pz.arm(true, false);
  vi.advanceTimersByTime(PAUSE_MS - 10);
  expect(pz.isOn()).toBe(false);
  vi.advanceTimersByTime(20);
  expect(pz.isOn()).toBe(true);
  expect(host.classList.contains('tide-pz-on')).toBe(true);
  expect(pz.el.querySelector('.tide-pz-line')?.textContent).toBe('S3 · E1 · Who Are You?');
  pz.el.querySelector<HTMLElement>('[data-pz-next]')!.click();
  expect(onNext).toHaveBeenCalled();
  pz.dismiss();
  expect(pz.isOn()).toBe(false);
  pz.arm(true, true);
  vi.advanceTimersByTime(PAUSE_MS * 2);
  expect(pz.isOn()).toBe(false);
});

test('end card: shows at credits, counts down only while playing with autoplay, plays next once', () => {
  const next = vi.fn();
  const c = createEndCard(next);
  document.body.append(c.el);
  c.setNext({ id: 'e2', title: '2. It’s All Good', runtime: '51m', stillId: 'e2' }, true);
  const card = c.el.querySelector('.tide-end-card')!;
  c.update(100, 2900, true, 0.1);
  expect(c.isShowing()).toBe(false);
  c.update(2900, 2900, true, 0.1);
  expect(c.isShowing()).toBe(true);
  expect(c.el.querySelector('.tide-end-cd')?.textContent).toBe('Next episode in 10s');
  c.update(2901, 2900, false, 5); // paused: no countdown
  expect(c.el.querySelector('.tide-end-cd')?.textContent).toBe('Next episode in 10s');
  for (let i = 0; i < 12; i++) c.update(2902 + i, 2900, true, 1);
  expect(next).toHaveBeenCalledTimes(1);
  expect(c.el.querySelector('.tide-end-card')).toBe(card); // built once
});

test('end card: Watch credits dismisses; no autoplay = no countdown', () => {
  const next = vi.fn();
  const c = createEndCard(next);
  c.setNext({ id: 'e2', title: 'T', runtime: '1m', stillId: 'e2' }, false);
  c.update(10, 5, true, 20);
  expect(c.isShowing()).toBe(true);
  expect(c.el.querySelector('.tide-end-cd')?.textContent).toBe('Up next');
  expect(next).not.toHaveBeenCalled();
  c.el.querySelector<HTMLElement>('.tide-end-wc')!.click();
  c.update(11, 5, true, 1);
  expect(c.isShowing()).toBe(false);
  expect(COUNTDOWN_S).toBe(10);
});
