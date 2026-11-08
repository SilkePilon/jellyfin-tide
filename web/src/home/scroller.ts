import { h, icon } from '../ui/dom';
import { animator, cardSpans, PAGE_MS, pageTarget, revealTarget } from '../ui/scrollAnim';

const DRAG_THRESHOLD = 6;

export interface Scroller { el: HTMLElement; track: HTMLElement; sync(): void; dispose(): void }

/**
 * Horizontal card track with: edge chevrons (only when that direction can scroll), native trackpad / shift+wheel,
 * mouse drag-to-scroll that suppresses the click it ends on, ←/→ moving focus between cards, and snap.
 */
export function createScroller(trackClass: string): Scroller {
  const track = h('div', { class: `tide-row-track ${trackClass}` });
  const prev = h('button', { class: 'tide-row-chev tide-row-chev-prev', type: 'button', 'aria-label': 'Scroll left', tabindex: '-1' }, icon('chevron_left'));
  const next = h('button', { class: 'tide-row-chev tide-row-chev-next', type: 'button', 'aria-label': 'Scroll right', tabindex: '-1' }, icon('chevron_right'));
  const el = h('div', { class: 'tide-row-scroller' }, track, prev, next);

  const page = (dir: -1 | 1) => {
    const a = animator(track, 'x');
    const { spans, view, max } = cardSpans(track);
    a.to(pageTarget(a.target() ?? track.scrollLeft, view, spans, max, dir), PAGE_MS);
  };
  prev.addEventListener('click', () => page(-1));
  next.addEventListener('click', () => page(1));

  const sync = () => {
    const max = track.scrollWidth - track.clientWidth;
    el.classList.toggle('can-prev', track.scrollLeft > 2);
    el.classList.toggle('can-next', track.scrollLeft < max - 2);
  };
  track.addEventListener('scroll', sync, { passive: true });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
  ro?.observe(track);

  // Mouse drag-to-scroll. Touch and pens keep native scrolling.
  let startX = 0;
  let startLeft = 0;
  let dragging = false;
  let pointer = -1;
  const onDown = (e: PointerEvent) => {
    animator(track, 'x').cancel();
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    pointer = e.pointerId;
    startX = e.clientX;
    startLeft = track.scrollLeft;
    dragging = false;
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - startX;
    if (!dragging && Math.abs(dx) > DRAG_THRESHOLD) {
      dragging = true;
      track.classList.add('tide-dragging');
      track.setPointerCapture?.(e.pointerId);
    }
    if (dragging) track.scrollLeft = startLeft - dx;
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    if (!dragging) return;
    dragging = false;
    track.classList.remove('tide-dragging');
    // The click that follows this pointerup must not open the card under the cursor.
    track.dataset.tideDragged = '1';
    setTimeout(() => delete track.dataset.tideDragged, 0);
  };
  track.addEventListener('pointerdown', onDown);
  track.addEventListener('pointermove', onMove);
  track.addEventListener('pointerup', onUp);
  track.addEventListener('pointercancel', onUp);
  track.addEventListener('dragstart', (e) => e.preventDefault());
  track.addEventListener('touchstart', () => animator(track, 'x').cancel(), { passive: true });

  // Keyboard: ←/→ move focus to the neighbouring card and keep it in view.
  track.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const cards = [...track.children] as HTMLElement[];
    const i = cards.findIndex((c) => c === document.activeElement || c.contains(document.activeElement));
    if (i < 0) return;
    const target = cards[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (!target) return;
    e.preventDefault();
    target.focus({ preventScroll: true });
    const a = animator(track, 'x');
    const { spans, view, max } = cardSpans(track);
    const span = spans[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (span) a.to(revealTarget(a.target() ?? track.scrollLeft, view, span, max), PAGE_MS);
  });

  return { el, track, sync, dispose: () => ro?.disconnect() };
}
