import { createScroller } from '../src/home/scroller';

function sized(track: HTMLElement, scrollWidth: number, clientWidth: number, scrollLeft = 0) {
  Object.defineProperty(track, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: clientWidth });
  track.scrollLeft = scrollLeft;
}

test('chevrons only for directions that can scroll', () => {
  const s = createScroller('x');
  sized(s.track, 2000, 1000, 0);
  s.sync();
  expect(s.el.classList.contains('can-prev')).toBe(false);
  expect(s.el.classList.contains('can-next')).toBe(true);
  sized(s.track, 2000, 1000, 1000);
  s.sync();
  expect(s.el.classList.contains('can-prev')).toBe(true);
  expect(s.el.classList.contains('can-next')).toBe(false);
  sized(s.track, 800, 1000, 0);
  s.sync();
  expect(s.el.classList.contains('can-prev') || s.el.classList.contains('can-next')).toBe(false);
});

test('chevron pages by 85% of the visible width', () => {
  const s = createScroller('x');
  sized(s.track, 3000, 1000);
  const by = vi.fn();
  s.track.scrollBy = by as unknown as typeof s.track.scrollBy;
  s.el.querySelector<HTMLButtonElement>('.tide-row-chev-next')!.click();
  expect(by).toHaveBeenCalledWith({ left: 850, behavior: 'smooth' });
  s.el.querySelector<HTMLButtonElement>('.tide-row-chev-prev')!.click();
  expect(by).toHaveBeenLastCalledWith({ left: -850, behavior: 'smooth' });
});

function pointer(type: string, x: number, id = 1): Event {
  const e = new Event(type, { bubbles: true }) as Event & Record<string, unknown>;
  Object.assign(e, { pointerType: 'mouse', button: 0, pointerId: id, clientX: x });
  return e;
}

test('mouse drag scrolls the track and flags the following click as a drag', () => {
  const s = createScroller('x');
  sized(s.track, 3000, 1000, 500);
  s.track.dispatchEvent(pointer('pointerdown', 400));
  s.track.dispatchEvent(pointer('pointermove', 403)); // under threshold: no drag yet
  expect(s.track.scrollLeft).toBe(500);
  s.track.dispatchEvent(pointer('pointermove', 300));
  expect(s.track.classList.contains('tide-dragging')).toBe(true);
  expect(s.track.scrollLeft).toBe(600);
  s.track.dispatchEvent(pointer('pointerup', 300));
  expect(s.track.dataset.tideDragged).toBe('1');
  expect(s.track.classList.contains('tide-dragging')).toBe(false);
});

test('a plain click (no movement) is not treated as a drag', () => {
  const s = createScroller('x');
  s.track.dispatchEvent(pointer('pointerdown', 100));
  s.track.dispatchEvent(pointer('pointerup', 101));
  expect(s.track.dataset.tideDragged).toBeUndefined();
});

test('arrow keys move focus to the neighbouring card', () => {
  const s = createScroller('x');
  const cards = [0, 1, 2].map((i) => { const a = document.createElement('a'); a.href = '#'; a.textContent = String(i); a.scrollIntoView = vi.fn(); return a; });
  s.track.append(...cards);
  document.body.append(s.el);
  cards[1]!.focus();
  s.track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(document.activeElement).toBe(cards[2]);
  s.track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(document.activeElement).toBe(cards[2]); // no wrap
  s.track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(document.activeElement).toBe(cards[1]);
  s.el.remove();
});
