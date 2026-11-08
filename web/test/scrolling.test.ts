import { initScrollingState, SCROLL_IDLE_MS } from '../src/theme/scrolling';

test('html gets tide-is-scrolling during page or element scroll and loses it after idle', () => {
  vi.useFakeTimers();
  const stop = initScrollingState();
  const root = document.documentElement;
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
  vi.useRealTimers();
});
