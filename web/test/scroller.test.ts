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

test('chevron pages by whole cards with the eased animator', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
  const s = createScroller('x');
  sized(s.track, 4000, 1000);
  s.track.getBoundingClientRect = () => ({ left: 0, right: 1000, width: 1000 } as DOMRect);
  for (let i = 0; i < 10; i++) {
    const c = document.createElement('a');
    c.getBoundingClientRect = () => ({ left: i * 400 - s.track.scrollLeft, right: i * 400 + 380 - s.track.scrollLeft, width: 380 } as DOMRect);
    s.track.append(c);
  }
  s.el.querySelector<HTMLButtonElement>('.tide-row-chev-next')!.click();
  vi.advanceTimersByTime(100);
  expect(s.track.scrollLeft).toBeGreaterThan(0);
  expect(s.track.scrollLeft).toBeLessThan(800);
  vi.advanceTimersByTime(700);
  expect(s.track.scrollLeft).toBe(800);
  s.el.querySelector<HTMLButtonElement>('.tide-row-chev-prev')!.click();
  vi.advanceTimersByTime(800);
  expect(s.track.scrollLeft).toBe(0);
  vi.useRealTimers();
});

test('pointer down cancels a running glide', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
  const s = createScroller('x');
  sized(s.track, 4000, 1000);
  s.track.getBoundingClientRect = () => ({ left: 0, right: 1000, width: 1000 } as DOMRect);
  for (let i = 0; i < 10; i++) {
    const c = document.createElement('a');
    c.getBoundingClientRect = () => ({ left: i * 400 - s.track.scrollLeft, right: i * 400 + 380 - s.track.scrollLeft, width: 380 } as DOMRect);
    s.track.append(c);
  }
  s.el.querySelector<HTMLButtonElement>('.tide-row-chev-next')!.click();
  vi.advanceTimersByTime(60);
  s.track.dispatchEvent(pointer('pointerdown', 10));
  const at = s.track.scrollLeft;
  vi.advanceTimersByTime(800);
  expect(s.track.scrollLeft).toBe(at);
  vi.useRealTimers();
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
  const cards = [0, 1, 2].map((i) => { const a = document.createElement('a'); a.href = '#'; a.textContent = String(i); return a; });
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
