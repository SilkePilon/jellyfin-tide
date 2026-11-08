export interface TouchDeps { toggleControls(): void; togglePlay(): void; seekBy(d: number): void; openShelf(): void; ripple(side: -1 | 1): void }
export const DOUBLE_TAP_MS = 300;
const IGNORE = '.tide-pc-b, .tide-pc-p, .tide-pc-scr, .tide-pset, .tide-pshelf, .tide-end, .tide-pz-next';

export function attachTouch(layer: HTMLElement, deps: TouchDeps, now: () => number = () => Date.now()): () => void {
  let startX = 0, startY = 0, moved = false, swiped = false, lastTap = 0;
  let single: ReturnType<typeof setTimeout> | undefined;
  const ignored = (e: Event) => !!(e.target as Element | null)?.closest?.(IGNORE);
  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || ignored(e)) return;
    startX = e.clientX; startY = e.clientY; moved = false; swiped = false;
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) moved = true;
    if (!swiped && startY - e.clientY > 60) { swiped = true; deps.openShelf(); }
  };
  const up = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || ignored(e) || moved || swiped) return;
    const t = now();
    if (t - lastTap < DOUBLE_TAP_MS) {
      lastTap = 0;
      if (single) { clearTimeout(single); single = undefined; }
      const r = layer.getBoundingClientRect();
      const x = (e.clientX - r.left) / (r.width || 1);
      if (x < 0.38) { deps.seekBy(-10); deps.ripple(-1); } else if (x > 0.62) { deps.seekBy(10); deps.ripple(1); } else deps.togglePlay();
      return;
    }
    lastTap = t;
    single = setTimeout(() => { single = undefined; deps.toggleControls(); }, DOUBLE_TAP_MS);
  };
  layer.addEventListener('pointerdown', down);
  layer.addEventListener('pointermove', move);
  layer.addEventListener('pointerup', up);
  return () => {
    if (single) clearTimeout(single);
    layer.removeEventListener('pointerdown', down);
    layer.removeEventListener('pointermove', move);
    layer.removeEventListener('pointerup', up);
  };
}
