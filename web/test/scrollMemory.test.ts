import { restoreScroll, savedHomeScroll, trackHomeScroll } from '../src/home/scrollMemory';

test('home position is saved per history entry at user input, not by later programmatic scrolls', () => {
  history.replaceState({ key: 'home1', idx: 1 }, '');
  const stop = trackHomeScroll(() => true);
  Object.defineProperty(window, 'scrollY', { value: 1330, configurable: true });
  window.dispatchEvent(new Event('pointerdown'));
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true }); // jellyfin's scroll-to-top
  window.dispatchEvent(new Event('scroll'));
  stop();
  expect(savedHomeScroll()).toBe(1330);
  history.replaceState({ key: 'other', idx: 2 }, '');
  expect(savedHomeScroll()).toBeNull(); // a fresh visit starts at the top
  history.replaceState({ key: 'home1', idx: 1 }, '');
  const to = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  restoreScroll(1330, 1);
  expect(to).toHaveBeenCalledWith(0, 1330);
});
