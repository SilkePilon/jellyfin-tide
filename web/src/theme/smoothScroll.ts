import { animator, reducedMotion } from '../ui/scrollAnim';
import type { ClientConfig } from '../types';

export const WHEEL_MS = 450;
const LINE_PX = 40;
const NATIVE = 'input[type=range], select, textarea, video, [data-tide-native-scroll], .videoPlayerContainer, .MuiSlider-root, [role=slider]';

/** Discrete mouse-wheel notch (lines/pages, or a whole-pixel delta ≥ 50). Trackpads send small/fractional deltas. */
export function isMouseNotch(e: WheelEvent): boolean {
  if (e.deltaMode !== 0) return true;
  const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  return Math.abs(d) >= 50 && Number.isInteger(e.deltaY) && Number.isInteger(e.deltaX);
}

export function wheelPixels(e: WheelEvent, el: HTMLElement, axis: 'x' | 'y'): number {
  const raw = axis === 'y' && !e.shiftKey ? e.deltaY : (e.deltaX || e.deltaY);
  if (e.deltaMode === 1) return raw * LINE_PX;
  if (e.deltaMode === 2) return raw * (axis === 'y' ? el.clientHeight : el.clientWidth) * 0.9;
  return raw;
}

function canScroll(el: Element, axis: 'x' | 'y', dir: number): boolean {
  const h = el as HTMLElement;
  const isRoot = el === document.scrollingElement || el === document.documentElement || el === document.body;
  if (!isRoot) {
    const o = getComputedStyle(h)[axis === 'y' ? 'overflowY' : 'overflowX'];
    if (!/(auto|scroll|overlay)/.test(o)) return false;
  }
  const size = axis === 'y' ? h.scrollHeight - h.clientHeight : h.scrollWidth - h.clientWidth;
  if (size <= 1) return false;
  const pos = axis === 'y' ? h.scrollTop : h.scrollLeft;
  return dir > 0 ? pos < size - 1 : pos > 0;
}

/** Nearest ancestor (inclusive) that can scroll further in `dir`; at-limit areas pass the scroll on. */
export function scrollTarget(start: Element | null, axis: 'x' | 'y', dir: number): HTMLElement | null {
  for (let el = start; el; el = el.parentElement) {
    if (canScroll(el, axis, dir)) return el as HTMLElement;
  }
  const root = document.scrollingElement as HTMLElement | null;
  return root && canScroll(root, axis, dir) ? root : null;
}

export function initSmoothScroll(cfg: ClientConfig): () => void {
  if (cfg.enableSmoothScroll === false || reducedMotion()) return () => {};
  document.documentElement.classList.add('tide-smooth');
  const onWheel = (e: WheelEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || !isMouseNotch(e)) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest(NATIVE)) return;
    const row = t.closest('.tide-row-track');
    const horizontal = !!row && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY));
    const axis = horizontal || e.shiftKey ? 'x' : 'y';
    const start = horizontal ? row : t;
    const probe = axis === 'y' ? e.deltaY : (e.deltaX || e.deltaY);
    const el = scrollTarget(start, axis, Math.sign(probe));
    if (!el) return;
    e.preventDefault();
    const a = animator(el, axis);
    const base = a.target() ?? (axis === 'y' ? el.scrollTop : el.scrollLeft);
    a.to(base + wheelPixels(e, el, axis), WHEEL_MS);
  };
  // Window-level, non-passive, in the bubble phase: components that handle the wheel themselves and call
  // preventDefault (sliders, the player) win.
  window.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    window.removeEventListener('wheel', onWheel);
    document.documentElement.classList.remove('tide-smooth');
  };
}
