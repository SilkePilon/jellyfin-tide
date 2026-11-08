import { animator, cardSpans, easeOutCubic, pageTarget, revealTarget } from '../src/ui/scrollAnim';

const spans = Array.from({ length: 10 }, (_, i) => ({ start: i * 400, end: i * 400 + 380 }));

test('easeOutCubic endpoints and shape', () => {
  expect(easeOutCubic(0)).toBe(0);
  expect(easeOutCubic(1)).toBe(1);
  expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
});

test('pageTarget forward lands on the first card that is not fully visible', () => {
  // view 1000 from 0: cards 0,1 fully visible (0-780), card 2 (800-1180) is cut off.
  expect(pageTarget(0, 1000, spans, 3000, 1)).toBe(800);
  // retarget from a pending target
  expect(pageTarget(800, 1000, spans, 3000, 1)).toBe(1600);
  // clamps at max
  expect(pageTarget(2800, 1000, spans, 3000, 1)).toBe(3000);
});

test('pageTarget back moves about one view and lands on a card edge', () => {
  expect(pageTarget(1600, 1000, spans, 3000, -1)).toBe(800);
  expect(pageTarget(1200, 1000, spans, 3000, -1)).toBe(400);
  expect(pageTarget(300, 1000, spans, 3000, -1)).toBe(0);
});

test('revealTarget only moves when the card is outside the view', () => {
  expect(revealTarget(0, 1000, spans[1]!, 3000)).toBe(0);
  expect(revealTarget(0, 1000, spans[3]!, 3000)).toBe(1580 - 1000);
  expect(revealTarget(1600, 1000, spans[2]!, 3000)).toBe(800);
});

test('cardSpans measures children against the padded view', () => {
  const track = document.createElement('div');
  track.style.paddingLeft = '48px';
  track.style.paddingRight = '48px';
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: 1096 });
  Object.defineProperty(track, 'scrollWidth', { configurable: true, value: 3096 });
  track.scrollLeft = 100;
  track.getBoundingClientRect = () => ({ left: 0, right: 1096, width: 1096 } as DOMRect);
  for (let i = 0; i < 3; i++) {
    const c = document.createElement('div');
    c.getBoundingClientRect = () => ({ left: 48 - 100 + i * 400, right: 48 - 100 + i * 400 + 380, width: 380 } as DOMRect);
    track.append(c);
  }
  const m = cardSpans(track);
  expect(m.view).toBe(1000);
  expect(m.max).toBe(2000);
  expect(m.spans[1]).toEqual({ start: 400, end: 780 });
});

describe('animator', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] }));
  afterEach(() => { vi.useRealTimers(); delete (window as any).matchMedia; });

  function box() {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 4000 });
    el.scrollLeft = 0;
    return el;
  }

  test('eases over the duration and adds tide-gliding while running', () => {
    const el = box();
    const a = animator(el, 'x');
    a.to(800, 650);
    expect(el.classList.contains('tide-gliding')).toBe(true);
    vi.advanceTimersByTime(100);
    expect(el.scrollLeft).toBeGreaterThan(0);
    expect(el.scrollLeft).toBeLessThan(800);
    vi.advanceTimersByTime(700);
    expect(el.scrollLeft).toBe(800);
    expect(a.running()).toBe(false);
    expect(el.classList.contains('tide-gliding')).toBe(false);
  });

  test('retarget continues from the current position; same instance per element', () => {
    const el = box();
    animator(el, 'x').to(800, 650);
    vi.advanceTimersByTime(200);
    expect(animator(el, 'x').target()).toBe(800);
    animator(el, 'x').to(1600, 650);
    vi.advanceTimersByTime(800);
    expect(el.scrollLeft).toBe(1600);
  });

  test('clamps to the scroll range; cancel stops; reduced motion jumps', () => {
    const el = box();
    const a = animator(el, 'x');
    a.to(99999, 650);
    vi.advanceTimersByTime(800);
    expect(el.scrollLeft).toBe(3000);
    a.to(0, 650);
    vi.advanceTimersByTime(50);
    a.cancel();
    const at = el.scrollLeft;
    vi.advanceTimersByTime(800);
    expect(el.scrollLeft).toBe(at);
    (window as any).matchMedia = (q: string) => ({ matches: q.includes('reduce') });
    a.to(500, 650);
    expect(el.scrollLeft).toBe(500);
  });
});
