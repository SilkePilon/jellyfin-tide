import { initScrollingState, INPUT_WINDOW_MS, SCROLL_IDLE_MS } from '../src/theme/scrolling';

afterEach(() => { vi.useRealTimers(); document.documentElement.className = ''; });

test('user-driven scroll sets tide-is-scrolling (page or row) and clears after idle', () => {
  vi.useFakeTimers();
  let now = 1000;
  const stop = initScrollingState(() => now);
  const root = document.documentElement;
  document.dispatchEvent(new Event('wheel'));
  document.dispatchEvent(new Event('scroll'));
  expect(root.classList.contains('tide-is-scrolling')).toBe(true);
  vi.advanceTimersByTime(SCROLL_IDLE_MS - 20);
  const row = document.createElement('div');
  document.body.append(row);
  row.dispatchEvent(new Event('scroll')); // non-bubbling element scroll still seen (capture)
  vi.advanceTimersByTime(SCROLL_IDLE_MS - 20);
  expect(root.classList.contains('tide-is-scrolling')).toBe(true);
  vi.advanceTimersByTime(40);
  expect(root.classList.contains('tide-is-scrolling')).toBe(false);
  stop();
  row.remove();
});

test('layout-driven scroll (no recent input, e.g. a row re-snapping on hover) is ignored', () => {
  vi.useFakeTimers();
  let now = 1000;
  const stop = initScrollingState(() => now);
  document.dispatchEvent(new Event('scroll'));
  expect(document.documentElement.classList.contains('tide-is-scrolling')).toBe(false);
  document.dispatchEvent(new Event('pointerdown'));
  now += INPUT_WINDOW_MS + 50;
  document.dispatchEvent(new Event('scroll'));
  expect(document.documentElement.classList.contains('tide-is-scrolling')).toBe(false);
  stop();
});
