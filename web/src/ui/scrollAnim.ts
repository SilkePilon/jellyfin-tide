/** Eased scroll animation shared by row chevrons, keyboard focus, season switches and the app-wide wheel smoother. */

export const PAGE_MS = 650;

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface Anim {
  /** Ease from the current position to `target` (clamped) over `ms`. Calling again re-targets smoothly. */
  to(target: number, ms: number): void;
  /** Set the position instantly (cancels any glide). */
  jump(target: number): void;
  cancel(): void;
  /** Pending target while running, else null. */
  target(): number | null;
  running(): boolean;
}

const anims = new WeakMap<Element, { x?: Anim; y?: Anim }>();

export function animator(el: HTMLElement, axis: 'x' | 'y'): Anim {
  const slot = anims.get(el) ?? {};
  anims.set(el, slot);
  const existing = slot[axis];
  if (existing) return existing;
  const prop = axis === 'x' ? 'scrollLeft' : 'scrollTop';
  const max = () => axis === 'x' ? Math.max(0, el.scrollWidth - el.clientWidth) : Math.max(0, el.scrollHeight - el.clientHeight);
  const clamp = (v: number) => Math.max(0, Math.min(max(), Math.round(v)));
  let frame = 0;
  let goal: number | null = null;
  let from = 0;
  let started = 0;
  let duration = 0;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    goal = null;
    if (axis === 'x') el.classList.remove('tide-gliding');
    el.style.scrollBehavior = '';
  };
  const step = (now: number) => {
    if (goal === null) return;
    const t = duration <= 0 ? 1 : Math.min(1, (now - started) / duration);
    el[prop] = Math.round(from + (goal - from) * easeOutCubic(t));
    if (t >= 1) { el[prop] = goal; stop(); return; }
    frame = requestAnimationFrame(step);
  };
  const a: Anim = {
    to(target, ms) {
      const g = clamp(target);
      if (reducedMotion()) { a.jump(g); return; }
      from = el[prop];
      goal = g;
      started = performance.now();
      duration = ms;
      // Scroll snap fights a JS glide: off while running (CSS `.tide-gliding`), restored in stop().
      if (axis === 'x') el.classList.add('tide-gliding');
      // CSS `scroll-behavior: smooth` would turn every per-frame assignment into its own (interrupted) smooth scroll.
      el.style.scrollBehavior = 'auto';
      if (!frame) frame = requestAnimationFrame(step);
    },
    jump(target) { stop(); el.style.scrollBehavior = 'auto'; el[prop] = clamp(target); el.style.scrollBehavior = ''; },
    cancel: stop,
    target: () => goal,
    running: () => goal !== null,
  };
  slot[axis] = a;
  return a;
}

export interface Span { start: number; end: number }

/** Card spans in scroll coordinates (0 = scrolled fully left, card at the padded view edge). */
export function cardSpans(track: HTMLElement): { spans: Span[]; view: number; max: number } {
  const cs = getComputedStyle(track);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const rect = track.getBoundingClientRect();
  const viewLeft = rect.left + padL;
  const spans = [...track.children].map((c) => {
    const r = (c as HTMLElement).getBoundingClientRect();
    const start = Math.round(track.scrollLeft + r.left - viewLeft);
    return { start, end: start + Math.round(r.width) };
  });
  return { spans, view: track.clientWidth - padL - padR, max: Math.max(0, track.scrollWidth - track.clientWidth) };
}

/** Next page: forward = first card not fully visible becomes first; back = about one view back, on a card edge. */
export function pageTarget(base: number, view: number, spans: Span[], max: number, dir: 1 | -1): number {
  if (dir > 0) {
    const next = spans.find((s) => s.end > base + view + 1);
    return Math.min(max, next ? next.start : max);
  }
  const desired = base - view;
  if (desired <= 0) return 0;
  const edge = spans.find((s) => s.start >= desired && s.start < base);
  return Math.max(0, edge ? edge.start : desired);
}

export function revealTarget(base: number, view: number, span: Span, max: number): number {
  if (span.start < base) return Math.max(0, span.start);
  if (span.end > base + view) return Math.min(max, span.end - view);
  return base;
}
