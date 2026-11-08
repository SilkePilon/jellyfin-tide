# Tide 0.3.0 — Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stock movie/series detail page with a Tide page, and ship the bundled 0.2.x fixes, animated row chevrons with eased card paging, and app-wide smooth wheel scrolling.

**Architecture:**
- The client router becomes a small takeover table: home and details share mount, remount and failure-latch logic.
- The detail page is a set of focused modules under `web/src/details/` that reuse the home building blocks: `wideCard`, `createScroller`, `toggleButton`, `progressRing` and the ambient layer.
- Scrolling motion lives in one animator (`ui/scrollAnim.ts`), shared by chevrons, keyboard focus, the season switch and the app-wide wheel smoother.
- Server changes are limited to two config flags.

**Tech Stack:**
- TypeScript 5.8, Vite 6 IIFE bundle, vitest 3 + jsdom
- C# .NET 10 Jellyfin 12.4 plugin, xUnit
- Playwright 1.52 against the local 12.4 container

**Spec:** `docs/superpowers/specs/2026-11-08-tide-detail-page-design.md` (read it for visuals; this plan carries every exact value needed).

## Global Constraints

- Jellyfin 12.4, Modern layout only, hash routing (`#/details?id=`).
- Solid surfaces only: surface colours `#141416` / `#1c1c1e` / `#1d1d20` / `#2a2a2e` / `#3a3a3c`. No translucency on panels. Image shades and blur are allowed.
- Badges, pills and chips are flat `#2a2a2e` with no border or ring.
- Favourite: the button stays grey, the heart is **solid `#ff375f`** when on and a white outline when off. The pop plays only on user toggles (`.tide-just-toggled`).
- Motion animates **transform and opacity only**, with ease `--tide-ease` = `cubic-bezier(.2,.8,.2,1)`. `prefers-reduced-motion: reduce` removes transform motion.
- Detail takeover applies **only to `Movie` and `Series`**. `Season` redirects to its series with `&season=<IndexNumber>` (using `location.replace`). Every other type stays stock.
- Detail host: the visible `#itemDetailPage.itemDetailPage:not(.hide)`. Inactive cached views carry `.hide`.
- Section order: Header (with the Next up strip for series) → Episodes (series) → Cast & crew → More like this → Details. Empty sections are hidden, never shown empty.
- Card paging glide: **650ms ease-out cubic**. Wheel smoothing: **450ms ease-out cubic**. Reduced motion means instant.
- Version **0.3.0** everywhere: `web/package.json`, `web/src/main.ts` `TIDE_VERSION`, csproj `AssemblyVersion`/`FileVersion` `0.3.0.0`.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never add the private server URL, the API key or library mockups to the repo.

**Commands** (from the repo root `/home/silke/.t3/scratch/2026-11-08-i-want-to-make-my-dd552d62`):
- Web tests: `cd web && npx vitest run <file>`. Full suite: `cd web && npm test && npm run typecheck`.
- Server tests: `./scripts/dotnet test Tide.slnx`
- Deploy to local Jellyfin: `(cd web && npm run build) && ./scripts/dotnet publish server/Jellyfin.Plugin.Tide -c Release -o e2e/plugins/Tide && (cd e2e && docker compose up -d --force-recreate)`
- E2E: `cd e2e && npx playwright test`

---

## File structure

| File | Responsibility |
|---|---|
| `server/.../Configuration/PluginConfiguration.cs` | + `EnableDetails`, `EnableSmoothScroll` |
| `server/.../Models/Dtos.cs`, `Api/TideController.cs` | expose both in ClientConfig |
| `server/.../Configuration/configPage.html` | two new checkboxes |
| `web/src/types.ts` | ClientConfig fields |
| `web/src/ui/scrollAnim.ts` (new) | per-element eased scroll animator + `pageTarget` maths |
| `web/src/home/scroller.ts`, `home.css` | chevrons use the animator; chevron motion CSS; size vars shared with details |
| `web/src/theme/smoothScroll.ts` (new) | app-wide wheel smoothing |
| `web/src/ui/svgIcons.ts` (new), `ui/dom.ts`, `ui/cards.css`, `theme/tokens.css` | inline SVG for favourite/play/check/star/info; solid heart |
| `web/src/home/hero.ts`, `hero.css` | trailer play-state machine, T3 focus + legibility |
| `web/src/router/hook.ts`, `router/selectors.ts` | generic takeover table; detail route helpers |
| `web/src/api/item.ts` (new) | detail data requests + types |
| `web/src/api/actions.ts` | + `playShuffle`, `refreshItem` |
| `web/src/details/logic.ts` (new) | pure rules (season choice, next-up, facts, cast order, formatting) |
| `web/src/ui/cards.ts`, `cards.css` | `wideCard` episode mode |
| `web/src/ui/popover.ts` (new) | anchored popover (Esc, outside click, arrow keys) |
| `web/src/ui/trailerModal.ts` (new) | YouTube full-screen modal |
| `web/src/ui/ambient.ts`, `ambient.css` (new) | ambient glow layer, extracted from home |
| `web/src/details/header.ts`, `nextUp.ts`, `episodes.ts`, `cast.ts`, `similar.ts`, `about.ts`, `details.ts`, `details.css` (new) | detail page |
| `e2e/fetch-media.sh`, `e2e/docker-compose.yml`, `e2e/tests/details.spec.ts` | fixture season 2, plugin path, e2e |

---

### Task 1: Config flags `enableDetails` and `enableSmoothScroll`

**Files:**
- Modify: `server/Jellyfin.Plugin.Tide/Configuration/PluginConfiguration.cs`
- Modify: `server/Jellyfin.Plugin.Tide/Models/Dtos.cs:64-73`
- Modify: `server/Jellyfin.Plugin.Tide/Api/TideController.cs:85-93`
- Modify: `server/Jellyfin.Plugin.Tide/Configuration/configPage.html:12,25`
- Modify: `web/src/types.ts` (ClientConfig)
- Test: `server/Jellyfin.Plugin.Tide.Tests/TideControllerTests.cs`

**Interfaces:**
- Produces: `ClientConfig.enableDetails?: boolean` and `ClientConfig.enableSmoothScroll?: boolean` (optional on the client, so an older server reads as `undefined`. Callers treat `undefined` as `true`: use `cfg.enableDetails !== false`).

- [ ] **Step 1: Write the failing test.** Append to `TideControllerTests`:

```csharp
    [Fact]
    public void ClientConfigExposesDetailsAndSmoothScroll()
    {
        using var on = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(new PluginConfiguration(), "0.3.0")));
        Assert.True(on.RootElement.GetProperty("enableDetails").GetBoolean());
        Assert.True(on.RootElement.GetProperty("enableSmoothScroll").GetBoolean());
        var cfg = new PluginConfiguration { EnableDetails = false, EnableSmoothScroll = false };
        using var off = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(cfg, "0.3.0")));
        Assert.False(off.RootElement.GetProperty("enableDetails").GetBoolean());
        Assert.False(off.RootElement.GetProperty("enableSmoothScroll").GetBoolean());
    }
```

- [ ] **Step 2: Run it.** `./scripts/dotnet test Tide.slnx --filter ClientConfigExposesDetailsAndSmoothScroll`. Expected: build FAIL (`EnableDetails` not defined).

- [ ] **Step 3: Implement.**

In `PluginConfiguration.cs`, add after `EnableTrailers`:
```csharp
    public bool EnableDetails { get; set; } = true;
    public bool EnableSmoothScroll { get; set; } = true;
```

In `Dtos.cs`, replace the last parameter line of `ClientConfig` with:
```csharp
    [property: JsonPropertyName("defaultHiddenRows")] string[] DefaultHiddenRows,
    [property: JsonPropertyName("enableDetails")] bool EnableDetails,
    [property: JsonPropertyName("enableSmoothScroll")] bool EnableSmoothScroll);
```

In `TideController.BuildClientConfig`, replace the final constructor argument line `defaults.RowOrder, defaults.Hidden);` with:
```csharp
            defaults.RowOrder, defaults.Hidden, cfg.EnableDetails, cfg.EnableSmoothScroll);
```

In `configPage.html`, after the `EnableTrailers` label add:
```html
      <label class="checkboxContainer"><input is="emby-checkbox" type="checkbox" id="EnableDetails"><span>Tide detail page (movies &amp; series)</span></label>
      <label class="checkboxContainer"><input is="emby-checkbox" type="checkbox" id="EnableSmoothScroll"><span>Smooth scrolling</span></label>
```
and change the bools line to:
```js
      var bools = ['EnableTheme', 'EnableIcons', 'EnableHome', 'EnableTrailers', 'EnableDetails', 'EnableSmoothScroll'];
```

In `web/src/types.ts`, extend `ClientConfig`:
```ts
export interface ClientConfig {
  enableTheme: boolean; enableIcons: boolean; enableHome: boolean; enableTrailers: boolean;
  heroSlotSeconds: number; newDays: number; version: string;
  /** Admin defaults (normalised server-side): what "Reset to default" and a fresh user get. */
  defaultRowOrder?: string[]; defaultHiddenRows?: string[];
  /** 0.3.0+. Missing (older server) means on. */
  enableDetails?: boolean; enableSmoothScroll?: boolean;
}
```

- [ ] **Step 4: Run.** `./scripts/dotnet test Tide.slnx` (all pass) and `cd web && npm run typecheck` (clean).

- [ ] **Step 5: Commit.**
```bash
git add server web/src/types.ts
git commit -m "feat: enableDetails and enableSmoothScroll config flags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scroll animator, eased chevron paging, animated chevrons

**Files:**
- Create: `web/src/ui/scrollAnim.ts`
- Modify: `web/src/home/scroller.ts`
- Modify: `web/src/home/home.css:29-41` (chevron block), plus `.tide-row-track.tide-gliding`
- Test: `web/test/scrollAnim.test.ts` (new), `web/test/scroller.test.ts` (update the paging test)

**Interfaces:**
- Produces (`ui/scrollAnim.ts`):
  - `export function reducedMotion(): boolean`
  - `export const easeOutCubic: (t: number) => number`
  - `export interface Anim { to(target: number, ms: number): void; jump(target: number): void; cancel(): void; target(): number | null; running(): boolean }`
  - `export function animator(el: HTMLElement, axis: 'x' | 'y'): Anim`: one instance per element and axis (WeakMap). `el` may be `document.scrollingElement`.
  - `export interface Span { start: number; end: number }`
  - `export function cardSpans(track: HTMLElement): { spans: Span[]; view: number; max: number }`: card spans in scroll coordinates, the visible width (excluding padding) and the max scrollLeft.
  - `export function pageTarget(base: number, view: number, spans: Span[], max: number, dir: 1 | -1): number`
  - `export function revealTarget(base: number, view: number, span: Span, max: number): number`: smallest move that brings `span` fully into view.
  - `export const PAGE_MS = 650`
- `createScroller` keeps its signature. Chevrons call `animator(track,'x').to(pageTarget(...), PAGE_MS)`.

- [ ] **Step 1: Write the failing tests** `web/test/scrollAnim.test.ts`:

```ts
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
```

- [ ] **Step 2: Run.** `cd web && npx vitest run test/scrollAnim.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `web/src/ui/scrollAnim.ts`:

```ts
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
      if (!frame) frame = requestAnimationFrame(step);
    },
    jump(target) { stop(); el[prop] = clamp(target); },
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
```

- [ ] **Step 4: Run.** `npx vitest run test/scrollAnim.test.ts`. Expected: PASS.

- [ ] **Step 5: Wire the scroller.** In `web/test/scroller.test.ts`, replace the test `'chevron pages by 85% of the visible width'` with:

```ts
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
```

Move `function pointer(...)` above these tests (it is currently declared below them; function declarations are hoisted, so leaving it in place also works).

In the arrow-key test, replace the `a.scrollIntoView = vi.fn();` setup with nothing. The scroller no longer calls `scrollIntoView`; it uses `revealTarget` through the animator. The assertions stay the same.

Then modify `web/src/home/scroller.ts`:
- Import `import { animator, cardSpans, PAGE_MS, pageTarget, revealTarget } from '../ui/scrollAnim';`
- Replace the `page` function:
```ts
  const page = (dir: -1 | 1) => {
    const a = animator(track, 'x');
    const { spans, view, max } = cardSpans(track);
    a.to(pageTarget(a.target() ?? track.scrollLeft, view, spans, max, dir), PAGE_MS);
  };
```
- At the start of `onDown`, before the mouse check, cancel the glide on any pointer: `animator(track, 'x').cancel();`
- Add `track.addEventListener('touchstart', () => animator(track, 'x').cancel(), { passive: true });`
- In the keydown handler, replace `target.scrollIntoView(...)` with:
```ts
    const a = animator(track, 'x');
    const { spans, view, max } = cardSpans(track);
    const span = spans[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (span) a.to(revealTarget(a.target() ?? track.scrollLeft, view, span, max), PAGE_MS);
```

- [ ] **Step 6: Chevron CSS.** In `web/src/home/home.css`, replace the block from `/* Edge chevrons` through `body.tide .tide-row-scroller .tide-row-chev:hover { background: #3a3a3c; }` with:

```css
/* Edge chevrons: solid circles that glide in/out (transform + opacity only). */
body.tide .tide-row-chev {
  position: absolute; top: calc(22px + var(--tide-cw) * 9 / 32); z-index: 6; width: 48px; height: 48px; border-radius: 50%; border: 0;
  background: var(--tide-s3); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer;
  opacity: 0; pointer-events: none; box-shadow: 0 8px 20px rgba(0,0,0,.6);
  transition: opacity .25s var(--tide-ease), transform .25s var(--tide-ease), background-color .2s;
}
body.tide .tide-row-chev-prev { left: 12px; transform: translate(-10px, -50%) scale(.85); }
body.tide .tide-row-chev-next { right: 12px; transform: translate(10px, -50%) scale(.85); }
body.tide .tide-row-chev .tide-ms { font-size: 28px; transition: transform .25s var(--tide-ease); }
@media (hover: hover) {
  body.tide .tide-row-scroller.can-prev:hover .tide-row-chev-prev, body.tide .tide-row-scroller.can-next:hover .tide-row-chev-next {
    opacity: 1; pointer-events: auto; transform: translate(0, -50%) scale(1); transition: opacity .35s var(--tide-ease), transform .35s var(--tide-ease), background-color .2s;
  }
  body.tide .tide-row-scroller .tide-row-chev:hover { background: #3a3a3c; transform: translate(0, -50%) scale(1.08); }
  body.tide .tide-row-chev-next:hover .tide-ms { transform: translateX(2px); }
  body.tide .tide-row-chev-prev:hover .tide-ms { transform: translateX(-2px); }
  body.tide .tide-row-scroller .tide-row-chev:active { transform: translate(0, -50%) scale(.92); transition-duration: .1s; }
}
body.tide .tide-row-track.tide-gliding { scroll-snap-type: none; }
@media (prefers-reduced-motion: reduce) {
  body.tide .tide-row-chev, body.tide .tide-row-scroller .tide-row-chev:is(:hover, :active) { transform: translate(0, -50%) !important; }
  body.tide .tide-row-chev .tide-ms { transform: none !important; }
}
```

- [ ] **Step 7: Run.** `cd web && npm test && npm run typecheck`. Expected: all pass.

- [ ] **Step 8: Commit.**
```bash
git add web/src/ui/scrollAnim.ts web/src/home/scroller.ts web/src/home/home.css web/test/scrollAnim.test.ts web/test/scroller.test.ts
git commit -m "feat: eased card paging and animated row chevrons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: App-wide smooth wheel scrolling

**Files:**
- Create: `web/src/theme/smoothScroll.ts`
- Modify: `web/src/main.ts` (register), `web/src/theme/global.css` (scroll-behavior)
- Test: `web/test/smoothScroll.test.ts`

**Interfaces:**
- Consumes: `animator`, `reducedMotion` from `ui/scrollAnim.ts`.
- Produces:
  - `export const WHEEL_MS = 450`
  - `export function isMouseNotch(e: WheelEvent): boolean`
  - `export function wheelPixels(e: WheelEvent, el: HTMLElement, axis: 'x'|'y'): number`
  - `export function scrollTarget(start: Element | null, axis: 'x'|'y', dir: number): HTMLElement | null`
  - `export function initSmoothScroll(cfg: ClientConfig): () => void`

- [ ] **Step 1: Write the failing tests** `web/test/smoothScroll.test.ts`:

```ts
import { initSmoothScroll, isMouseNotch, scrollTarget, wheelPixels } from '../src/theme/smoothScroll';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: true, heroSlotSeconds: 30, newDays: 14, version: 't' };
const wheel = (init: WheelEventInit) => new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });

function scroller(h = 3000, ch = 1000, overflow = 'auto'): HTMLElement {
  const el = document.createElement('div');
  el.style.overflowY = overflow;
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: h });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: ch });
  document.body.append(el);
  return el;
}

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); delete (window as any).matchMedia; });

test('mouse notch vs trackpad', () => {
  expect(isMouseNotch(wheel({ deltaY: 100 }))).toBe(true);
  expect(isMouseNotch(wheel({ deltaY: 120 }))).toBe(true);
  expect(isMouseNotch(wheel({ deltaY: 3, deltaMode: 1 }))).toBe(true);
  expect(isMouseNotch(wheel({ deltaY: 4.5 }))).toBe(false);
  expect(isMouseNotch(wheel({ deltaY: 12 }))).toBe(false);
  expect(isMouseNotch(wheel({ deltaY: 53.5 }))).toBe(false);
});

test('wheel pixels: lines and pages', () => {
  const el = scroller();
  expect(wheelPixels(wheel({ deltaY: 100 }), el, 'y')).toBe(100);
  expect(wheelPixels(wheel({ deltaY: 3, deltaMode: 1 }), el, 'y')).toBe(120);
  expect(wheelPixels(wheel({ deltaY: 1, deltaMode: 2 }), el, 'y')).toBe(900);
});

test('nearest scrollable ancestor that can move; passes through at limits', () => {
  const outer = scroller();
  const inner = document.createElement('div');
  inner.style.overflowY = 'auto';
  Object.defineProperty(inner, 'scrollHeight', { configurable: true, value: 500 });
  Object.defineProperty(inner, 'clientHeight', { configurable: true, value: 200 });
  const leaf = document.createElement('span');
  inner.append(leaf);
  outer.append(inner);
  expect(scrollTarget(leaf, 'y', 1)).toBe(inner);
  inner.scrollTop = 300; // at its bottom
  expect(scrollTarget(leaf, 'y', 1)).toBe(outer);
  expect(scrollTarget(leaf, 'y', -1)).toBe(inner);
});

test('a notch eases the page over several frames and lands one notch further', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
  const el = scroller();
  const leaf = document.createElement('p');
  el.append(leaf);
  const stop = initSmoothScroll(cfg);
  const e = wheel({ deltaY: 100 });
  leaf.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
  vi.advanceTimersByTime(48);
  expect(el.scrollTop).toBeGreaterThan(0);
  expect(el.scrollTop).toBeLessThan(100);
  leaf.dispatchEvent(wheel({ deltaY: 100 })); // accumulates
  vi.advanceTimersByTime(600);
  expect(el.scrollTop).toBe(200);
  stop();
});

test('left alone: trackpad, ctrl-zoom, native-scroll opt-out, form controls', () => {
  const el = scroller();
  const stop = initSmoothScroll(cfg);
  const leaf = document.createElement('p');
  el.append(leaf);
  for (const e of [wheel({ deltaY: 4.5 }), wheel({ deltaY: 100, ctrlKey: true })]) {
    leaf.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  }
  const opt = document.createElement('div');
  opt.setAttribute('data-tide-native-scroll', '');
  el.append(opt);
  const e2 = wheel({ deltaY: 100 });
  opt.dispatchEvent(e2);
  expect(e2.defaultPrevented).toBe(false);
  const sel = document.createElement('select');
  el.append(sel);
  const e3 = wheel({ deltaY: 100 });
  sel.dispatchEvent(e3);
  expect(e3.defaultPrevented).toBe(false);
  stop();
});

test('off under reduced motion and when the setting is off', () => {
  const el = scroller();
  const leaf = document.createElement('p');
  el.append(leaf);
  const stop1 = initSmoothScroll({ ...cfg, enableSmoothScroll: false });
  const e1 = wheel({ deltaY: 100 });
  leaf.dispatchEvent(e1);
  expect(e1.defaultPrevented).toBe(false);
  stop1();
  (window as any).matchMedia = (q: string) => ({ matches: q.includes('reduce') });
  const stop2 = initSmoothScroll(cfg);
  const e2 = wheel({ deltaY: 100 });
  leaf.dispatchEvent(e2);
  expect(e2.defaultPrevented).toBe(false);
  stop2();
});

test('shift+wheel over a Tide row eases the row horizontally', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
  const track = document.createElement('div');
  track.className = 'tide-row-track';
  track.style.overflowX = 'auto';
  Object.defineProperty(track, 'scrollWidth', { configurable: true, value: 4000 });
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: 1000 });
  document.body.append(track);
  const stop = initSmoothScroll(cfg);
  const e = wheel({ deltaY: 100, shiftKey: true });
  track.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
  vi.advanceTimersByTime(600);
  expect(track.scrollLeft).toBe(100);
  stop();
});
```

- [ ] **Step 2: Run.** `npx vitest run test/smoothScroll.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `web/src/theme/smoothScroll.ts`:

```ts
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
```

Append to `web/src/theme/global.css`:
```css
/* Keyboard / anchor scrolling eases too (wheel is handled in smoothScroll.ts). */
html.tide-smooth { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html.tide-smooth { scroll-behavior: auto; } }
```

In `web/src/main.ts`, add `import { initSmoothScroll } from './theme/smoothScroll';` and register after `initTheme`:
```ts
registerFeature((cfg) => { if (cfg.enableTheme) initSmoothScroll(cfg); });
```

- [ ] **Step 4: Run.** `cd web && npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/theme/smoothScroll.ts web/src/theme/global.css web/src/main.ts web/test/smoothScroll.test.ts
git commit -m "feat: app-wide smooth mouse-wheel scrolling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Inline SVG icons and the solid red heart (fix e)

**Files:**
- Create: `web/src/ui/svgIcons.ts`
- Modify: `web/src/ui/dom.ts` (`icon()`), `web/src/ui/cards.css` (favourite rules), `web/src/theme/tokens.css` (`.tide-svg`)
- Test: `web/test/svgIcons.test.ts`, update `web/test/hero.test.ts:252`

**Interfaces:**
- Produces:
  - `export const SVG_ICONS: Record<'favorite'|'play_arrow'|'check'|'star'|'info', string>` (path data, 24×24 viewBox)
  - `export function svgIcon(name: keyof typeof SVG_ICONS): SVGSVGElement`
  - `icon(name, cls)` now returns `<span class="tide-ms tide-svg ..." data-icon="name">` wrapping the SVG for those 5 names. Other names are unchanged (font glyph text).

- [ ] **Step 1: Write the failing tests** `web/test/svgIcons.test.ts`:

```ts
import { icon } from '../src/ui/dom';
import { toggleButton } from '../src/ui/toggle';

test('the five key icons render as inline SVG, others stay font glyphs', () => {
  for (const n of ['favorite', 'play_arrow', 'check', 'star', 'info']) {
    const el = icon(n);
    expect(el.classList.contains('tide-svg')).toBe(true);
    expect(el.dataset.icon).toBe(n);
    expect(el.querySelector('svg path')?.getAttribute('d')).toBeTruthy();
    expect(el.textContent).toBe('');
  }
  expect(icon('tune').textContent).toBe('tune');
  expect(icon('tune').querySelector('svg')).toBeNull();
});

test('favourite toggle carries the svg heart and aria-pressed drives its fill', () => {
  const b = toggleButton({ icon: 'favorite', label: 'Favourite', on: true, cls: 'tide-fav-toggle', save: async () => {} });
  expect(b.querySelector('.tide-svg[data-icon="favorite"] svg')).not.toBeNull();
  expect(b.getAttribute('aria-pressed')).toBe('true');
});
```

- [ ] **Step 2: Run.** Expected: FAIL (`tide-svg` missing).

- [ ] **Step 3: Implement** `web/src/ui/svgIcons.ts`:

```ts
/** Icons that must look identical everywhere (Jellyfin Desktop ignores the font's FILL axis): inline SVG. */
export const SVG_ICONS = {
  favorite: 'M12 20.6l-1.3-1.2C5.9 15 3 12.4 3 9.1 3 6.5 5 4.5 7.6 4.5c1.5 0 2.9.7 3.8 1.8l.6.7.6-.7c.9-1.1 2.3-1.8 3.8-1.8 2.6 0 4.6 2 4.6 4.6 0 3.3-2.9 5.9-7.7 10.3L12 20.6z',
  play_arrow: 'M8 6.2v11.6c0 .8.9 1.3 1.6.9l9.1-5.8c.6-.4.6-1.3 0-1.7L9.6 5.3C8.9 4.9 8 5.4 8 6.2z',
  check: 'M9.5 16.2l-3.6-3.6a1.1 1.1 0 0 0-1.6 1.6l4.4 4.4c.4.4 1.1.4 1.6 0l9.4-9.4a1.1 1.1 0 0 0-1.6-1.6l-8.6 8.6z',
  star: 'M12 17.3l5.2 3.1c.6.4 1.4-.2 1.2-.9l-1.4-5.9 4.6-4c.5-.5.3-1.4-.4-1.4l-6.1-.5-2.4-5.6c-.3-.7-1.2-.7-1.5 0L8.8 7.7l-6.1.5c-.7.1-1 .9-.4 1.4l4.6 4-1.4 5.9c-.2.7.6 1.3 1.2.9l5.3-3.1z',
  info: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm1 14.5a1 1 0 0 1-2 0v-5a1 1 0 0 1 2 0v5zM12 9.2a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z',
} as const;

export type SvgIconName = keyof typeof SVG_ICONS;
const NS = 'http://www.w3.org/2000/svg';

export function isSvgIcon(name: string): name is SvgIconName {
  return Object.prototype.hasOwnProperty.call(SVG_ICONS, name);
}

export function svgIcon(name: SvgIconName): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', SVG_ICONS[name]);
  svg.append(p);
  return svg;
}
```

Replace `icon()` in `web/src/ui/dom.ts`:
```ts
import { isSvgIcon, svgIcon } from './svgIcons';

export function icon(name: string, cls = ''): HTMLElement {
  if (isSvgIcon(name)) {
    const s = h('span', { class: `tide-ms tide-svg ${cls}`.trim(), 'aria-hidden': 'true', 'data-icon': name });
    s.append(svgIcon(name));
    return s;
  }
  return h('span', { class: `tide-ms ${cls}`.trim(), 'aria-hidden': 'true' }, name);
}
```
(Put the import at the top of the file.)

Append to `web/src/theme/tokens.css`:
```css
/* Inline SVG icons size like the font glyphs they replace (1em box, currentColor). */
body.tide .tide-svg { width: 1em; height: 1em; display: inline-flex; align-items: center; justify-content: center; }
body.tide .tide-svg svg { width: 100%; height: 100%; display: block; fill: currentColor; overflow: visible; }
body.tide .tide-svg path { transition: fill .2s var(--tide-ease), stroke .2s var(--tide-ease); }
```

In `web/src/ui/cards.css`, replace the three favourite rules (`body.tide .tide-fav-toggle, body.tide .tide-fav-toggle[aria-pressed="true"] {...}`, `...[aria-pressed="true"] { color: var(--tide-fav); }` and the pop rule) with:
```css
body.tide .tide-fav-toggle, body.tide .tide-fav-toggle[aria-pressed="true"] { background: var(--tide-s3); color: #fff; }
/* Off: white outline heart. On: solid red heart. The button itself never changes colour. */
body.tide .tide-fav-toggle .tide-svg path { fill: transparent; stroke: #fff; stroke-width: 2; stroke-linejoin: round; }
body.tide .tide-fav-toggle[aria-pressed="true"] .tide-svg path { fill: var(--tide-fav); stroke: var(--tide-fav); }
body.tide .tide-fav-toggle.tide-just-toggled[aria-pressed="true"] .tide-svg { animation: tide-pop .35s var(--tide-ease); }
```
Keep the existing `@keyframes tide-pop` and the reduced-motion rule, but change its selector to `.tide-svg`.

In `web/test/hero.test.ts`, the line expecting `['play_arrowPlay', 'infoMore info', 'Favourite']` becomes `['Play', 'More info', 'Favourite']`.

- [ ] **Step 4: Run.** `cd web && npm test && npm run typecheck`. Expected: PASS. Fix any other assertion that read icon text for these five names the same way: the icon is now textless.

- [ ] **Step 5: Commit.**
```bash
git add web/src/ui/svgIcons.ts web/src/ui/dom.ts web/src/ui/cards.css web/src/theme/tokens.css web/test
git commit -m "fix: inline SVG icons so Jellyfin Desktop shows a solid red heart

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hero trailer and T3 fixes (a–d)

**Files:**
- Modify: `web/src/home/hero.ts` (play state), `web/src/home/hero.css`
- Test: `web/test/hero.test.ts`

**Behaviour:**
- **New slide class `vidplay`**: set only while the trailer is *actually playing*. It is driven by local `<video>` `playing` / `pause` / `waiting` / `ended`, and by YouTube state messages (1 = playing; 2 / 3 = paused / buffering; 0 = ended).
- **Leaving playback**: pause or buffering removes `vidplay` after **300ms** (debounced). `playing` cancels the pending removal.
- **No YouTube state message**: if no message is heard within **2500ms** after the iframe `ok()`, assume playing (the old behaviour).
- **CSS**:
  - The video layer is visible only with `vidplay` and has a `#000` base.
  - The backdrop fades to 0 with `vidplay`.
- **`vidon` keeps its meaning** (a trailer source is active). It still drives the logo shrink, the synopsis collapse and `tide-hero-playing`.

**Interfaces:** internal to `hero.ts`; no export changes.

- [ ] **Step 1: Write the failing tests.** Append to `web/test/hero.test.ts`:

```ts
test('fix a/b: backdrop hides only while the trailer really plays; pause shows it again after 300ms', async () => {
  vi.useFakeTimers();
  (fetch as any).mockImplementation(() => Promise.resolve(new Response(JSON.stringify([{ Id: 'loc1' }]))));
  const hero = createHero([base, { ...base, id: 'h2' }], cfg);
  await vi.advanceTimersByTimeAsync(3_100);
  const slide = hero.el.querySelector('.tide-hero-slide.on')!;
  const v = slide.querySelector('video')!;
  expect(slide.classList.contains('vidplay')).toBe(false);
  v.dispatchEvent(new Event('playing'));
  expect(slide.classList.contains('vidplay')).toBe(true);
  v.dispatchEvent(new Event('pause'));
  await vi.advanceTimersByTimeAsync(200);
  expect(slide.classList.contains('vidplay')).toBe(true);
  await vi.advanceTimersByTimeAsync(150);
  expect(slide.classList.contains('vidplay')).toBe(false);
  v.dispatchEvent(new Event('waiting'));
  v.dispatchEvent(new Event('playing'));
  await vi.advanceTimersByTimeAsync(400);
  expect(slide.classList.contains('vidplay')).toBe(true);
  hero.go(1);
  expect(slide.classList.contains('vidplay')).toBe(false);
  hero.destroy();
});

test('fix a/b: youtube state messages drive vidplay; silent player falls back to playing', async () => {
  vi.useFakeTimers();
  const hero = createHero([base, { ...base, id: 'h2' }], cfg);
  await vi.advanceTimersByTimeAsync(3_100);
  const slide = hero.el.querySelector('.tide-hero-slide.on')!;
  const f = slide.querySelector('iframe')!;
  f.dispatchEvent(new Event('load'));
  await vi.advanceTimersByTimeAsync(1_600); // ok() after 1.5 s
  expect(slide.classList.contains('vidplay')).toBe(false);
  const msg = (info: number) => window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://www.youtube-nocookie.com', source: f.contentWindow, data: JSON.stringify({ event: 'onStateChange', info }),
  }));
  msg(1);
  expect(slide.classList.contains('vidplay')).toBe(true);
  msg(2);
  await vi.advanceTimersByTimeAsync(350);
  expect(slide.classList.contains('vidplay')).toBe(false);
  hero.destroy();

  const silent = createHero([base, { ...base, id: 'h2' }], cfg);
  await vi.advanceTimersByTimeAsync(3_100);
  const s2 = silent.el.querySelector('.tide-hero-slide.on')!;
  s2.querySelector('iframe')!.dispatchEvent(new Event('load'));
  await vi.advanceTimersByTimeAsync(1_600 + 2_500);
  expect(s2.classList.contains('vidplay')).toBe(true);
  silent.destroy();
});
```

- [ ] **Step 2: Run.** `npx vitest run test/hero.test.ts`. Expected: the 2 new tests FAIL.

- [ ] **Step 3: Implement in `hero.ts`.**

Inside `createHero`, after `const syncPlaying = ...`, add:
```ts
  let playOffTimer: ReturnType<typeof setTimeout> | undefined;
  let silentTimer: ReturnType<typeof setTimeout> | undefined;
  /** `vidplay`: the trailer is really playing (backdrop hidden, video shown). Leaving it waits 300 ms (debounced). */
  function setPlay(i: number, on: boolean): void {
    const s = slides[i];
    if (!s || i !== cur) return;
    if (playOffTimer !== undefined) { clearTimeout(playOffTimer); playOffTimer = undefined; }
    if (on) s.classList.add('vidplay');
    else playOffTimer = setTimeout(() => { playOffTimer = undefined; s.classList.remove('vidplay'); }, 300);
  }
  function clearPlay(s: HTMLElement): void {
    if (playOffTimer !== undefined) { clearTimeout(playOffTimer); playOffTimer = undefined; }
    if (silentTimer !== undefined) { clearTimeout(silentTimer); silentTimer = undefined; }
    s.classList.remove('vidplay');
  }
```

In `stopVideo(s)`, add `clearPlay(s);` as the first line.

In `tryNext`'s `fail` function, add `clearPlay(s);` next to `s.classList.remove('vidon');`.

In the local video branch, after creating `v`, add:
```ts
      v.addEventListener('playing', () => { if (g === gen) setPlay(i, true); });
      v.addEventListener('pause', () => { if (g === gen) setPlay(i, false); });
      v.addEventListener('waiting', () => { if (g === gen) setPlay(i, false); });
```
(Keep the existing `{ once: true }` `playing` → `ok` listener.)

In the iframe `load` handler's 1500ms `setTimeout`, after `ok();`, add:
```ts
          if (silentTimer !== undefined) clearTimeout(silentTimer);
          silentTimer = setTimeout(() => { silentTimer = undefined; if (g === gen && !f._tideHeard) setPlay(i, true); }, 2500);
```

In `onYtMessage`, replace `if (state === 0) go(cur + 1); // ended` with:
```ts
    if (state === 1) setPlay(cur, true);
    else if (state === 2 || state === 3) setPlay(cur, false);
    else if (state === 0) go(cur + 1); // ended
```

In `clearTimers`, also clear both new timers:
```ts
    if (playOffTimer !== undefined) clearTimeout(playOffTimer);
    if (silentTimer !== undefined) clearTimeout(silentTimer);
    playOffTimer = silentTimer = undefined;
```
Because `clearTimers` is declared above the new `let`s, move the two `let playOffTimer / silentTimer` declarations up next to `let hsTimer`.

- [ ] **Step 4: CSS (fixes a, b, c, d)** in `web/src/home/hero.css`:

Replace the two `.tide-hero-vid` rules (`body.tide .tide-hero-vid { position: ...` and `.tide-hero-vid.show { opacity: 1; }`) with:
```css
body.tide .tide-hero-vid { position: absolute; inset: 0; overflow: hidden; opacity: 0; background: #000; transition: opacity .8s ease; }
/* Video only while it really plays (never its pause/buffer UI); the backdrop fades out underneath at the same time. */
body.tide .tide-hero-slide.vidplay .tide-hero-vid { opacity: 1; }
body.tide .tide-hero-bg { transition: opacity .8s ease; }
body.tide .tide-hero-slide.vidplay .tide-hero-bg { opacity: 0; }
```

Add one more layer to the **front** of `.tide-hero-shade`'s `background` list (bottom-right legibility shade for the T3 strip):
```css
  radial-gradient(ellipse 46% 42% at 100% 100%, rgba(0,0,0,.72) 0%, rgba(0,0,0,.45) 45%, rgba(0,0,0,0) 100%),
```

Replace the T3 rules for `.tide-t3-item`, `.tide-t3-item img` and `.tide-t3-bar` (desktop ones above `.tide-hero-meta-ph`) with:
```css
body.tide .tide-t3-item { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; background: none; border: 0; padding: 4px; margin: -4px; border-radius: 10px; cursor: pointer; color: #fff; outline: none !important; -webkit-tap-highlight-color: transparent; }
body.tide .tide-t3-item:focus-visible { box-shadow: 0 0 0 2px #fff; }
body.tide .tide-t3-item img { height: 34px; max-width: 150px; object-fit: contain; object-position: left bottom; filter: grayscale(1) brightness(1.35) drop-shadow(0 1px 6px rgba(0,0,0,.8)); opacity: .7; transition: filter .3s, opacity .3s, height .3s var(--tide-ease); }
body.tide .tide-t3-item.on img { filter: drop-shadow(0 1px 6px rgba(0,0,0,.8)); opacity: 1; height: 44px; }
body.tide .tide-t3-text { font-weight: 800; font-size: 14px; color: #d1d1d6; opacity: .7; max-width: 150px; text-align: left; text-shadow: 0 1px 6px rgba(0,0,0,.8); }
body.tide .tide-t3-bar { width: 100%; height: 3px; border-radius: 2px; background: #48484a; overflow: hidden; }
```
(Keep the `.tide-t3-item.on .tide-t3-text { color: #fff; }` rule, adding `opacity: 1`.)

- [ ] **Step 5: Run.** `cd web && npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add web/src/home/hero.ts web/src/home/hero.css web/test/hero.test.ts
git commit -m "fix: hero trailer hides backdrop only while playing, no YouTube pause UI, readable T3 strip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Generic takeover router + detail route helpers

**Files:**
- Modify: `web/src/router/selectors.ts`, `web/src/router/hook.ts` (rewrite)
- Test: `web/test/router.test.ts` (new). Existing `web/test/home.test.ts` router tests must still pass unchanged.

**Interfaces:**
- Produces in `selectors.ts`:
  - `SELECTORS.detailsHost = '#itemDetailPage.itemDetailPage:not(.hide)'`
  - `ROUTES.isDetails(loc?: Location): boolean`
  - `ROUTES.detailsParams(loc?: Location): URLSearchParams | null`
- Produces in `hook.ts`:
  - `export interface Takeover { id: string; rootClass: string; matches(cfg: ClientConfig, loc: Location): boolean; key(loc: Location): string; findHost(): HTMLElement | null; mount(host: HTMLElement, cfg: ClientConfig, loc: Location): Promise<(() => void) | null> }`
  - `mount` returning `null` means "declined, leave stock" (for example an unsupported item type). The router records `host+key` as declined and does not retry it until the key or host changes.
  - `export function initTakeover(t: Takeover, cfg: ClientConfig): () => void`
  - `export const HOME_TAKEOVER: Takeover`
  - `export function registerTakeover(t: Takeover): void` (details registers itself in Task 13)
  - `initRouter(cfg)` starts every registered takeover (home first) and returns one disposer
  - `shouldTakeOver` and `adminToast` stay exported unchanged

- [ ] **Step 1: Write the failing tests** `web/test/router.test.ts`:

```ts
import { initTakeover, type Takeover } from '../src/router/hook';
import { ROUTES, SELECTORS } from '../src/router/selectors';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: 't' };

test('detail route helpers', () => {
  expect(ROUTES.isDetails({ hash: '#/details?id=abc&serverId=s' } as Location)).toBe(true);
  expect(ROUTES.isDetails({ hash: '#/home' } as Location)).toBe(false);
  expect(ROUTES.detailsParams({ hash: '#/details?id=abc&season=2' } as Location)?.get('season')).toBe('2');
  expect(ROUTES.detailsParams({ hash: '#/movies' } as Location)).toBeNull();
});

test('details host is the visible cached view', () => {
  document.body.innerHTML = '<div id="itemDetailPage" class="page itemDetailPage hide" data-n="1"></div><div id="itemDetailPage" class="page itemDetailPage" data-n="2"></div>';
  expect(document.querySelector<HTMLElement>(SELECTORS.detailsHost)?.dataset.n).toBe('2');
});

function fakeTakeover(over: Partial<Takeover> = {}): Takeover & { mounts: string[] } {
  const mounts: string[] = [];
  return {
    mounts,
    id: 't', rootClass: 'tide-x',
    matches: () => location.hash.startsWith('#/details'),
    key: () => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id') ?? '',
    findHost: () => document.querySelector<HTMLElement>('#host:not(.hide)'),
    mount: async (host) => {
      const k = new URLSearchParams(location.hash.split('?')[1] ?? '').get('id') ?? '';
      mounts.push(k);
      const root = document.createElement('div');
      root.className = 'tide-x';
      host.prepend(root);
      return () => root.remove();
    },
    ...over,
  };
}

test('remounts when the key changes on the same host, unmounts when leaving', async () => {
  location.hash = '#/details?id=a';
  document.body.innerHTML = '<div id="host"></div>';
  const t = fakeTakeover();
  const stop = initTakeover(t, cfg);
  try {
    await vi.waitFor(() => expect(t.mounts).toEqual(['a']));
    location.hash = '#/details?id=b';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.waitFor(() => expect(t.mounts).toEqual(['a', 'b']));
    expect(document.querySelectorAll('.tide-x').length).toBe(1);
    location.hash = '#/home';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.waitFor(() => expect(document.querySelector('.tide-x')).toBeNull());
  } finally { stop(); }
});

test('declined mount (null) is not retried for the same host and key', async () => {
  location.hash = '#/details?id=p';
  document.body.innerHTML = '<div id="host"></div>';
  let calls = 0;
  const t = fakeTakeover({ mount: async () => { calls++; return null; } });
  const stop = initTakeover(t, cfg);
  try {
    await vi.waitFor(() => expect(calls).toBe(1));
    document.body.append(document.createElement('span')); // DOM churn
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(1);
    location.hash = '#/details?id=q';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.waitFor(() => expect(calls).toBe(2));
  } finally { stop(); }
});
```

- [ ] **Step 2: Run.** Expected: FAIL (`initTakeover` / `isDetails` missing).

- [ ] **Step 3: Implement.**

In `selectors.ts`, add to `SELECTORS`:
```ts
  /**
   * 12.4 detail page: legacy view `div#itemDetailPage.page.itemDetailPage` in `.mainAnimatedPages.skinBody`. Views
   * are cached: each visit may add another one and inactive views get `.hide`, so take the visible one.
   */
  detailsHost: '#itemDetailPage.itemDetailPage:not(.hide)',
```
and add to `ROUTES`:
```ts
  isDetails: (loc: Location = location) => /^#\/details\?/.test(loc.hash),
  detailsParams: (loc: Location = location): URLSearchParams | null =>
    /^#\/details\?/.test(loc.hash) ? new URLSearchParams(loc.hash.slice(loc.hash.indexOf('?') + 1)) : null,
```

Rewrite `web/src/router/hook.ts` (keep `shouldTakeOver`, `adminToast` and `nextFrame` as they are, plus the imports):

```ts
export interface Takeover {
  id: string;
  /** Class of the root element mount() adds as a direct child of the host. */
  rootClass: string;
  matches(cfg: ClientConfig, loc: Location): boolean;
  /** Identity of what is shown (home: constant; details: item id). A change remounts even on the same host. */
  key(loc: Location): string;
  findHost(): HTMLElement | null;
  /** Resolve an unmount function, or null to decline (leave stock) for this host + key. */
  mount(host: HTMLElement, cfg: ClientConfig, loc: Location): Promise<(() => void) | null>;
}

export const HOME_TAKEOVER: Takeover = {
  id: 'home',
  rootClass: 'tide-home',
  matches: (cfg, loc) => shouldTakeOver(cfg, loc),
  key: () => 'home',
  findHost: () => document.querySelector<HTMLElement>(SELECTORS.homeHost),
  mount: (host, cfg) => mountHome(host, cfg),
};

const extra: Takeover[] = [];
export function registerTakeover(t: Takeover): void {
  if (!extra.some((x) => x.id === t.id)) extra.push(t);
}

/**
 * Mounts a takeover whenever its route is active. jellyfin-web 12.4 removes / recreates / caches page hosts, so the
 * host is re-queried on every visit and a body MutationObserver remounts when our root is detached. A host whose
 * mount threw is never retried (a recreated host is a new element and gets a fresh attempt); a declined host + key
 * is skipped until the key or host changes.
 */
export function initTakeover(t: Takeover, cfg: ClientConfig): () => void {
  let unmount: (() => void) | null = null;
  let mountedHost: HTMLElement | null = null;
  let mountedKey = '';
  let mounting = false;
  let warned = false;
  let scheduled = false;
  let disposed = false;
  const failedHosts = new WeakSet<HTMLElement>();
  const declined = new WeakMap<HTMLElement, string>();
  const active = () => t.matches(cfg, location);

  const mountedOk = () => !!(unmount && mountedHost?.isConnected && mountedKey === t.key(location)
    && mountedHost.matches(':not(.hide)') && mountedHost.querySelector(`:scope > .${t.rootClass}`));
  const canTry = (host: HTMLElement | null) => !!host && !failedHosts.has(host) && declined.get(host) !== t.key(location);

  function teardown(): void {
    const u = unmount;
    unmount = null;
    mountedHost = null;
    mountedKey = '';
    u?.();
  }

  async function sync(): Promise<void> {
    if (disposed) return;
    if (!active()) { teardown(); return; }
    if (mounting) return;
    if (unmount) {
      if (mountedOk()) return;
      teardown();
    }
    mounting = true;
    try {
      let host = t.findHost();
      for (let i = 0; !host && i < 20 && active() && !disposed; i++) {
        await new Promise((r) => setTimeout(r, 250));
        host = t.findHost();
      }
      if (!active() || disposed) return;
      if (!host) {
        if (!warned) {
          console.warn(`[Tide] ${t.id} host not found; Tide verified for web ${WEB_VERIFIED_VERSION}. Keeping stock page.`);
          void adminToast(`Tide ${t.id} is off: this Jellyfin web version is not verified (Tide supports ${WEB_VERIFIED_VERSION}). Theme stays on.`);
        }
        warned = true;
        return;
      }
      if (!canTry(host)) return;
      const key = t.key(location);
      let u: (() => void) | null;
      try {
        u = await t.mount(host, cfg, location);
      } catch (e) {
        failedHosts.add(host);
        console.error(`[Tide] ${t.id} mount failed, keeping stock page`, e);
        return;
      }
      if (!u) { declined.set(host, key); return; }
      if (disposed || !active() || !host.isConnected || t.key(location) !== key) {
        u(); // route changed or host replaced while loading
      } else {
        unmount = u;
        mountedHost = host;
        mountedKey = key;
      }
    } finally {
      mounting = false;
    }
    schedule();
  }

  function schedule(): void {
    if (scheduled || disposed) return;
    scheduled = true;
    nextFrame(() => {
      scheduled = false;
      if (mounting || disposed) return;
      const on = active();
      if (unmount ? !on || !mountedOk() : on && canTry(t.findHost())) void sync();
    });
  }

  const unsubscribe = onLocationChange(() => void sync());
  const obs = new MutationObserver(() => schedule());
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  void sync();

  return () => {
    disposed = true;
    obs.disconnect();
    unsubscribe();
    teardown();
  };
}

export function initRouter(cfg: ClientConfig): () => void {
  const stops = [HOME_TAKEOVER, ...extra].map((t) => initTakeover(t, cfg));
  return () => stops.forEach((s) => s());
}
```

The MutationObserver now also watches `class` attributes, so a cached detail view gaining `.hide` triggers a check. The old `findHost` function is removed; `ROUTES` stays imported because `shouldTakeOver` uses it.

- [ ] **Step 4: Run.** `cd web && npm test && npm run typecheck`. Expected: PASS, including the old router tests in `home.test.ts`.

- [ ] **Step 5: Commit.**
```bash
git add web/src/router web/test/router.test.ts
git commit -m "refactor: generic takeover router (home + pluggable pages), detail route helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Detail data layer and pure rules

**Files:**
- Create: `web/src/api/item.ts`, `web/src/details/logic.ts`
- Modify: `web/src/api/actions.ts` (+ `playShuffle`, `refreshItem`)
- Test: `web/test/detailsLogic.test.ts`

**Interfaces:**
- Produces `api/item.ts`:
```ts
export interface JfPerson { Id: string; Name: string; Role?: string; Type: string; PrimaryImageTag?: string }
export interface JfStream { Type: string; Codec?: string; Profile?: string; Width?: number; Height?: number; VideoRange?: string; VideoRangeType?: string; DisplayTitle?: string; Language?: string; IsDefault?: boolean }
export interface JfSource { Id: string; Name?: string; Size?: number; MediaStreams?: JfStream[] }
export interface JfDetail extends JfItem {
  OfficialRating?: string; Taglines?: string[]; Studios?: { Name: string }[]; People?: JfPerson[];
  RemoteTrailers?: { Url?: string }[]; LocalTrailerCount?: number; PremiereDate?: string; EndDate?: string;
  Status?: string; MediaSources?: JfSource[]; ParentId?: string; SeasonId?: string;
}
export const DETAIL_FIELDS: string;
export function getItem(id: string): Promise<JfDetail>;
export function getSeasons(seriesId: string): Promise<JfItem[]>;
export function getEpisodes(seriesId: string, seasonId: string): Promise<JfItem[]>;
export function getNextUp(seriesId: string): Promise<JfItem | null>;
export function getResumeEpisode(seriesId: string): Promise<JfItem | null>;
export function getSimilar(id: string): Promise<JfItem[]>;
export function getLocalTrailerId(id: string): Promise<string | null>;
export function isAdmin(): Promise<boolean>;
```
- Produces `details/logic.ts`:
```ts
export function sortSeasons(s: JfItem[]): JfItem[];                         // specials (IndexNumber 0) last
export function chooseNextUp(resume: JfItem | null, nextUp: JfItem | null): JfItem | null;
export function defaultSeason(sorted: JfItem[], hint: number | null, next: JfItem | null): number; // index into sorted
export function rowStartIndex(eps: JfItem[], next: JfItem | null): number;  // first card shown
export function nextInSeason(eps: JfItem[], next: JfItem | null): JfItem | null;
export function episodeTag(ep: JfItem, next: JfItem | null): 'CONTINUE' | 'UP NEXT' | null;
export function yearSpan(item: JfDetail): string;
export function fmtBytes(n?: number): string | null;
export function subtitleSummary(langs: string[]): string;
export function aboutFacts(item: JfDetail): [string, string][];
export function fileFacts(src: JfSource | undefined): [string, string][];
export function castList(people: JfPerson[] | undefined, expanded: boolean): JfPerson[];
export function youtubeId(url?: string): string | null;
export function epLabel(ep: JfItem): string;  // "S3 E1"
```
- Produces in `actions.ts`: `export async function playShuffle(id: string): Promise<void>` and `export async function refreshItem(id: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests** `web/test/detailsLogic.test.ts`:

```ts
import { aboutFacts, castList, chooseNextUp, defaultSeason, episodeTag, epLabel, fileFacts, fmtBytes, nextInSeason, rowStartIndex, sortSeasons, subtitleSummary, youtubeId, yearSpan } from '../src/details/logic';
import type { JfItem } from '../src/types';

const s = (n: number, played = false, unplayed = 0): JfItem => ({ Id: `s${n}`, Name: n ? `Season ${n}` : 'Specials', Type: 'Season', IndexNumber: n, UserData: { Played: played, UnplayedItemCount: unplayed } });
const e = (n: number, o: Partial<JfItem> = {}): JfItem => ({ Id: `e${n}`, Name: `Ep ${n}`, Type: 'Episode', IndexNumber: n, ParentIndexNumber: 1, RunTimeTicks: 3e10, ...o });

test('seasons: specials last; default = hint, else next-up season, else first unwatched, else first', () => {
  const sorted = sortSeasons([s(0), s(1, true), s(2, false, 3), s(3, false, 10)]);
  expect(sorted.map((x) => x.IndexNumber)).toEqual([1, 2, 3, 0]);
  expect(defaultSeason(sorted, 3, null)).toBe(2);
  expect(defaultSeason(sorted, 9, null)).toBe(1); // bad hint ignored
  expect(defaultSeason(sorted, null, e(1, { ParentIndexNumber: 3 }))).toBe(2);
  expect(defaultSeason(sorted, null, null)).toBe(1);
  expect(defaultSeason(sortSeasons([s(1, true), s(2, true)]), null, null)).toBe(0);
  expect(defaultSeason(sortSeasons([s(0, false, 2), s(1, true)]), null, null)).toBe(0); // specials never default
});

test('next up: resume wins; tag and row start', () => {
  const r = e(4, { UserData: { PlaybackPositionTicks: 5 } });
  expect(chooseNextUp(r, e(5))).toBe(r);
  expect(chooseNextUp(null, e(5))?.Id).toBe('e5');
  expect(chooseNextUp(null, null)).toBeNull();
  const eps = [e(1, { UserData: { Played: true } }), e(2, { UserData: { Played: true } }), e(3), e(4)];
  expect(episodeTag(e(3), e(3))).toBe('UP NEXT');
  expect(episodeTag(e(3, { UserData: { PlaybackPositionTicks: 9 } }), e(3))).toBe('CONTINUE');
  expect(episodeTag(e(4), e(3))).toBeNull();
  expect(nextInSeason(eps, e(3))?.Id).toBe('e3');
  expect(nextInSeason(eps, null)?.Id).toBe('e3');
  expect(rowStartIndex(eps, e(3))).toBe(1);
  expect(rowStartIndex(eps.map((x) => ({ ...x, UserData: { Played: true } })), null)).toBe(0);
  expect(epLabel(e(1, { ParentIndexNumber: 3 }))).toBe('S3 E1');
});

test('formatting helpers', () => {
  expect(fmtBytes(80990828544)).toBe('75.4 GB');
  expect(fmtBytes(512 * 1024 * 1024)).toBe('512 MB');
  expect(fmtBytes(undefined)).toBeNull();
  expect(subtitleSummary(['English', 'Dutch', 'German', 'French', 'Spanish', 'Italian'])).toBe('English, Dutch +4');
  expect(subtitleSummary(['English', 'English', 'Dutch'])).toBe('English, Dutch');
  expect(youtubeId('https://www.youtube.com/watch?v=giXco2jaZ_4')).toBe('giXco2jaZ_4');
  expect(youtubeId('https://youtu.be/Klc__shdj88')).toBe('Klc__shdj88');
  expect(youtubeId('https://vimeo.com/1')).toBeNull();
  expect(yearSpan({ Id: 'x', Name: 'x', Type: 'Series', ProductionYear: 2008, Status: 'Ended', EndDate: '2015-02-18T00:00:00Z' })).toBe('2008–2015');
  expect(yearSpan({ Id: 'x', Name: 'x', Type: 'Series', ProductionYear: 2023, Status: 'Continuing' })).toBe('2023');
});

test('about facts skip empty values; movie vs series sets', () => {
  const movie = aboutFacts({
    Id: 'm', Name: 'M', Type: 'Movie', Genres: ['Action', 'Drama'], OfficialRating: 'PG-13', RunTimeTicks: 78145370000,
    PremiereDate: '2022-05-24T00:00:00Z', Studios: [{ Name: 'Paramount' }], People: [{ Id: 'p', Name: 'Joseph Kosinski', Type: 'Director' }],
  });
  expect(movie).toEqual([['Director', 'Joseph Kosinski'], ['Studio', 'Paramount'], ['Released', 'May 2022'], ['Rating', 'PG-13'], ['Genres', 'Action, Drama'], ['Runtime', '2h 10m']]);
  const series = aboutFacts({ Id: 's', Name: 'S', Type: 'Series', Status: 'Continuing', ChildCount: 3, Genres: ['Drama'] });
  expect(series).toEqual([['Status', 'Continuing'], ['Genres', 'Drama'], ['Seasons', '3']]);
});

test('file facts', () => {
  const f = fileFacts({
    Id: 'a', Size: 80990828544, MediaStreams: [
      { Type: 'Video', Codec: 'hevc', Profile: 'Main 10', Width: 3840, Height: 1608, VideoRangeType: 'HDR10' },
      { Type: 'Audio', DisplayTitle: 'Dolby TrueHD + Dolby Atmos - 7.1', IsDefault: true },
      { Type: 'Audio', DisplayTitle: 'Dolby Digital - 5.1' },
      { Type: 'Subtitle', Language: 'eng', DisplayTitle: 'English' }, { Type: 'Subtitle', Language: 'dut', DisplayTitle: 'Dutch' },
    ],
  });
  expect(f).toEqual([['Quality', '4K · HDR10'], ['Video', 'HEVC Main 10'], ['Audio', 'Dolby TrueHD + Dolby Atmos - 7.1'], ['Subtitles', 'English, Dutch'], ['Size on disk', '75.4 GB']]);
  expect(fileFacts(undefined)).toEqual([]);
});

test('cast: 12 actors by default; expanded adds the rest then crew in role order', () => {
  const actors = Array.from({ length: 15 }, (_, i) => ({ Id: `a${i}`, Name: `A${i}`, Type: 'Actor', Role: `R${i}` }));
  const crew = [{ Id: 'w', Name: 'W', Type: 'Writer' }, { Id: 'p', Name: 'P', Type: 'Producer' }, { Id: 'd', Name: 'D', Type: 'Director' }, { Id: 'c', Name: 'C', Type: 'Creator' }, { Id: 'x', Name: 'X', Type: 'GuestStar' }];
  expect(castList([...crew, ...actors], false).map((p) => p.Id)).toEqual(actors.slice(0, 12).map((a) => a.Id));
  expect(castList([...crew, ...actors], true).map((p) => p.Id)).toEqual([...actors.map((a) => a.Id), 'd', 'w', 'p', 'c', 'x']);
});
```

- [ ] **Step 2: Run.** Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** `web/src/api/item.ts`:

```ts
import { api, getSession, jfApiClient } from './client';
import type { JfItem } from '../types';

export interface JfPerson { Id: string; Name: string; Role?: string; Type: string; PrimaryImageTag?: string }
export interface JfStream { Type: string; Codec?: string; Profile?: string; Width?: number; Height?: number; VideoRange?: string; VideoRangeType?: string; DisplayTitle?: string; Language?: string; IsDefault?: boolean }
export interface JfSource { Id: string; Name?: string; Size?: number; MediaStreams?: JfStream[] }
export interface JfDetail extends JfItem {
  OfficialRating?: string; Taglines?: string[]; Studios?: { Name: string }[]; People?: JfPerson[];
  RemoteTrailers?: { Url?: string }[]; LocalTrailerCount?: number; PremiereDate?: string; EndDate?: string;
  Status?: string; MediaSources?: JfSource[]; ParentId?: string; SeasonId?: string;
}

export const DETAIL_FIELDS = 'People,Overview,Genres,Studios,Taglines,RemoteTrailers,LocalTrailerCount,MediaSources,MediaStreams,OfficialRating,CommunityRating,CriticRating,ProductionYear,PremiereDate,EndDate,Status,RunTimeTicks,ChildCount,ImageTags,BackdropImageTags';
const EP_FIELDS = 'Overview,RunTimeTicks,ImageTags,ParentIndexNumber,IndexNumber,SeriesId';
const CARD_FIELDS = 'Genres,DateCreated,ChildCount,ProductionYear,CommunityRating,CriticRating,RunTimeTicks,Overview';
const uid = () => getSession()?.userId ?? '';

export const getItem = (id: string) => api<JfDetail>(`/Items/${id}`, { query: { userId: uid(), Fields: DETAIL_FIELDS } });

export async function getSeasons(seriesId: string): Promise<JfItem[]> {
  return (await api<{ Items: JfItem[] }>(`/Shows/${seriesId}/Seasons`, { query: { userId: uid(), Fields: 'ImageTags,ChildCount', EnableUserData: true } })).Items ?? [];
}

export async function getEpisodes(seriesId: string, seasonId: string): Promise<JfItem[]> {
  return (await api<{ Items: JfItem[] }>(`/Shows/${seriesId}/Episodes`, { query: { userId: uid(), seasonId, Fields: EP_FIELDS, EnableUserData: true } })).Items ?? [];
}

export async function getNextUp(seriesId: string): Promise<JfItem | null> {
  const r = await api<{ Items: JfItem[] }>('/Shows/NextUp', { query: { userId: uid(), seriesId, Limit: 1, Fields: EP_FIELDS, EnableUserData: true } });
  return r.Items?.[0] ?? null;
}

export async function getResumeEpisode(seriesId: string): Promise<JfItem | null> {
  const r = await api<{ Items: JfItem[] }>('/UserItems/Resume', { query: { userId: uid(), parentId: seriesId, Limit: 1, MediaTypes: 'Video', Fields: EP_FIELDS, EnableUserData: true } });
  return r.Items?.[0] ?? null;
}

export async function getSimilar(id: string): Promise<JfItem[]> {
  return (await api<{ Items: JfItem[] }>(`/Items/${id}/Similar`, { query: { userId: uid(), Limit: 12, Fields: CARD_FIELDS, EnableUserData: true } })).Items ?? [];
}

export async function getLocalTrailerId(id: string): Promise<string | null> {
  const r = await api<{ Id: string }[]>(`/Items/${id}/LocalTrailers`, { query: { userId: uid() } });
  return r?.[0]?.Id ?? null;
}

export async function isAdmin(): Promise<boolean> {
  const c = jfApiClient() as unknown as { getCurrentUser?(): Promise<{ Policy?: { IsAdministrator?: boolean } }> } | null;
  const u = await c?.getCurrentUser?.().catch(() => null);
  return !!u?.Policy?.IsAdministrator;
}
```

Append to `web/src/api/actions.ts` (reuse `ownSessionId`):
```ts
/** Shuffle-play a series / collection in this browser (same PlayNow path as play()). */
export async function playShuffle(id: string): Promise<void> {
  try {
    const sessionId = await ownSessionId();
    if (!sessionId) throw new Error('own session not found');
    await api(`/Sessions/${sessionId}/Playing`, { method: 'POST', query: { playCommand: 'PlayShuffle', itemIds: id } });
  } catch (e) {
    console.warn('[Tide] shuffle failed', e);
  }
}

export async function refreshItem(id: string): Promise<void> {
  await api(`/Items/${id}/Refresh`, { method: 'POST', query: { Recursive: true, MetadataRefreshMode: 'Default', ImageRefreshMode: 'Default' } });
}
```

Implement `web/src/details/logic.ts`:

```ts
import { fmtRuntime } from '../ui/dom';
import type { JfItem } from '../types';
import type { JfDetail, JfPerson, JfSource } from '../api/item';

const idx = (x: JfItem) => x.IndexNumber ?? 0;
const played = (x: JfItem) => !!x.UserData?.Played;
const hasPos = (x: JfItem) => (x.UserData?.PlaybackPositionTicks ?? 0) > 0;

export function sortSeasons(s: JfItem[]): JfItem[] {
  return [...s].sort((a, b) => (idx(a) === 0 ? 1e6 : idx(a)) - (idx(b) === 0 ? 1e6 : idx(b)));
}

export function chooseNextUp(resume: JfItem | null, nextUp: JfItem | null): JfItem | null {
  return resume ?? nextUp ?? null;
}

export function defaultSeason(sorted: JfItem[], hint: number | null, next: JfItem | null): number {
  const by = (n: number | null | undefined) => (n === null || n === undefined ? -1 : sorted.findIndex((x) => idx(x) === n));
  const h = by(hint);
  if (h >= 0) return h;
  const n = by(next?.ParentIndexNumber);
  if (n >= 0) return n;
  const u = sorted.findIndex((x) => idx(x) !== 0 && !played(x) && (x.UserData?.UnplayedItemCount ?? 1) > 0);
  if (u >= 0) return u;
  const first = sorted.findIndex((x) => idx(x) !== 0);
  return first >= 0 ? first : 0;
}

/** The episode the row is "up to": the global next-up when it is in this season, else the first unwatched. */
export function nextInSeason(eps: JfItem[], next: JfItem | null): JfItem | null {
  if (next) {
    const hit = eps.find((e) => e.Id === next.Id);
    if (hit) return hit;
  }
  return eps.find((e) => !played(e)) ?? null;
}

/** First card in view: the one before the next-up episode (so you see where you were), else the first. */
export function rowStartIndex(eps: JfItem[], next: JfItem | null): number {
  const n = nextInSeason(eps, next);
  const i = n ? eps.indexOf(n) : -1;
  return i > 0 ? i - 1 : 0;
}

export function episodeTag(ep: JfItem, next: JfItem | null): 'CONTINUE' | 'UP NEXT' | null {
  if (!next || ep.Id !== next.Id) return null;
  return hasPos(ep) ? 'CONTINUE' : 'UP NEXT';
}

export const epLabel = (ep: JfItem) => `S${ep.ParentIndexNumber ?? 0} E${ep.IndexNumber ?? 0}`;

export function yearSpan(item: JfDetail): string {
  const start = item.ProductionYear;
  if (!start) return '';
  const end = item.EndDate ? new Date(item.EndDate).getUTCFullYear() : null;
  return item.Type === 'Series' && item.Status === 'Ended' && end && end !== start ? `${start}–${end}` : String(start);
}

export function fmtBytes(n?: number): string | null {
  if (!n) return null;
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`;
}

export function subtitleSummary(langs: string[]): string {
  const uniq = [...new Set(langs.filter(Boolean))];
  return uniq.length <= 2 ? uniq.join(', ') : `${uniq.slice(0, 2).join(', ')} +${uniq.length - 2}`;
}

const monthYear = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const people = (p: JfPerson[] | undefined, type: string) => (p ?? []).filter((x) => x.Type === type).map((x) => x.Name).join(', ');

export function aboutFacts(item: JfDetail): [string, string][] {
  const studio = (item.Studios ?? []).map((s) => s.Name).slice(0, 2).join(', ');
  const genres = (item.Genres ?? []).join(', ');
  const facts: [string, string][] = item.Type === 'Series'
    ? [['Studio', studio], ['Status', item.Status ?? ''], ['First aired', monthYear(item.PremiereDate)], ['Rating', item.OfficialRating ?? ''],
      ['Genres', genres], ['Seasons', item.ChildCount ? String(item.ChildCount) : ''], ['Creator', people(item.People, 'Creator')]]
    : [['Director', people(item.People, 'Director')], ['Studio', studio], ['Released', monthYear(item.PremiereDate)], ['Rating', item.OfficialRating ?? ''],
      ['Genres', genres], ['Runtime', fmtRuntime(item.RunTimeTicks)?.replace(/ 0(\d)m$/, ' $1m') ?? '']];
  return facts.filter(([, v]) => !!v);
}

function resLabel(w = 0, h = 0): string {
  if (w >= 3200 || h >= 2000) return '4K';
  if (w >= 1800 || h >= 1000) return '1080p';
  if (w >= 1200 || h >= 700) return '720p';
  return h ? `${h}p` : 'SD';
}

export function fileFacts(src: JfSource | undefined): [string, string][] {
  if (!src) return [];
  const streams = src.MediaStreams ?? [];
  const v = streams.find((s) => s.Type === 'Video');
  const a = streams.find((s) => s.Type === 'Audio' && s.IsDefault) ?? streams.find((s) => s.Type === 'Audio');
  const subs = streams.filter((s) => s.Type === 'Subtitle').map((s) => s.DisplayTitle?.split(' - ')[0] ?? s.Language ?? '');
  const range = v?.VideoRangeType && v.VideoRangeType !== 'SDR' ? v.VideoRangeType : '';
  const facts: [string, string][] = [
    ['Quality', v ? [resLabel(v.Width, v.Height), range].filter(Boolean).join(' · ') : ''],
    ['Video', v ? [v.Codec?.toUpperCase(), v.Profile].filter(Boolean).join(' ') : ''],
    ['Audio', a?.DisplayTitle ?? ''],
    ['Subtitles', subtitleSummary(subs)],
    ['Size on disk', fmtBytes(src.Size) ?? ''],
  ];
  return facts.filter(([, val]) => !!val);
}

const CREW = ['Director', 'Writer', 'Producer', 'Creator'];
export function castList(p: JfPerson[] | undefined, expanded: boolean): JfPerson[] {
  const all = p ?? [];
  const actors = all.filter((x) => x.Type === 'Actor');
  if (!expanded) return actors.slice(0, 12);
  const rank = (t: string) => { const i = CREW.indexOf(t); return i < 0 ? CREW.length : i; };
  const crew = all.filter((x) => x.Type !== 'Actor').sort((a, b) => rank(a.Type) - rank(b.Type));
  return [...actors, ...crew];
}

export function youtubeId(url?: string): string | null {
  const m = url?.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1]! : null;
}
```

Note: `fmtRuntime(78145370000)` returns `2h 10m` (130 minutes, so `String(10).padStart` gives `10`). The `replace` only strips a leading zero such as `1h 05m` → `1h 5m`.

- [ ] **Step 4: Run.** `npx vitest run test/detailsLogic.test.ts` and then `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/api/item.ts web/src/api/actions.ts web/src/details/logic.ts web/test/detailsLogic.test.ts
git commit -m "feat: detail page data layer and rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `wideCard` episode mode

**Files:**
- Modify: `web/src/ui/cards.ts` (`wideCard` options), `web/src/ui/cards.css`
- Test: `web/test/cards.test.ts`

**Interfaces:**
- Consumes: `play`, `setFavourite` (actions), `fmtRuntime`, `minutesLeft`, `progressRing`, `icon`.
- Produces: `export function wideCard(item: JfItem, opts?: { episode?: { tag: 'CONTINUE' | 'UP NEXT' | null } }): HTMLElement`
  - Default (no opts): unchanged.
  - Episode mode:
    - art: the episode `Primary`, falling back to the series `Backdrop/0`
    - no logo, `.tide-wide-ep` title block
    - info: title `N. Name`, sub from `episodeSub(item)`, `p.tide-wide-syn` synopsis
    - `.tide-wide-done` ✓ when watched, `.tide-wide-tag` when tagged
    - click plays
- Produces: `export function episodeSub(item: JfItem): string`, which returns `48m`, `48m · 12m left` or `48m · Watched`.

- [ ] **Step 1: Write the failing tests.** Append to `web/test/cards.test.ts` (the file already sets up `ApiClient` and mocks actions; if `play` is not mocked there, add `vi.mock('../src/api/actions', async (o) => ({ ...(await o<typeof import('../src/api/actions')>()), play: vi.fn(), openDetails: vi.fn(), setFavourite: vi.fn() }))` at the top):

```ts
import { episodeSub, wideCard } from '../src/ui/cards';
import { openDetails, play } from '../src/api/actions';

const ep = { Id: 'e3', Name: 'A Dark Web', Type: 'Episode', SeriesId: 'ser', IndexNumber: 3, ParentIndexNumber: 3, RunTimeTicks: 48 * 6e8, Overview: 'Juliette takes control.' };

test('episode mode: kicker + title at rest, no logo, synopsis on hover, click plays', () => {
  const c = wideCard(ep, { episode: { tag: null } });
  expect(c.querySelector('img.tide-wide-logo, .tide-wide-logo-text')).toBeNull();
  expect(c.querySelector('.tide-wide-ep-k')?.textContent).toBe('EPISODE 3');
  expect(c.querySelector('.tide-wide-ep-n')?.textContent).toBe('A Dark Web');
  expect(c.querySelector('.tide-wide-title')?.textContent).toBe('3. A Dark Web');
  expect(c.querySelector('.tide-wide-sub')?.textContent).toBe('48m');
  expect(c.querySelector('.tide-wide-syn')?.textContent).toBe('Juliette takes control.');
  expect(c.querySelector<HTMLImageElement>('.tide-wide-art')!.src).toContain('/Items/e3/Images/Primary');
  c.click();
  expect(play).toHaveBeenCalledWith('e3');
  expect(openDetails).not.toHaveBeenCalled();
});

test('episode mode: tags, watched check, specials, resume ring', () => {
  expect(wideCard(ep, { episode: { tag: 'UP NEXT' } }).querySelector('.tide-wide-tag')?.textContent).toBe('UP NEXT');
  const watched = wideCard({ ...ep, UserData: { Played: true } }, { episode: { tag: null } });
  expect(watched.querySelector('.tide-wide-done')).not.toBeNull();
  expect(watched.querySelector('.tide-wide-sub')?.textContent).toBe('48m · Watched');
  expect(wideCard({ ...ep, ParentIndexNumber: 0 }, { episode: { tag: null } }).querySelector('.tide-wide-ep-k')?.textContent).toBe('SPECIAL');
  const part = wideCard({ ...ep, UserData: { PlaybackPositionTicks: 36 * 6e8 } }, { episode: { tag: 'CONTINUE' } });
  expect(part.querySelector('.tide-wide-ring')).not.toBeNull();
  expect(episodeSub({ ...ep, UserData: { PlaybackPositionTicks: 36 * 6e8 } })).toBe('48m · 12m left');
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** in `web/src/ui/cards.ts`. Add `episodeSub`, and change `wideCard` to take options. Replace the whole `wideCard` function with:

```ts
export function episodeSub(item: JfItem): string {
  const rt = fmtRuntime(item.RunTimeTicks);
  const left = minutesLeft(item);
  const extra = item.UserData?.Played ? 'Watched' : left !== null && (item.UserData?.PlaybackPositionTicks ?? 0) > 0 ? `${left}m left` : null;
  return [rt, extra].filter(Boolean).join(' · ');
}

export interface WideCardOpts { episode?: { tag: 'CONTINUE' | 'UP NEXT' | null } }

export function wideCard(item: JfItem, opts: WideCardOpts = {}): HTMLElement {
  const epMode = !!opts.episode;
  const isEp = item.Type === 'Episode' && !!item.SeriesId;
  const logoId = isEp ? (item.SeriesId as string) : item.Id;
  const title = epMode ? `${item.IndexNumber ?? 0}. ${item.Name}` : isEp ? item.SeriesName ?? item.Name : item.Name;
  const ud = { ...item.UserData };
  const pct = !ud.Played && (ud.PlaybackPositionTicks ?? 0) > 0 ? Math.round(ud.PlayedPercentage ?? ((ud.PlaybackPositionTicks ?? 0) / (item.RunTimeTicks || 1)) * 100) : 0;

  const art = h('img', { class: 'tide-wide-art', alt: '', loading: 'lazy', decoding: 'async',
    src: isEp ? imageUrl(item.Id, 'Primary', 720) : imageUrl(item.Id, 'Backdrop/0', 720) }) as HTMLImageElement;
  art.onerror = () => {
    // Items without a backdrop fall back to their primary image once (episodes: to the series backdrop).
    if (art.dataset.fallback) { art.remove(); return; }
    art.dataset.fallback = '1';
    art.src = imageUrl(isEp ? (item.SeriesId as string) : item.Id, isEp ? 'Backdrop/0' : 'Primary', 720);
  };
  let rest: HTMLElement;
  if (epMode) {
    rest = h('span', { class: 'tide-wide-ep' },
      h('span', { class: 'tide-wide-ep-k' }, item.ParentIndexNumber === 0 ? 'SPECIAL' : `EPISODE ${item.IndexNumber ?? 0}`),
      h('span', { class: 'tide-wide-ep-n' }, item.Name));
  } else {
    const textLogo = () => h('span', { class: 'tide-wide-logo tide-wide-logo-text' }, title);
    rest = h('img', { class: 'tide-wide-logo', src: imageUrl(logoId, 'Logo', 360), alt: title, loading: 'lazy', decoding: 'async' });
    (rest as HTMLImageElement).onerror = () => rest.replaceWith(textLogo());
  }

  const fav = toggleButton({ icon: 'favorite', label: 'Favourite', on: !!ud.IsFavorite, cls: 'tide-fav-toggle tide-wide-btn',
    save: (on) => setFavourite(item.Id, on), onChange: (on) => { ud.IsFavorite = on; } });
  const playBtn = pct
    ? progressRing(pct, 'tide-ring tide-wide-ring')
    : h('span', { class: 'tide-wide-play tide-wide-btn' }, icon('play_arrow'));
  playBtn.setAttribute('role', 'button');
  playBtn.setAttribute('tabindex', '-1');
  playBtn.setAttribute('aria-label', pct ? `Resume ${title}` : `Play ${title}`);
  playBtn.addEventListener('click', stop(() => play(item.Id)));

  const card: HTMLElement = h('a', {
    class: `tide-card tide-wide${pct ? ' tide-wide-progress' : ''}${epMode ? ' tide-wide-epmode' : ''}`, href: '#', 'data-id': item.Id, 'aria-label': title,
    onclick: (e: Event) => {
      e.preventDefault();
      if (card.dataset.tideLongpress) { delete card.dataset.tideLongpress; return; }
      if (card.closest('[data-tide-dragged]')) return; // a drag-to-scroll just ended on this card
      if (epMode) void play(item.Id);
      else void openDetails(item.Id);
    },
  },
    h('span', { class: 'tide-card-shadow', 'aria-hidden': 'true' }),
    art, rest,
    epMode && opts.episode?.tag ? h('span', { class: 'tide-wide-tag' }, opts.episode.tag) : null,
    epMode && ud.Played ? h('span', { class: 'tide-wide-done', 'aria-label': 'Watched' }, icon('check')) : null,
    h('span', { class: 'tide-wide-info' },
      h('span', { class: 'tide-wide-title' }, title),
      h('span', { class: 'tide-wide-sub' }, epMode ? episodeSub(item) : hoverLine(item)),
      epMode && item.Overview ? h('span', { class: 'tide-wide-syn' }, item.Overview) : null),
    h('span', { class: 'tide-wide-acts' }, playBtn, fav));
  attachLongPress(card);
  return card;
}
```

Append to `web/src/ui/cards.css`:
```css
/* Episode mode: no logo; kicker + episode name at rest; synopsis joins the hover info. */
body.tide .tide-wide-ep { position: absolute; left: 20px; right: 80px; bottom: 22px; z-index: 2; display: flex; flex-direction: column; gap: 4px; transition: opacity .3s var(--tide-ease), transform .45s var(--tide-ease); }
body.tide .tide-wide-ep-k { font-size: 12px; font-weight: 800; letter-spacing: .08em; color: #d1d1d6; text-shadow: 0 1px 8px rgba(0,0,0,.6); }
body.tide .tide-wide-ep-n { font-size: 18px; font-weight: 700; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 8px rgba(0,0,0,.6); }
body.tide .tide-wide:is(:hover, :focus-within, .tide-pressed) .tide-wide-ep { opacity: 0; transform: translateY(-12px); }
body.tide .tide-wide-syn { font-size: 12.5px; line-height: 1.45; color: #c7c7cc; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal; text-shadow: 0 1px 8px rgba(0,0,0,.6); }
body.tide .tide-wide-tag { position: absolute; left: 16px; top: 14px; z-index: 2; font-size: 10.5px; font-weight: 800; letter-spacing: .04em; padding: 4px 8px; border-radius: 7px; background: #fff; color: #000; }
body.tide .tide-wide-done { position: absolute; right: 14px; top: 14px; z-index: 2; width: 26px; height: 26px; border-radius: 50%; background: #fff; color: #000; display: flex; align-items: center; justify-content: center; }
body.tide .tide-wide-done .tide-ms { font-size: 17px; }
```

- [ ] **Step 4: Run.** `cd web && npm test && npm run typecheck`. Expected: PASS (the existing wideCard tests are unchanged).

- [ ] **Step 5: Commit.**
```bash
git add web/src/ui/cards.ts web/src/ui/cards.css web/test/cards.test.ts
git commit -m "feat: episode mode for the landscape card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Popover and YouTube trailer modal

**Files:**
- Create: `web/src/ui/popover.ts`, `web/src/ui/trailerModal.ts`, `web/src/ui/overlays.css`
- Test: `web/test/overlays.test.ts`

**Interfaces:**
- Produces:
  - `export function openPopover(anchor: HTMLElement, content: HTMLElement, opts?: { align?: 'left' | 'right'; onClose?: () => void }): () => void`
    - It appends `.tide-pop` (containing `content`) to `anchor.parentElement`, which must be `position: relative`.
    - Focus moves to the first `[role=menuitem]`.
    - ↑/↓ move between menu items.
    - Esc, an outside `pointerdown`, or the returned close function closes it. Closing calls `onClose` and returns focus to the anchor.
  - `export function menuItem(label: string, iconName: string | null, run: () => void, extra?: HTMLElement | null): HTMLElement`: a `button[role=menuitem].tide-pop-item`.
  - `export function openYouTubeModal(id: string): () => void`
    - Opens `.tide-trailer` on `<body>`: an iframe `https://www.youtube-nocookie.com/embed/{id}?autoplay=1&rel=0&modestbranding=1&playsinline=1` and a close button.
    - Esc or ✕ closes.
    - While it is open, `body` gets the `tide-modal-open` class.

- [ ] **Step 1: Write the failing tests** `web/test/overlays.test.ts`:

```ts
import { menuItem, openPopover } from '../src/ui/popover';
import { openYouTubeModal } from '../src/ui/trailerModal';

afterEach(() => { document.body.innerHTML = ''; document.body.className = ''; });

test('popover: focus first item, arrows move, Esc closes and returns focus', () => {
  const wrap = document.createElement('div');
  const anchor = document.createElement('button');
  wrap.append(anchor);
  document.body.append(wrap);
  const ran: string[] = [];
  const list = document.createElement('div');
  list.append(menuItem('One', null, () => ran.push('1')), menuItem('Two', 'check', () => ran.push('2')));
  const onClose = vi.fn();
  openPopover(anchor, list, { onClose });
  const items = [...document.querySelectorAll<HTMLElement>('.tide-pop [role=menuitem]')];
  expect(document.activeElement).toBe(items[0]);
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(document.activeElement).toBe(items[1]);
  items[1]!.click();
  expect(ran).toEqual(['2']);
  expect(document.querySelector('.tide-pop')).toBeNull(); // picking closes
  openPopover(anchor, list, { onClose });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(document.querySelector('.tide-pop')).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(document.activeElement).toBe(anchor);
});

test('popover closes on outside pointerdown', () => {
  const wrap = document.createElement('div');
  const anchor = document.createElement('button');
  wrap.append(anchor);
  document.body.append(wrap);
  const c = document.createElement('div');
  c.append(menuItem('One', null, () => {}));
  openPopover(anchor, c);
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(document.querySelector('.tide-pop')).toBeNull();
});

test('youtube modal embeds no-cookie autoplay and closes on Esc', () => {
  openYouTubeModal('giXco2jaZ_4');
  const f = document.querySelector('.tide-trailer iframe');
  expect(f?.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/giXco2jaZ_4?autoplay=1');
  expect(document.body.classList.contains('tide-modal-open')).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(document.querySelector('.tide-trailer')).toBeNull();
  expect(document.body.classList.contains('tide-modal-open')).toBe(false);
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** `web/src/ui/popover.ts`:

```ts
import './overlays.css';
import { h, icon } from './dom';

export function menuItem(label: string, iconName: string | null, run: () => void, extra: HTMLElement | null = null): HTMLElement {
  return h('button', { class: 'tide-pop-item', type: 'button', role: 'menuitem', 'data-run': '1', onclick: (e: Event) => { e.preventDefault(); (e.currentTarget as HTMLElement).dispatchEvent(new CustomEvent('tide-pick', { bubbles: true })); run(); } },
    iconName ? icon(iconName) : null, h('span', { class: 'tide-pop-label' }, label), extra);
}

export function openPopover(anchor: HTMLElement, content: HTMLElement, opts: { align?: 'left' | 'right'; onClose?: () => void } = {}): () => void {
  const pop = h('div', { class: `tide-pop tide-pop-${opts.align ?? 'left'}`, role: 'menu' }, content);
  anchor.parentElement!.append(pop);
  anchor.setAttribute('aria-expanded', 'true');
  const items = () => [...pop.querySelectorAll<HTMLElement>('[role=menuitem]')];
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    pop.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    opts.onClose?.();
    anchor.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    if (next) { e.preventDefault(); next.focus(); }
  };
  const onDown = (e: Event) => { if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close(); };
  pop.addEventListener('tide-pick', () => close());
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  (pop.querySelector<HTMLElement>('[role=menuitem][aria-current="true"]') ?? items()[0])?.focus();
  return close;
}
```

Implement `web/src/ui/trailerModal.ts`:

```ts
import './overlays.css';
import { h, icon } from './dom';

export function openYouTubeModal(id: string): () => void {
  const frame = h('iframe', {
    src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: true, title: 'Trailer', referrerpolicy: 'strict-origin-when-cross-origin',
  });
  const closeBtn = h('button', { class: 'tide-ib tide-trailer-close', type: 'button', 'aria-label': 'Close trailer' }, icon('close'));
  const el = h('div', { class: 'tide-trailer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Trailer' }, h('div', { class: 'tide-trailer-box' }, frame), closeBtn);
  const close = () => {
    el.remove();
    document.body.classList.remove('tide-modal-open');
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  closeBtn.addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.classList.add('tide-modal-open');
  document.body.append(el);
  closeBtn.focus();
  return close;
}
```

Create `web/src/ui/overlays.css`:

```css
body.tide .tide-pop { position: absolute; top: calc(100% + 10px); z-index: 30; min-width: 220px; max-height: 420px; overflow: auto; scrollbar-width: none;
  background: #1c1c1e; border-radius: 18px; padding: 8px; box-shadow: 0 30px 60px rgba(0,0,0,.8);
  transform-origin: top left; animation: tide-pop-in .3s var(--tide-ease); }
body.tide .tide-pop-right { right: 0; transform-origin: top right; }
body.tide .tide-pop-left { left: 0; }
@keyframes tide-pop-in { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
body.tide .tide-pop-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: 0; border-radius: 12px; background: none; color: var(--tide-tx);
  font: 600 15px var(--tide-font); text-align: left; cursor: pointer; outline: none; }
body.tide .tide-pop-item:is(:hover, :focus-visible) { background: #2a2a2e; }
body.tide .tide-pop-item[aria-current="true"] { background: #fff; color: #000; }
body.tide .tide-pop-item .tide-ms { font-size: 20px; }
body.tide .tide-pop-label { flex: 1; min-width: 0; }
body.tide.tide-modal-open { overflow: hidden; }
body.tide .tide-trailer { position: fixed; inset: 0; z-index: 4000; background: #000; display: flex; align-items: center; justify-content: center; animation: tide-fade .3s ease; }
@keyframes tide-fade { from { opacity: 0; } to { opacity: 1; } }
body.tide .tide-trailer-box { width: min(1280px, 92vw); aspect-ratio: 16/9; }
body.tide .tide-trailer-box iframe { width: 100%; height: 100%; border: 0; border-radius: 14px; }
body.tide .tide-trailer-close { position: absolute; top: 24px; right: 24px; width: 48px; height: 48px; }
@media (prefers-reduced-motion: reduce) { body.tide .tide-pop, body.tide .tide-trailer { animation: none; } }
```

- [ ] **Step 4: Run.** `cd web && npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/ui/popover.ts web/src/ui/trailerModal.ts web/src/ui/overlays.css web/test/overlays.test.ts
git commit -m "feat: popover menu and YouTube trailer modal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Detail header and Next up strip

**Files:**
- Create: `web/src/details/header.ts`, `web/src/details/nextUp.ts`, `web/src/details/details.css` (header + strip part)
- Test: `web/test/detailsHeader.test.ts`

**Interfaces:**
- Consumes: `JfDetail`, `getLocalTrailerId`, `isAdmin` (api/item); `play`, `playShuffle`, `refreshItem`, `setFavourite`, `setWatched` (actions); `progressRing`, `minutesLeft` (cards); `toggleButton`; `qualityBadge`; `openPopover`, `menuItem`; `openYouTubeModal`; `yearSpan`, `youtubeId`, `epLabel` (logic); `fmtRuntime`, `h`, `icon`; `imageUrl`.
- Produces:
  - `export interface Header { el: HTMLElement; col: HTMLElement; setTarget(ep: JfItem | null): void; setQuality(q: Quality | null): void }`
  - `export function renderHeader(item: JfDetail): Header`. For a series, the primary button starts as a disabled `Play` until `setTarget` is called.
  - `export function primaryLabel(item: JfDetail, ep: JfItem | null): { text: string; left: string | null; pct: number; target: string }`
  - `export function renderNextUp(ep: JfItem): HTMLElement`

- [ ] **Step 1: Write the failing tests** `web/test/detailsHeader.test.ts`:

```ts
import { primaryLabel, renderHeader } from '../src/details/header';
import { renderNextUp } from '../src/details/nextUp';
import { play } from '../src/api/actions';
import type { JfDetail } from '../src/api/item';

vi.mock('../src/api/actions', async (o) => ({ ...(await o<typeof import('../src/api/actions')>()), play: vi.fn(), setFavourite: vi.fn(), setWatched: vi.fn(), playShuffle: vi.fn(), refreshItem: vi.fn() }));
beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u', getCurrentUser: async () => ({ Policy: { IsAdministrator: false } }) };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
});
afterEach(() => vi.restoreAllMocks());

const movie: JfDetail = { Id: 'm', Name: 'Top Gun: Maverick', Type: 'Movie', ProductionYear: 2022, Genres: ['Action', 'Drama'], RunTimeTicks: 78145370000,
  CommunityRating: 8.158, CriticRating: 96, OfficialRating: 'PG-13', Taglines: ['Feel the need.'], Overview: 'Pete.', RemoteTrailers: [{ Url: 'https://www.youtube.com/watch?v=giXco2jaZ_4' }],
  UserData: { PlaybackPositionTicks: 46769410000, PlayedPercentage: 59.8, IsFavorite: false, Played: false } };
const series: JfDetail = { Id: 's', Name: 'Silo', Type: 'Series', ProductionYear: 2023, Genres: ['Sci-Fi & Fantasy'], ChildCount: 3, CommunityRating: 8.2, OfficialRating: 'TV-MA', Overview: 'Silo.', Status: 'Continuing' };
const ep = { Id: 'e1', Name: 'Who Are You?', Type: 'Episode', SeriesId: 's', IndexNumber: 1, ParentIndexNumber: 3, RunTimeTicks: 51 * 6e8, UserData: { PlaybackPositionTicks: 13 * 6e8 } };

test('primary label rules', () => {
  expect(primaryLabel(movie, null)).toEqual({ text: 'Resume', left: '52m left', pct: 60, target: 'm' });
  expect(primaryLabel({ ...movie, UserData: {} }, null)).toEqual({ text: 'Play', left: null, pct: 0, target: 'm' });
  expect(primaryLabel(series, ep)).toEqual({ text: 'Resume S3 E1', left: '38m left', pct: 25, target: 'e1' });
  expect(primaryLabel(series, { ...ep, UserData: {} })).toEqual({ text: 'Play S3 E1', left: '51m', pct: 0, target: 'e1' });
});

test('movie header: meta line, tagline, buttons, trailer opens youtube modal, primary plays', async () => {
  const hd = renderHeader(movie);
  document.body.append(hd.el);
  const meta = hd.el.querySelector('.tide-dh-meta')!.textContent!;
  expect(meta).toContain('2022');
  expect(meta).toContain('Action');
  expect(meta).toContain('2h 10m');
  expect(meta).toContain('8.2');
  expect(meta).toContain('96%');
  expect(hd.el.querySelector('.tide-dh-meta .tide-chip')?.textContent).toBe('PG-13');
  expect(hd.el.querySelector('.tide-dh-tag')?.textContent).toBe('Feel the need.');
  expect(hd.el.querySelector('.tide-dh-primary')?.textContent).toContain('Resume');
  expect(hd.el.querySelectorAll('.tide-dh-btns > *').length).toBe(5); // primary, trailer, ♥, ✓, ⋯
  (hd.el.querySelector('.tide-dh-primary') as HTMLButtonElement).click();
  expect(play).toHaveBeenCalledWith('m');
  (hd.el.querySelector('.tide-dh-trailer') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.querySelector('.tide-trailer iframe')?.getAttribute('src')).toContain('giXco2jaZ_4'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  hd.el.remove();
});

test('series header: no trailer button without trailers; primary waits for setTarget', () => {
  const hd = renderHeader(series);
  expect(hd.el.querySelector('.tide-dh-trailer')).toBeNull();
  const p = hd.el.querySelector<HTMLButtonElement>('.tide-dh-primary')!;
  expect(p.disabled).toBe(true);
  hd.setTarget(ep);
  expect(p.disabled).toBe(false);
  expect(p.textContent).toContain('Resume S3 E1');
  expect(p.textContent).toContain('38m left');
  p.click();
  expect(play).toHaveBeenCalledWith('e1');
});

test('next up strip', () => {
  const s = renderNextUp(ep);
  expect(s.querySelector('.tide-nu-k')?.textContent).toBe('NEXT UP · S3 E1');
  expect(s.querySelector('.tide-nu-t')?.textContent).toBe('Who Are You?');
  expect(s.querySelector('.tide-nu-m')?.textContent).toBe('38m left');
  expect(s.querySelector('.tide-nu-th .tide-nu-pb')).not.toBeNull();
  s.click();
  expect(play).toHaveBeenCalledWith('e1');
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** `web/src/details/nextUp.ts`:

```ts
import { imageUrl } from '../api/client';
import { play } from '../api/actions';
import { fmtRuntime, h, icon } from '../ui/dom';
import { minutesLeft } from '../ui/cards';
import { epLabel } from './logic';
import type { JfItem } from '../types';

export function renderNextUp(ep: JfItem): HTMLElement {
  const pos = ep.UserData?.PlaybackPositionTicks ?? 0;
  const pct = pos && ep.RunTimeTicks ? Math.round((pos / ep.RunTimeTicks) * 100) : 0;
  const left = pos ? `${minutesLeft(ep) ?? 0}m left` : fmtRuntime(ep.RunTimeTicks) ?? '';
  const thumb = h('span', { class: 'tide-nu-th' });
  thumb.style.backgroundImage = `url("${imageUrl(ep.Id, 'Primary', 400)}")`;
  if (pct) thumb.append(h('span', { class: 'tide-nu-pb' }, h('i', { style: `transform:scaleX(${pct / 100})` })));
  return h('button', { class: 'tide-nu', type: 'button', 'aria-label': `Play ${epLabel(ep)} ${ep.Name}`, onclick: () => void play(ep.Id) },
    thumb,
    h('span', { class: 'tide-nu-tx' },
      h('span', { class: 'tide-nu-k' }, `NEXT UP · ${epLabel(ep)}`),
      h('span', { class: 'tide-nu-t' }, ep.Name),
      h('span', { class: 'tide-nu-m' }, left)),
    h('span', { class: 'tide-nu-go', 'aria-hidden': 'true' }, icon('play_arrow')));
}
```

Implement `web/src/details/header.ts`:

```ts
import { imageUrl } from '../api/client';
import { play, playShuffle, refreshItem, setFavourite, setWatched } from '../api/actions';
import { getLocalTrailerId, isAdmin, type JfDetail } from '../api/item';
import { fmtRuntime, h, icon } from '../ui/dom';
import { minutesLeft, progressRing } from '../ui/cards';
import { toggleButton } from '../ui/toggle';
import { qualityBadge } from '../ui/quality';
import { menuItem, openPopover } from '../ui/popover';
import { openYouTubeModal } from '../ui/trailerModal';
import { epLabel, yearSpan, youtubeId } from './logic';
import type { JfItem, Quality } from '../types';

export interface Header { el: HTMLElement; col: HTMLElement; setTarget(ep: JfItem | null): void; setQuality(q: Quality | null): void }

export function primaryLabel(item: JfDetail, ep: JfItem | null): { text: string; left: string | null; pct: number; target: string } {
  const t = item.Type === 'Series' ? ep : item;
  if (!t) return { text: 'Play', left: null, pct: 0, target: item.Id };
  const pos = t.UserData?.PlaybackPositionTicks ?? 0;
  const pct = pos && !t.UserData?.Played ? Math.round(t.UserData?.PlayedPercentage ?? (pos / (t.RunTimeTicks || 1)) * 100) : 0;
  const suffix = item.Type === 'Series' ? ` ${epLabel(t)}` : '';
  const left = pct ? `${minutesLeft(t) ?? 0}m left` : item.Type === 'Series' ? fmtRuntime(t.RunTimeTicks) : null;
  return { text: `${pct ? 'Resume' : 'Play'}${suffix}`, left, pct, target: t.Id };
}

function metaLine(item: JfDetail): HTMLElement {
  const parts: (Node | null)[] = [
    yearSpan(item) ? h('span', {}, yearSpan(item)) : null,
    item.Genres?.[0] ? h('span', {}, item.Genres[0]) : null,
    item.Type === 'Series'
      ? (item.ChildCount ? h('span', {}, `${item.ChildCount} season${item.ChildCount === 1 ? '' : 's'}`) : null)
      : (fmtRuntime(item.RunTimeTicks) ? h('span', {}, fmtRuntime(item.RunTimeTicks)!) : null),
    item.CommunityRating ? h('span', {}, icon('star', 'tide-star'), ` ${item.CommunityRating.toFixed(1)}`) : null,
    item.Type === 'Movie' && item.CriticRating ? h('span', { class: 'tide-dh-critic' }, h('i', { class: 'tide-dh-dot', 'aria-hidden': 'true' }), ` ${item.CriticRating}%`) : null,
  ];
  const facts = parts.filter((n): n is HTMLElement => !!n);
  const out: Node[] = [];
  facts.forEach((n, i) => { if (i) out.push(h('span', { class: 'tide-hero-dot', 'aria-hidden': 'true' }, '·')); out.push(n); });
  return h('div', { class: 'tide-dh-meta' }, ...out,
    item.OfficialRating ? h('span', { class: 'tide-chip' }, item.OfficialRating) : null,
    h('span', { class: 'tide-dh-q' }));
}

export function renderHeader(item: JfDetail): Header {
  const poster = h('div', { class: 'tide-dh-poster' });
  poster.style.backgroundImage = `url("${imageUrl(item.Id, 'Primary', 700)}")`;
  const titleText = () => h('h1', { class: 'tide-dh-title' }, item.Name);
  const logo: HTMLElement = h('img', { class: 'tide-dh-logo', src: imageUrl(item.Id, 'Logo', 900), alt: item.Name });
  (logo as HTMLImageElement).onerror = () => logo.replaceWith(titleText());

  const desc = h('p', { class: 'tide-dh-desc', tabindex: '0' }, item.Overview ?? '');
  desc.addEventListener('click', () => desc.classList.toggle('open'));

  // Primary: ring + label + dim time (R3, same parts as the hero Resume).
  const primary = h('button', { class: 'tide-btn tide-btn-w tide-btn-lg tide-dh-primary', type: 'button' }) as HTMLButtonElement;
  let target = item.Id;
  primary.addEventListener('click', () => void play(target));
  const paint = (ep: JfItem | null) => {
    const l = primaryLabel(item, ep);
    target = l.target;
    primary.replaceChildren(
      l.pct ? progressRing(l.pct, 'tide-ring tide-hero-ring') : icon('play_arrow'),
      h('span', {}, l.text),
      l.left ? h('span', { class: 'tide-hero-left' }, l.left) : null);
  };
  if (item.Type === 'Series') { primary.disabled = true; primary.append(icon('play_arrow'), h('span', {}, 'Play')); } else paint(null);

  const yt = youtubeId(item.RemoteTrailers?.map((t) => t.Url).find((u) => youtubeId(u)));
  const trailer = (item.LocalTrailerCount ?? 0) > 0 || yt
    ? h('button', { class: 'tide-btn tide-btn-lg tide-dh-trailer', type: 'button', onclick: async () => {
      const local = (item.LocalTrailerCount ?? 0) > 0 ? await getLocalTrailerId(item.Id).catch(() => null) : null;
      if (local) void play(local);
      else if (yt) openYouTubeModal(yt);
    } }, icon('movie'), 'Trailer')
    : null;
  const fav = toggleButton({ icon: 'favorite', label: 'Favourite', on: !!item.UserData?.IsFavorite, cls: 'tide-ib-xl tide-fav-toggle', save: (on) => setFavourite(item.Id, on) });
  const seen = toggleButton({ icon: 'check', label: 'Watched', on: !!item.UserData?.Played, cls: 'tide-ib-xl', save: (on) => setWatched(item.Id, on) });

  const more = h('button', { class: 'tide-ib tide-ib-xl tide-dh-more', type: 'button', 'aria-label': 'More', 'aria-haspopup': 'menu' }, icon('more_horiz'));
  more.addEventListener('click', async () => {
    const list = h('div', {});
    const pos = item.Type === 'Movie' ? item.UserData?.PlaybackPositionTicks ?? 0 : 0;
    if (item.Type === 'Series' || pos > 0) list.append(menuItem('Play from start', 'replay', () => void play(target, 0)));
    if (item.Type === 'Series') list.append(menuItem('Shuffle', 'shuffle', () => void playShuffle(item.Id)));
    list.append(menuItem('Copy link', 'link', () => void navigator.clipboard?.writeText(location.href)));
    if (await isAdmin()) {
      list.append(menuItem('Refresh metadata', 'refresh', () => void refreshItem(item.Id)));
      list.append(menuItem('Edit metadata', 'edit', () => { location.hash = `#/metadata?id=${encodeURIComponent(item.Id)}`; }));
    }
    openPopover(more, list, { align: 'left' });
  });
  const moreWrap = h('span', { class: 'tide-dh-morewrap' }, more);

  const btns = h('div', { class: 'tide-dh-btns' }, primary, trailer, fav, seen, moreWrap);
  const col = h('div', { class: 'tide-dh-col' },
    logo, metaLine(item),
    item.Type === 'Movie' && item.Taglines?.[0] ? h('div', { class: 'tide-dh-tag' }, item.Taglines[0]) : null,
    desc, btns);
  const el = h('header', { class: 'tide-dh' }, poster, col);
  return {
    el, col,
    setTarget: (ep) => { primary.disabled = false; paint(ep); },
    setQuality: (q) => { const b = qualityBadge(q, true); const slot = el.querySelector('.tide-dh-q'); if (slot) slot.replaceChildren(...(b ? [b] : [])); },
  };
}
```

Create `web/src/details/details.css` with the header and strip styles (later tasks append to this file):

```css
/* ── Detail page ─────────────────────────────────────────────────────────────── */
body.tide .tide-details { position: relative; isolation: isolate; color: var(--tide-tx); padding: 40px 0 96px; min-height: 100vh;
  --tide-gap: 22px; --tide-n: 3.4; --tide-cw: calc((100vw - 2 * var(--tide-gutter) - var(--tide-gap) * (var(--tide-n) - 1.4)) / var(--tide-n)); }
@media (min-width: 1800px) { body.tide .tide-details { --tide-n: 4.4; } }
@media (max-width: 1399px) { body.tide .tide-details { --tide-n: 2.6; } }
@media (max-width: 999px) { body.tide .tide-details { --tide-n: 1.6; } }
@media (max-width: 699px) { body.tide .tide-details { --tide-n: 1.2; --tide-gap: 14px; } }
body.tide #itemDetailPage.tide-taken > :not(.tide-details) { display: none !important; }
body.tide .tide-dsec { margin-top: 56px; }
body.tide .tide-dsec-h { display: flex; align-items: center; gap: 14px; padding: 0 var(--tide-gutter); }
body.tide .tide-dsec-h h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -.02em; }

/* Header (C2) */
body.tide .tide-dh { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 56px; align-items: end; padding: 0 var(--tide-gutter); }
body.tide .tide-dh-poster { aspect-ratio: 2/3; border-radius: 22px; background: center / cover #1d1d20; box-shadow: 0 50px 100px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.06); }
body.tide .tide-dh-logo { display: block; max-width: min(440px, 100%); max-height: 150px; object-fit: contain; object-position: left bottom; margin-bottom: 20px; filter: drop-shadow(0 4px 24px rgba(0,0,0,.6)); }
body.tide .tide-dh-title { margin: 0 0 18px; font-size: 48px; font-weight: 800; letter-spacing: -.03em; line-height: 1; }
body.tide .tide-dh-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 16px; font-weight: 500; color: #e5e5ea; }
body.tide .tide-dh-meta .tide-ms { font-size: 1.1em; margin-top: -2px; }
body.tide .tide-dh-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--tide-critic); vertical-align: middle; }
body.tide .tide-dh-tag { font-size: 13px; font-style: italic; color: #a1a1a6; margin-top: 8px; }
body.tide .tide-dh-desc { color: #d1d1d6; font-size: 15px; line-height: 1.6; margin: 14px 0 0; max-width: 760px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }
body.tide .tide-dh-desc.open { -webkit-line-clamp: unset; display: block; }
body.tide .tide-dh-btns { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 26px; }
body.tide .tide-dh-btns .tide-btn-lg { height: 54px; }
body.tide .tide-dh-btns .tide-ib-xl { width: 54px; height: 54px; }
body.tide .tide-dh-primary[disabled] { opacity: .6; cursor: default; }
body.tide .tide-dh-morewrap { position: relative; }

/* Next up strip (N2) */
body.tide .tide-nu { display: flex; align-items: center; gap: 16px; margin-top: 22px; max-width: 560px; width: 100%; padding: 10px 20px 10px 10px; border: 0; border-radius: 18px; background: #141416; color: var(--tide-tx); cursor: pointer; text-align: left; font: inherit; transition: background-color .3s var(--tide-ease); }
body.tide .tide-nu:is(:hover, :focus-visible) { background: #1d1d20; outline: none; }
body.tide .tide-nu-th { position: relative; flex: 0 0 150px; aspect-ratio: 16/9; border-radius: 12px; background: center / cover #2a2a2e; overflow: hidden; }
body.tide .tide-nu-pb { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: #3a3a3c; }
body.tide .tide-nu-pb i { display: block; height: 100%; background: #fff; transform-origin: left center; }
body.tide .tide-nu-tx { display: flex; flex-direction: column; min-width: 0; gap: 3px; }
body.tide .tide-nu-k { font-size: 12px; font-weight: 800; letter-spacing: .12em; color: #a1a1a6; }
body.tide .tide-nu-t { font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
body.tide .tide-nu-m { font-size: 13px; color: #a1a1a6; }
body.tide .tide-nu-go { margin-left: auto; flex: 0 0 44px; width: 44px; height: 44px; border-radius: 50%; background: #fff; color: #000; display: flex; align-items: center; justify-content: center; }
```

Add the import to `header.ts`: `import './details.css';` as its first line.

- [ ] **Step 4: Run.** `cd web && npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/details web/test/detailsHeader.test.ts
git commit -m "feat: detail header (C2) and Next up strip (N2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Episodes section (season dropdown + episode row)

**Files:**
- Create: `web/src/details/episodes.ts`, append CSS to `web/src/details/details.css`
- Test: `web/test/detailsEpisodes.test.ts`

**Interfaces:**
- Consumes:
  - `getEpisodes`
  - `sortSeasons`, `rowStartIndex`, `nextInSeason`, `episodeTag`
  - `wideCard(item, { episode: { tag } })`
  - `createScroller`
  - `animator`, `cardSpans`, `PAGE_MS`
  - `openPopover`, `menuItem`
  - `imageUrl`
- Produces: `export function renderEpisodes(seriesId: string, sorted: JfItem[], startIdx: number, next: JfItem | null, firstEps: JfItem[]): { el: HTMLElement; dispose(): void }`
  - `sorted` is already passed through `sortSeasons`, and `firstEps` are the episodes of `sorted[startIdx]` (already fetched by the mount).
  - The heading button `.tide-ep-dd` shows the season name with an `expand_more` icon. The count text `.tide-ep-count` shows `N episodes` or `X of N watched`.
  - The menu rows are `menuItem` buttons with `aria-current` on the current season, a 38px poster, `year · status`, a watch bar and a ✓.
  - On the first render the track jumps (instantly) so card `rowStartIndex` is first. A season switch glides there using `animator(...).to(..., PAGE_MS)`.

- [ ] **Step 1: Write the failing tests** `web/test/detailsEpisodes.test.ts`:

```ts
import { renderEpisodes } from '../src/details/episodes';
import type { JfItem } from '../src/types';

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

const season = (n: number, unplayed: number, year = 2023): JfItem => ({ Id: `s${n}`, Name: `Season ${n}`, Type: 'Season', IndexNumber: n, ProductionYear: year, ChildCount: 10, UserData: { UnplayedItemCount: unplayed, Played: unplayed === 0 } });
const eps = (s: number, playedUpTo: number): JfItem[] => Array.from({ length: 10 }, (_, i) => ({ Id: `s${s}e${i + 1}`, Name: `Ep ${i + 1}`, Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: s, IndexNumber: i + 1, RunTimeTicks: 3e10, UserData: { Played: i < playedUpTo } }));

test('heading shows the season dropdown + count; cards use episode mode with the UP NEXT tag', () => {
  const sorted = [season(1, 0), season(2, 10)];
  const next = eps(2, 0)[0]!;
  const r = renderEpisodes('ser', sorted, 1, next, eps(2, 0));
  document.body.append(r.el);
  expect(r.el.querySelector('.tide-ep-dd')?.textContent).toContain('Season 2');
  expect(r.el.querySelector('.tide-ep-count')?.textContent).toBe('10 episodes');
  expect(r.el.querySelectorAll('.tide-wide-epmode').length).toBe(10);
  expect(r.el.querySelector('.tide-wide-tag')?.textContent).toBe('UP NEXT');
  r.dispose();
});

test('menu lists seasons with progress; picking one fetches and swaps the row (cached after)', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ Items: eps(1, 10) })));
  const sorted = [season(1, 0), season(2, 10)];
  const r = renderEpisodes('ser', sorted, 1, null, eps(2, 0));
  document.body.append(r.el);
  (r.el.querySelector('.tide-ep-dd') as HTMLButtonElement).click();
  const rows = [...document.querySelectorAll<HTMLElement>('.tide-pop .tide-pop-item')];
  expect(rows.map((x) => x.querySelector('.tide-pop-label b')?.textContent)).toEqual(['Season 1', 'Season 2']);
  expect(rows[1]!.getAttribute('aria-current')).toBe('true');
  expect(rows[0]!.querySelector('.tide-ms[data-icon="check"]')).not.toBeNull();
  rows[0]!.click();
  await vi.waitFor(() => expect(r.el.querySelector('.tide-ep-dd')?.textContent).toContain('Season 1'));
  expect(String(fetchSpy.mock.calls[0]![0])).toContain('/Shows/ser/Episodes');
  expect(String(fetchSpy.mock.calls[0]![0])).toContain('seasonId=s1');
  expect(r.el.querySelector('.tide-ep-count')?.textContent).toBe('10 of 10 watched');
  // back to season 2: served from cache
  (r.el.querySelector('.tide-ep-dd') as HTMLButtonElement).click();
  document.querySelectorAll<HTMLElement>('.tide-pop .tide-pop-item')[1]!.click();
  await vi.waitFor(() => expect(r.el.querySelector('.tide-ep-dd')?.textContent).toContain('Season 2'));
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  r.dispose();
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** `web/src/details/episodes.ts`:

```ts
import { imageUrl } from '../api/client';
import { getEpisodes } from '../api/item';
import { h, icon } from '../ui/dom';
import { wideCard } from '../ui/cards';
import { menuItem, openPopover } from '../ui/popover';
import { animator, cardSpans, PAGE_MS } from '../ui/scrollAnim';
import { createScroller } from '../home/scroller';
import { episodeTag, nextInSeason, rowStartIndex } from './logic';
import type { JfItem } from '../types';

const watchedOf = (s: JfItem) => Math.max(0, (s.ChildCount ?? 0) - (s.UserData?.UnplayedItemCount ?? 0));

function countText(eps: JfItem[]): string {
  const w = eps.filter((e) => e.UserData?.Played).length;
  return w ? `${w} of ${eps.length} watched` : `${eps.length} episode${eps.length === 1 ? '' : 's'}`;
}

export function renderEpisodes(seriesId: string, sorted: JfItem[], startIdx: number, next: JfItem | null, firstEps: JfItem[]): { el: HTMLElement; dispose(): void } {
  const cache = new Map<string, JfItem[]>([[sorted[startIdx]!.Id, firstEps]]);
  let cur = startIdx;
  const scroller = createScroller('tide-row-wide');
  const { track } = scroller;
  const label = h('span', { class: 'tide-ep-name' });
  const dd = h('button', { class: 'tide-ep-dd', type: 'button', 'aria-haspopup': 'menu' }, label, icon('expand_more'));
  const count = h('span', { class: 'tide-ep-count' });
  const ddWrap = h('span', { class: 'tide-ep-ddwrap' }, dd);
  const el = h('section', { class: 'tide-dsec tide-eps', 'aria-label': 'Episodes' },
    h('div', { class: 'tide-dsec-h' }, ddWrap, count), scroller.el);

  const show = (eps: JfItem[], glide: boolean) => {
    label.textContent = sorted[cur]!.Name;
    count.textContent = countText(eps);
    const up = nextInSeason(eps, next);
    track.replaceChildren(...eps.map((e) => wideCard(e, { episode: { tag: episodeTag(e, next && next.Id === up?.Id ? next : null) } })));
    scroller.sync();
    const i = rowStartIndex(eps, next);
    const go = () => {
      const { spans, max } = cardSpans(track);
      const to = Math.min(max, spans[i]?.start ?? 0);
      if (glide) { animator(track, 'x').jump(0); animator(track, 'x').to(to, PAGE_MS); } else animator(track, 'x').jump(to);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go); else go();
  };

  const pick = async (i: number) => {
    if (i === cur) return;
    cur = i;
    const s = sorted[i]!;
    let eps = cache.get(s.Id);
    if (!eps) {
      label.textContent = s.Name;
      try { eps = await getEpisodes(seriesId, s.Id); } catch (e) { console.warn('[Tide] episodes failed', e); eps = []; }
      cache.set(s.Id, eps);
      if (cur !== i) return; // user picked another season meanwhile
    }
    show(eps, true);
  };

  dd.addEventListener('click', () => {
    const list = h('div', { class: 'tide-ep-menu' }, ...sorted.map((s, i) => {
      const total = s.ChildCount ?? 0;
      const done = total > 0 && watchedOf(s) >= total;
      const poster = h('span', { class: 'tide-ep-mp' });
      poster.style.backgroundImage = `url("${imageUrl(s.Id, 'Primary', 100)}")`;
      const meta = [s.ProductionYear, done ? 'Watched' : watchedOf(s) ? `${watchedOf(s)} of ${total}` : `${total} episodes`].filter(Boolean).join(' · ');
      const item = menuItem('', null, () => void pick(i), done ? icon('check', 'tide-ep-mdone') : null);
      item.querySelector('.tide-pop-label')!.replaceChildren(
        h('b', {}, s.Name), h('span', { class: 'tide-ep-mm' }, meta),
        h('span', { class: 'tide-ep-mbar' }, h('i', { style: `transform:scaleX(${total ? watchedOf(s) / total : 0})` })));
      item.prepend(poster);
      if (i === cur) item.setAttribute('aria-current', 'true');
      return item;
    }));
    dd.classList.add('open');
    openPopover(dd, list, { onClose: () => dd.classList.remove('open') });
  });

  show(firstEps, false);
  return { el, dispose: () => scroller.dispose() };
}
```

Append to `web/src/details/details.css`:

```css
/* Episodes (P1) */
body.tide .tide-ep-ddwrap { position: relative; }
body.tide .tide-ep-dd { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; color: var(--tide-tx); font: 700 22px var(--tide-font); letter-spacing: -.02em; padding: 6px 10px 6px 0; cursor: pointer; border-radius: 12px; }
body.tide .tide-ep-dd .tide-ms { transition: transform .3s var(--tide-ease); }
body.tide .tide-ep-dd.open .tide-ms { transform: rotate(180deg); }
body.tide .tide-ep-count { font-size: 14px; color: #8e8e93; }
body.tide .tide-ep-menu { width: 324px; }
body.tide .tide-ep-mp { flex: 0 0 38px; aspect-ratio: 2/3; border-radius: 7px; background: center / cover #333; }
body.tide .tide-ep-menu .tide-pop-label { display: flex; flex-direction: column; gap: 2px; }
body.tide .tide-ep-menu .tide-pop-label b { font-size: 15px; }
body.tide .tide-ep-mm { font-size: 12px; font-weight: 500; color: #a1a1a6; }
body.tide .tide-ep-mbar { width: 90px; height: 4px; border-radius: 2px; background: #3a3a3c; overflow: hidden; margin-top: 6px; }
body.tide .tide-ep-mbar i { display: block; height: 100%; background: #fff; transform-origin: left center; }
body.tide .tide-pop-item[aria-current="true"] .tide-ep-mm { color: #3a3a3c; }
body.tide .tide-pop-item[aria-current="true"] .tide-ep-mbar { background: #d1d1d6; }
body.tide .tide-pop-item[aria-current="true"] .tide-ep-mbar i { background: #000; }
body.tide .tide-ep-mdone { font-size: 20px; }
```

- [ ] **Step 4: Run.** `cd web && npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/details/episodes.ts web/src/details/details.css web/test/detailsEpisodes.test.ts
git commit -m "feat: episodes section with season dropdown (P1) and home-style episode cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Cast & crew, More like this, About + Your file

**Files:**
- Create: `web/src/details/cast.ts`, `web/src/details/similar.ts`, `web/src/details/about.ts`, append CSS to `details.css`
- Test: `web/test/detailsSections.test.ts`

**Interfaces:**
- Produces:
  - `export function renderCast(people: JfPerson[] | undefined): HTMLElement | null`: `.tide-cast` with chips `a.tide-chipp[href="#/details?id=<personId>"]`. The toggle `.tide-cast-all` shows "See all ›" / "Show less" and appears only when `castList(p,true).length > castList(p,false).length`.
  - `export function renderSimilar(id: string): { el: HTMLElement; dispose(): void }`: `section.tide-row.tide-dsec` (hidden until it has items) that reuses `createScroller('tide-row-wide')` + `wideCard`.
  - `export function renderAbout(item: JfDetail, file: { src: JfSource | undefined; label: string } | null, q: Quality | null): HTMLElement | null`: two panels, `.tide-about` and `.tide-file`. It returns null when both are empty.

- [ ] **Step 1: Write the failing tests** `web/test/detailsSections.test.ts`:

```ts
import { renderAbout } from '../src/details/about';
import { renderCast } from '../src/details/cast';
import { renderSimilar } from '../src/details/similar';

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
});
afterEach(() => vi.restoreAllMocks());

const actors = Array.from({ length: 14 }, (_, i) => ({ Id: `a${i}`, Name: `Actor ${i}`, Type: 'Actor', Role: `Role ${i}`, PrimaryImageTag: i === 1 ? undefined : 't' }));

test('cast chips link to the stock person page; See all expands to actors + crew', () => {
  const el = renderCast([...actors, { Id: 'd', Name: 'Dir', Type: 'Director' }])!;
  expect(el.querySelectorAll('.tide-chipp').length).toBe(12);
  expect(el.querySelector('.tide-chipp')?.getAttribute('href')).toBe('#/details?id=a0');
  expect(el.querySelector('.tide-chipp b')?.textContent).toBe('Actor 0');
  expect(el.querySelector('.tide-chipp span')?.textContent).toBe('Role 0');
  expect(el.querySelectorAll('.tide-chipp')[1]!.querySelector('.tide-chipp-ini')?.textContent).toBe('A1'); // no photo: initials
  const all = el.querySelector<HTMLButtonElement>('.tide-cast-all')!;
  expect(all.textContent).toContain('See all');
  all.click();
  expect(el.querySelectorAll('.tide-chipp').length).toBe(15);
  expect(el.querySelectorAll('.tide-chipp')[14]!.querySelector('span')?.textContent).toBe('Director');
  expect(all.textContent).toContain('Show less');
  expect(renderCast([])).toBeNull();
  expect(renderCast(actors.slice(0, 3))!.querySelector('.tide-cast-all')).toBeNull();
});

test('similar row hides when empty and renders home cards otherwise', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"Items":[]}'));
  const empty = renderSimilar('x');
  await vi.waitFor(() => expect(empty.el.hidden).toBe(true));
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ Items: [{ Id: 'a', Name: 'A', Type: 'Movie' }, { Id: 'b', Name: 'B', Type: 'Series' }] })));
  const full = renderSimilar('y');
  await vi.waitFor(() => expect(full.el.querySelectorAll('.tide-wide').length).toBe(2));
  expect(full.el.hidden).toBe(false);
  expect(full.el.querySelector('.tide-row-title')?.textContent).toBe('More like this');
});

test('about + file panels', () => {
  const el = renderAbout(
    { Id: 'm', Name: 'M', Type: 'Movie', OfficialRating: 'PG-13', Genres: ['Action'] },
    { src: { Id: 's', Size: 2 * 1024 ** 3, MediaStreams: [{ Type: 'Video', Codec: 'hevc', Width: 1920, Height: 1080 }] }, label: 'Your file' },
    { res: '1080p', codec: 'HEVC' },
  )!;
  expect([...el.querySelectorAll('.tide-about .tide-fact')].map((f) => f.textContent)).toEqual(['RatingPG-13', 'GenresAction']);
  expect(el.querySelector('.tide-file h3')?.textContent).toContain('Your file');
  expect(el.querySelector('.tide-file .tide-q')).not.toBeNull();
  expect([...el.querySelectorAll('.tide-file .tide-frow')].map((f) => f.textContent)).toEqual(['Quality1080p', 'VideoHEVC', 'Size on disk2.0 GB']);
  expect(renderAbout({ Id: 'x', Name: 'x', Type: 'Movie' }, null, null)).toBeNull();
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** `web/src/details/cast.ts`:

```ts
import { getSession } from '../api/client';
import { h, icon } from '../ui/dom';
import { ROUTES } from '../router/selectors';
import { castList } from './logic';
import type { JfPerson } from '../api/item';

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

function chip(p: JfPerson): HTMLElement {
  const ph = h('span', { class: 'tide-chipp-ph' });
  if (p.PrimaryImageTag) ph.style.backgroundImage = `url("${getSession()?.server ?? ''}/Items/${p.Id}/Images/Primary?maxWidth=120&quality=88&tag=${p.PrimaryImageTag}")`;
  else ph.append(h('span', { class: 'tide-chipp-ini' }, initials(p.Name)));
  return h('a', { class: 'tide-chipp', href: ROUTES.details(p.Id) }, ph,
    h('span', { class: 'tide-chipp-tx' }, h('b', {}, p.Name), h('span', {}, p.Type === 'Actor' ? p.Role ?? '' : p.Type)));
}

export function renderCast(people: JfPerson[] | undefined): HTMLElement | null {
  const short = castList(people, false);
  const full = castList(people, true);
  if (!full.length) return null;
  let expanded = false;
  const grid = h('div', { class: 'tide-cast-grid' });
  const toggle = full.length > short.length ? h('button', { class: 'tide-cast-all', type: 'button' }) : null;
  const paint = () => {
    grid.replaceChildren(...(expanded ? full : short.length ? short : full.slice(0, 12)).map(chip));
    toggle?.replaceChildren(expanded ? 'Show less' : 'See all', icon(expanded ? 'expand_less' : 'chevron_right'));
  };
  toggle?.addEventListener('click', () => { expanded = !expanded; paint(); });
  paint();
  return h('section', { class: 'tide-dsec tide-cast', 'aria-label': 'Cast and crew' },
    h('div', { class: 'tide-dsec-h' }, h('h2', {}, 'Cast & crew'), toggle), grid);
}
```

(The `ROUTES.details()` helper already returns `#/details?id=...`.)

Implement `web/src/details/similar.ts`:

```ts
import { getSimilar } from '../api/item';
import { h } from '../ui/dom';
import { wideCard } from '../ui/cards';
import { createScroller } from '../home/scroller';

export function renderSimilar(id: string): { el: HTMLElement; dispose(): void } {
  const scroller = createScroller('tide-row-wide');
  const el = h('section', { class: 'tide-row tide-dsec tide-similar' },
    h('div', { class: 'tide-row-head' }, h('h2', { class: 'tide-row-title' }, 'More like this')), scroller.el);
  el.hidden = true;
  let disposed = false;
  void getSimilar(id).then((items) => {
    if (disposed || !items.length) return;
    scroller.track.replaceChildren(...items.map((i) => wideCard(i)));
    el.hidden = false;
    scroller.sync();
  }).catch((e) => console.warn('[Tide] similar failed', e));
  return { el, dispose: () => { disposed = true; scroller.dispose(); } };
}
```

Implement `web/src/details/about.ts`:

```ts
import { h } from '../ui/dom';
import { qualityBadge } from '../ui/quality';
import { aboutFacts, fileFacts } from './logic';
import type { JfDetail, JfSource } from '../api/item';
import type { Quality } from '../types';

export function renderAbout(item: JfDetail, file: { src: JfSource | undefined; label: string } | null, q: Quality | null): HTMLElement | null {
  const about = aboutFacts(item);
  const rows = fileFacts(file?.src);
  if (!about.length && !rows.length) return null;
  const panels = h('div', { class: 'tide-details-panels' },
    about.length ? h('div', { class: 'tide-panel tide-about' }, h('h3', {}, 'About'),
      h('div', { class: 'tide-facts' }, ...about.map(([k, v]) => h('div', { class: 'tide-fact' }, h('span', {}, k), h('b', {}, v))))) : null,
    rows.length ? h('div', { class: 'tide-panel tide-file' }, h('h3', {}, file!.label, qualityBadge(q, true)),
      ...rows.map(([k, v]) => h('div', { class: 'tide-frow' }, h('span', {}, k), h('b', {}, v)))) : null);
  return h('section', { class: 'tide-dsec tide-detailsinfo', 'aria-label': 'Details' },
    h('div', { class: 'tide-dsec-h' }, h('h2', {}, 'Details')), panels);
}
```

Append to `details.css`:

```css
/* Cast (K4) */
body.tide .tide-cast-all { margin-left: auto; display: inline-flex; align-items: center; gap: 2px; border: 0; background: none; color: #a1a1a6; font: 600 14px var(--tide-font); cursor: pointer; }
body.tide .tide-cast-all:hover { color: #fff; }
body.tide .tide-cast-grid { display: flex; flex-wrap: wrap; gap: 12px; padding: 20px var(--tide-gutter) 0; }
body.tide .tide-chipp { display: flex; align-items: center; gap: 12px; padding: 6px 20px 6px 6px; border-radius: 40px; background: #141416; color: var(--tide-tx); text-decoration: none; transition: background-color .25s var(--tide-ease); }
body.tide .tide-chipp:is(:hover, :focus-visible) { background: #2a2a2e; outline: none; }
body.tide .tide-chipp-ph { flex: 0 0 48px; width: 48px; height: 48px; border-radius: 50%; background: center 18% / cover #2a2a2e; display: flex; align-items: center; justify-content: center; }
body.tide .tide-chipp-ini { font-size: 15px; font-weight: 700; color: #a1a1a6; }
body.tide .tide-chipp-tx { display: flex; flex-direction: column; min-width: 0; }
body.tide .tide-chipp-tx b { font-size: 14px; white-space: nowrap; }
body.tide .tide-chipp-tx span { font-size: 12px; color: #8e8e93; margin-top: 2px; white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }

/* More like this keeps the home row spacing (22px top padding stops hovered cards being clipped). */
body.tide .tide-similar { margin-top: 56px; }

/* Details (M2) */
body.tide .tide-details-panels { display: grid; grid-template-columns: 1.5fr 1fr; gap: 22px; padding: 20px var(--tide-gutter) 0; align-items: start; }
body.tide .tide-panel { background: #141416; border-radius: 22px; padding: 26px; }
body.tide .tide-panel h3 { margin: 0 0 20px; font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
body.tide .tide-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 30px; }
body.tide .tide-fact span { display: block; font-size: 13px; color: #8e8e93; }
body.tide .tide-fact b { display: block; font-size: 15px; font-weight: 600; margin-top: 5px; }
body.tide .tide-frow { display: flex; justify-content: space-between; gap: 16px; font-size: 14px; padding: 12px 0; border-bottom: 1px solid #222; }
body.tide .tide-frow:last-child { border-bottom: 0; }
body.tide .tide-frow span { color: #8e8e93; }
body.tide .tide-frow b { font-weight: 600; text-align: right; }
```

- [ ] **Step 4: Run.** `cd web && npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/details web/test/detailsSections.test.ts
git commit -m "feat: cast chips (K4), More like this row, About + Your file panels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Mount the detail page (ambient, stock hiding, router registration, phone)

**Files:**
- Create: `web/src/ui/ambient.ts`, `web/src/ui/ambient.css`, `web/src/details/details.ts`
- Modify:
  - `web/src/home/home.ts` (use `createAmbient`)
  - `web/src/home/home.css` (move the ambient rules out)
  - `web/src/main.ts` (register the takeover before `initRouter`)
  - `details.css` (phone)
- Test: `web/test/details.test.ts`

**Interfaces:**
- Produces:
  - `export function createAmbient(): { el: HTMLElement; set(id: string): void }` (identical behaviour to the home inline code)
  - `export async function mountDetails(host: HTMLElement, cfg: ClientConfig, loc: Location): Promise<(() => void) | null>`
  - `export const DETAILS_TAKEOVER: Takeover`

Mount flow:
1. Read `id`, `season` and `serverId` from `ROUTES.detailsParams(loc)`, then `item = await getItem(id)`. A failure throws, so the router latches and the stock page stays.
2. `Season` with `SeriesId`: `location.replace` to `#/details?id=<SeriesId>&season=<IndexNumber>`, keeping `&serverId=` when present. Return `null`.
3. Not `Movie` or `Series`: return `null`.
4. Add `host.classList.add('tide-taken')`, then prepend `.tide-details` with the ambient layer (`set(item.Id)`) and the header.
5. **Series**: `Promise.all([getResumeEpisode, getNextUp, getSeasons])`, then:
   - `next = chooseNextUp(...)`
   - `sorted = sortSeasons(seasons)`
   - `startIdx = defaultSeason(sorted, hint, next)`
   - `firstEps = await getEpisodes(series, sorted[startIdx].Id)`
   - `target = next ?? nextInSeason(firstEps, null) ?? firstEps[0] ?? null`
   - `header.setTarget(target)`
   - if `next`, append `renderNextUp(next)` to `header.col`
   - insert `renderEpisodes(...)` after the header
   - file source: `getItem(target.Id)` → `MediaSources[0]`, label `Your file · S3 E1`
6. **Movie**: the file source is `item.MediaSources?.[0]`, label `Your file`.
7. Append `renderCast`, then `renderSimilar` and `renderAbout`. Fetch the quality badge with `getQuality([id])` and use it in both `header.setQuality(q)` and About.
8. Unmount: dispose the rows, remove the root and the `tide-taken` class.

- [ ] **Step 1: Write the failing tests** `web/test/details.test.ts`:

```ts
import { DETAILS_TAKEOVER, mountDetails, nav } from '../src/details/details';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: 't' };
const loc = (hash: string) => ({ hash } as Location);

function serve(routes: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    const hit = Object.keys(routes).find((k) => u.includes(k));
    return new Response(JSON.stringify(hit ? routes[hit] : { Items: [] }));
  });
}

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u', getCurrentUser: async () => ({ Policy: {} }) };
  document.body.innerHTML = '<div id="itemDetailPage" class="page itemDetailPage"><div class="itemBackdrop"></div><div class="detailPageWrapperContainer">stock</div></div>';
});
afterEach(() => vi.restoreAllMocks());
const host = () => document.querySelector<HTMLElement>('#itemDetailPage')!;

test('takeover matches only details with the flag on', () => {
  expect(DETAILS_TAKEOVER.matches(cfg, loc('#/details?id=1'))).toBe(true);
  expect(DETAILS_TAKEOVER.matches({ ...cfg, enableDetails: false }, loc('#/details?id=1'))).toBe(false);
  expect(DETAILS_TAKEOVER.matches(cfg, loc('#/home'))).toBe(false);
  expect(DETAILS_TAKEOVER.key(loc('#/details?id=abc&serverId=x'))).toBe('abc');
});

test('movie: hides stock, renders header + cast + about; unmount restores', async () => {
  serve({
    '/Items/m?': { Id: 'm', Name: 'Movie', Type: 'Movie', ProductionYear: 2022, Genres: ['Action'], People: [{ Id: 'p', Name: 'Tom Cruise', Type: 'Actor', Role: 'Maverick' }], MediaSources: [{ Id: 'm', Size: 1e10, MediaStreams: [{ Type: 'Video', Codec: 'hevc', Width: 3840, Height: 2160 }] }] },
    '/Tide/Quality': { m: { res: '4K', codec: 'HEVC' } },
  });
  const un = await mountDetails(host(), cfg, loc('#/details?id=m'));
  expect(un).toBeTypeOf('function');
  expect(host().classList.contains('tide-taken')).toBe(true);
  expect(host().querySelector('.tide-details .tide-dh')).not.toBeNull();
  expect(host().querySelector('.tide-eps')).toBeNull();
  expect(host().querySelector('.tide-nu')).toBeNull();
  expect(host().querySelector('.tide-chipp b')?.textContent).toBe('Tom Cruise');
  await vi.waitFor(() => expect(host().querySelector('.tide-file')).not.toBeNull());
  un!();
  expect(host().classList.contains('tide-taken')).toBe(false);
  expect(host().querySelector('.tide-details')).toBeNull();
});

test('series: next up strip, episodes at the next-up season, file label names the episode', async () => {
  const next = { Id: 'e21', Name: 'Pilot 2', Type: 'Episode', SeriesId: 's', ParentIndexNumber: 2, IndexNumber: 1, RunTimeTicks: 3e10, UserData: {} };
  serve({
    '/Items/s?': { Id: 's', Name: 'Show', Type: 'Series', ChildCount: 2 },
    '/UserItems/Resume': { Items: [] },
    '/Shows/NextUp': { Items: [next] },
    '/Shows/s/Seasons': { Items: [{ Id: 's1', Name: 'Season 1', Type: 'Season', IndexNumber: 1, ChildCount: 1, UserData: { UnplayedItemCount: 0 } }, { Id: 's2', Name: 'Season 2', Type: 'Season', IndexNumber: 2, ChildCount: 1, UserData: { UnplayedItemCount: 1 } }] },
    '/Shows/s/Episodes': { Items: [next] },
    '/Items/e21?': { ...next, MediaSources: [{ Id: 'e21', Size: 5e8, MediaStreams: [] }] },
  });
  const un = await mountDetails(host(), cfg, loc('#/details?id=s'));
  await vi.waitFor(() => expect(host().querySelector('.tide-nu-k')?.textContent).toBe('NEXT UP · S2 E1'));
  expect(host().querySelector('.tide-ep-dd')?.textContent).toContain('Season 2');
  expect(host().querySelector('.tide-dh-primary')?.textContent).toContain('Play S2 E1');
  await vi.waitFor(() => expect(host().querySelector('.tide-file h3')?.textContent).toContain('Your file · S2 E1'));
  un!();
});

test('season redirects to its series with the season hint; other types decline', async () => {
  serve({ '/Items/x1?': { Id: 'x1', Name: 'Season 3', Type: 'Season', SeriesId: 's', IndexNumber: 3 } });
  const replace = vi.spyOn(nav, 'replace').mockImplementation(() => {});
  expect(await mountDetails(host(), cfg, loc('#/details?id=x1&serverId=abc'))).toBeNull();
  expect(replace).toHaveBeenCalledWith('#/details?id=s&season=3&serverId=abc');
  vi.restoreAllMocks();
  serve({ '/Items/p1?': { Id: 'p1', Name: 'Person', Type: 'Person' } });
  expect(await mountDetails(host(), cfg, loc('#/details?id=p1'))).toBeNull();
  expect(host().classList.contains('tide-taken')).toBe(false);
});
```

(`location.replace` is not spyable in jsdom, so redirects go through the exported `nav` object in `details.ts`.)

Section loading: sections appear as their data arrives (Similar stays hidden until it has items, and Episodes and Next up are inserted once the series requests return). This replaces the spec's skeleton placeholders: the header renders immediately, so the page never looks blank.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.**

`web/src/ui/ambient.css`: move these rules here **verbatim** from `home.css`, and delete them there:
- `.tide-ambient-wrap`
- `.tide-ambient`
- `.tide-ambient.on`
- `.tide-ambient-veil`
- the reduced-motion `.tide-ambient` rule

`web/src/ui/ambient.ts`:
```ts
import './ambient.css';
import { imageUrl } from '../api/client';
import { h } from './dom';

/** Dark, blurred, tiny copy of a backdrop fixed behind the page. Two layers crossfade (opacity only). */
export function createAmbient(): { el: HTMLElement; set(id: string): void } {
  const layers = [h('div', { class: 'tide-ambient' }), h('div', { class: 'tide-ambient' })];
  const el = h('div', { class: 'tide-ambient-wrap', 'aria-hidden': 'true' }, ...layers, h('div', { class: 'tide-ambient-veil' }));
  let idx = 0;
  let current = '';
  return {
    el,
    set(id: string) {
      if (id === current) return;
      current = id;
      const next = layers[idx ^ 1]!;
      next.style.backgroundImage = `url("${imageUrl(id, 'Backdrop/0', 160)}")`;
      next.classList.add('on');
      layers[idx]!.classList.remove('on');
      idx ^= 1;
    },
  };
}
```

In `home.ts`, replace the inline ambient block (`const ambientLayers = ...` through the end of `setAmbient`) with:
```ts
  const amb = createAmbient();
  const ambient = amb.el;
  const setAmbient = amb.set;
```
and add `import { createAmbient } from '../ui/ambient';`. Remove `imageUrl` from the imports if nothing else in `home.ts` uses it.

`web/src/details/details.ts`:
```ts
import { getQuality } from '../api/tide';
import { getEpisodes, getItem, getNextUp, getResumeEpisode, getSeasons, type JfDetail, type JfSource } from '../api/item';
import { h } from '../ui/dom';
import { createAmbient } from '../ui/ambient';
import { ROUTES, SELECTORS } from '../router/selectors';
import type { Takeover } from '../router/hook';
import { renderHeader } from './header';
import { renderNextUp } from './nextUp';
import { renderEpisodes } from './episodes';
import { renderCast } from './cast';
import { renderSimilar } from './similar';
import { renderAbout } from './about';
import { chooseNextUp, defaultSeason, epLabel, nextInSeason, sortSeasons } from './logic';
import type { ClientConfig, JfItem, Quality } from '../types';

/** Indirection so tests can observe the Season → series redirect. */
export const nav = { replace: (hash: string) => location.replace(hash) };

export async function mountDetails(host: HTMLElement, _cfg: ClientConfig, loc: Location): Promise<(() => void) | null> {
  const params = ROUTES.detailsParams(loc);
  const id = params?.get('id');
  if (!id) return null;
  const item: JfDetail = await getItem(id);
  if (item.Type === 'Season' && item.SeriesId) {
    const server = params?.get('serverId');
    nav.replace(`#/details?id=${encodeURIComponent(item.SeriesId)}&season=${item.IndexNumber ?? 0}${server ? `&serverId=${encodeURIComponent(server)}` : ''}`);
    return null;
  }
  if (item.Type !== 'Movie' && item.Type !== 'Series') return null;

  const disposers: (() => void)[] = [];
  let disposed = false;
  const ambient = createAmbient();
  ambient.set(item.Id);
  const header = renderHeader(item);
  const root = h('div', { class: 'tide-details' }, ambient.el, header.el);
  host.classList.add('tide-taken');
  host.prepend(root);

  const cast = renderCast(item.People);
  if (cast) root.append(cast);
  const similar = renderSimilar(item.Id);
  disposers.push(similar.dispose);
  root.append(similar.el);

  let quality: Quality | null = null;
  const qualityP = getQuality([item.Id]).then((r) => (quality = r[item.Id] ?? null)).catch(() => null);
  let aboutEl: HTMLElement | null = null;
  const placeAbout = (file: { src: JfSource | undefined; label: string } | null) => {
    if (disposed) return;
    aboutEl?.remove();
    aboutEl = renderAbout(item, file, quality);
    if (aboutEl) root.append(aboutEl);
  };

  void qualityP.then(() => { if (!disposed) header.setQuality(quality); });

  if (item.Type === 'Series') {
    void (async () => {
      try {
        const [resume, nu, seasons] = await Promise.all([
          getResumeEpisode(item.Id).catch(() => null),
          getNextUp(item.Id).catch(() => null),
          getSeasons(item.Id),
        ]);
        if (disposed || !seasons.length) return;
        const next = chooseNextUp(resume, nu);
        const sorted = sortSeasons(seasons);
        const hint = params?.get('season');
        const startIdx = defaultSeason(sorted, hint !== null && hint !== undefined && hint !== '' ? Number(hint) : null, next);
        const firstEps = await getEpisodes(item.Id, sorted[startIdx]!.Id);
        if (disposed) return;
        const target: JfItem | null = next ?? nextInSeason(firstEps, null) ?? firstEps[0] ?? null;
        header.setTarget(target);
        if (next) header.col.append(renderNextUp(next));
        const eps = renderEpisodes(item.Id, sorted, startIdx, next, firstEps);
        disposers.push(eps.dispose);
        header.el.after(eps.el);
        await qualityP;
        if (target) {
          const full = await getItem(target.Id).catch(() => null);
          placeAbout({ src: full?.MediaSources?.[0], label: `Your file · ${epLabel(target)}` });
        } else placeAbout(null);
      } catch (e) {
        console.warn('[Tide] series sections failed', e);
        header.setTarget(null);
        placeAbout(null);
      }
    })();
  } else {
    void qualityP.then(() => placeAbout({ src: item.MediaSources?.[0], label: 'Your file' }));
  }

  return () => {
    disposed = true;
    disposers.forEach((d) => d());
    root.remove();
    host.classList.remove('tide-taken');
  };
}

export const DETAILS_TAKEOVER: Takeover = {
  id: 'details',
  rootClass: 'tide-details',
  matches: (cfg, loc) => cfg.enableDetails !== false && ROUTES.isDetails(loc),
  key: (loc) => ROUTES.detailsParams(loc)?.get('id') ?? '',
  findHost: () => document.querySelector<HTMLElement>(SELECTORS.detailsHost),
  mount: mountDetails,
};
```

In `web/src/main.ts`, register before the router feature:
```ts
import { registerTakeover } from './router/hook';
import { DETAILS_TAKEOVER } from './details/details';
registerTakeover(DETAILS_TAKEOVER);
```
(Put the `registerTakeover(...)` call above `registerFeature((cfg) => void initRouter(cfg));`.)

Append the phone rules to `details.css`:
```css
@media (max-width: 899px) {
  body.tide .tide-dh { grid-template-columns: 220px minmax(0, 1fr); gap: 32px; }
}
@media (max-width: 699px) {
  body.tide .tide-details { padding-top: 16px; }
  body.tide .tide-dh { grid-template-columns: 1fr; gap: 0; text-align: center; }
  body.tide .tide-dh-poster { display: none; }
  body.tide .tide-dh-logo { margin: 24px auto 16px; max-width: 72%; max-height: 110px; object-position: center bottom; }
  body.tide .tide-dh-title { font-size: 34px; }
  body.tide .tide-dh-meta { justify-content: center; font-size: 14px; }
  body.tide .tide-dh-desc { -webkit-line-clamp: 4; text-align: left; }
  body.tide .tide-dh-btns { justify-content: center; }
  body.tide .tide-dh-primary { flex: 1 0 100%; justify-content: center; }
  body.tide .tide-dh-trailer { width: 54px; padding: 0; justify-content: center; font-size: 0; gap: 0; }
  body.tide .tide-dh-trailer .tide-ms { font-size: 24px; }
  body.tide .tide-nu { max-width: none; text-align: left; }
  body.tide .tide-cast-grid { display: grid; grid-auto-flow: column; grid-template-rows: repeat(2, auto); grid-auto-columns: max-content; overflow-x: auto; scrollbar-width: none; }
  body.tide .tide-details-panels { grid-template-columns: 1fr; }
  body.tide .tide-facts { grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 4: Run.** `cd web && npm test && npm run typecheck && npm run build`. Expected: all pass, and the build writes `dist/client.js` and `client.css`.

- [ ] **Step 5: Commit.**
```bash
git add web/src web/test/details.test.ts
git commit -m "feat: Tide detail page takeover for movies and series

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: E2E fixture, Playwright coverage, version 0.3.0

**Files:**
- Modify:
  - `e2e/fetch-media.sh` (Season 02)
  - `e2e/docker-compose.yml` (plugin dir `Tide_0.3.0.0`)
  - `web/package.json`, `web/src/main.ts`, `server/Jellyfin.Plugin.Tide/Jellyfin.Plugin.Tide.csproj`
- Create: `e2e/tests/details.spec.ts`

- [ ] **Step 1: Fixture and version.**

In `e2e/fetch-media.sh`, after the Blender Shorts `S01E02` line, add:
```sh
mkdir -p "media/Shows/Blender Shorts/Season 02"
[ -e "media/Shows/Blender Shorts/Season 02/Blender Shorts S02E01.mp4" ] || ln "media/Movies/Sintel (2010)/Sintel (2010).mp4" "media/Shows/Blender Shorts/Season 02/Blender Shorts S02E01.mp4" 2>/dev/null || cp "media/Movies/Sintel (2010)/Sintel (2010).mp4" "media/Shows/Blender Shorts/Season 02/Blender Shorts S02E01.mp4"
```

Set the versions:
- `web/package.json`: `"version": "0.3.0"`
- `main.ts`: `TIDE_VERSION = '0.3.0'`
- csproj: `<AssemblyVersion>0.3.0.0</AssemblyVersion>` and `<FileVersion>0.3.0.0</FileVersion>`
- compose: `- ./plugins/Tide:/config/plugins/Tide_0.3.0.0`

Run: `sh e2e/fetch-media.sh`, then deploy: `(cd web && npm run build) && ./scripts/dotnet publish server/Jellyfin.Plugin.Tide -c Release -o e2e/plugins/Tide && (cd e2e && docker compose up -d --force-recreate)`. Wait for `curl -s localhost:8096/System/Info/Public` to answer. Trigger a library scan: `curl -s -X POST -H "Authorization: MediaBrowser Token=\"$(curl -s -X POST localhost:8096/Users/AuthenticateByName -H 'Authorization: MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1"' -H 'Content-Type: application/json' -d '{"Username":"tide","Pw":"tide"}' | sed -E 's/.*"AccessToken":"([^"]+)".*/\1/')\"" localhost:8096/Library/Refresh`.

- [ ] **Step 2: Verify the stock metadata editor route.** In the running container, log in at `http://localhost:8096/web/` as tide/tide and open `#/metadata?id=<any movie id>`.
  - If it shows the metadata editor, keep "Edit metadata".
  - If it does not, remove the `Edit metadata` `menuItem` line from `header.ts`, and commit it as part of this task with message `fix: drop Edit metadata (no 12.4 route)`.

- [ ] **Step 3: Write** `e2e/tests/details.spec.ts`:

```ts
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const CLIENT = 'MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1"';
const PLUGIN_ID = '7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c';

async function login(page: Page) {
  await page.goto('/web/');
  await page.waitForSelector('input[type=password]');
  await page.fill('input[type=text], #txtManualName', 'tide');
  await page.fill('input[type=password]', 'tide');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
}
async function auth(request: APIRequestContext) {
  const r = await request.post('/Users/AuthenticateByName', { headers: { Authorization: CLIENT }, data: { Username: 'tide', Pw: 'tide' } });
  const j = await r.json();
  return { headers: { Authorization: `${CLIENT}, Token="${j.AccessToken}"` }, userId: j.User.Id as string };
}
async function find(request: APIRequestContext, type: string, name: string) {
  const a = await auth(request);
  const r = await request.get(`/Items?userId=${a.userId}&Recursive=true&IncludeItemTypes=${type}&SearchTerm=${encodeURIComponent(name)}`, { headers: a.headers });
  return (await r.json()).Items[0].Id as string;
}

test('movie detail replaces the stock page', async ({ page, request }) => {
  const id = await find(request, 'Movie', 'Sintel');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('#itemDetailPage:not(.hide) .tide-details .tide-dh')).toBeVisible();
  await expect(page.locator('#itemDetailPage:not(.hide) > .detailPageWrapperContainer')).toBeHidden();
  await expect(page.locator('.tide-dh-primary')).toContainText(/Play|Resume/);
  await expect(page.locator('.tide-file')).toBeVisible();
});

test('series: season menu switches the row; season link redirects with hint', async ({ page, request }) => {
  const id = await find(request, 'Series', 'Blender Shorts');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('.tide-ep-dd')).toBeVisible();
  await page.locator('.tide-ep-dd').click();
  await page.locator('.tide-pop .tide-pop-item', { hasText: 'Season 2' }).click();
  await expect(page.locator('.tide-ep-dd')).toContainText('Season 2');
  await expect(page.locator('.tide-eps .tide-wide-epmode')).toHaveCount(1);

  const a = await auth(request);
  const seasons = await (await request.get(`/Shows/${id}/Seasons?userId=${a.userId}`, { headers: a.headers })).json();
  const s2 = seasons.Items.find((s: { IndexNumber: number }) => s.IndexNumber === 2).Id;
  await page.goto(`/web/#/details?id=${s2}`);
  await expect(page).toHaveURL(new RegExp(`id=${id}&season=2`));
  await expect(page.locator('.tide-ep-dd')).toContainText('Season 2');
});

test('next up strip shows for a started series and hides when all watched', async ({ page, request }) => {
  const id = await find(request, 'Series', 'Blender Shorts');
  const a = await auth(request);
  const eps = (await (await request.get(`/Shows/${id}/Episodes?userId=${a.userId}`, { headers: a.headers })).json()).Items;
  await request.post(`/UserPlayedItems/${eps[0].Id}?userId=${a.userId}`, { headers: a.headers });
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('.tide-nu')).toBeVisible();
  await request.post(`/UserPlayedItems/${id}?userId=${a.userId}`, { headers: a.headers });
  await page.reload();
  await expect(page.locator('.tide-dh')).toBeVisible();
  await expect(page.locator('.tide-nu')).toHaveCount(0);
  await request.delete(`/UserPlayedItems/${id}?userId=${a.userId}`, { headers: a.headers });
});

test('hovered cards are not clipped; chevron glides to a card edge', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'hover');
  const id = await find(request, 'Series', 'Blender Shorts');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  const card = page.locator('.tide-eps .tide-wide').first();
  await card.hover();
  await page.waitForTimeout(500);
  const box = await card.boundingBox();
  const track = await page.locator('.tide-eps .tide-row-track').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(track!.y);
  // chevron motion on a home row with enough cards
  await page.goto('/web/#/home');
  const row = page.locator('.tide-row-scroller.can-next').first();
  await row.hover();
  const next = row.locator('.tide-row-chev-next');
  await expect(next).toHaveCSS('opacity', '1');
  const t = row.locator('.tide-row-track');
  await next.click();
  await page.waitForTimeout(120);
  const mid = await t.evaluate((el) => el.scrollLeft);
  await page.waitForTimeout(700);
  const end = await t.evaluate((el) => el.scrollLeft);
  expect(mid).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(mid);
  const aligned = await t.evaluate((el) => {
    const pad = parseFloat(getComputedStyle(el).paddingLeft);
    const left = el.getBoundingClientRect().left + pad;
    return [...el.children].some((c) => Math.abs(c.getBoundingClientRect().left - left) < 2);
  });
  expect(aligned).toBe(true);
});

test('a mouse-wheel notch scrolls the page over several frames', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'wheel');
  await login(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(60);
  const early = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(600);
  const late = await page.evaluate(() => window.scrollY);
  expect(early).toBeLessThan(late);
  expect(Math.abs(late - 100)).toBeLessThan(8);
});

test('person chip opens the stock person page; similar card remounts', async ({ page, request }) => {
  const id = await find(request, 'Movie', 'Sintel');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  const chip = page.locator('.tide-chipp').first();
  if (await chip.count()) {
    await chip.click();
    await expect(page.locator('#itemDetailPage:not(.hide) .tide-details')).toHaveCount(0);
  }
  await page.goto(`/web/#/details?id=${id}`);
  const sim = page.locator('.tide-similar .tide-wide').first();
  if (await sim.count()) {
    const before = await page.locator('.tide-dh-logo, .tide-dh-title').first().getAttribute('alt');
    await sim.click();
    await expect(page.locator('#itemDetailPage:not(.hide) .tide-details')).toHaveCount(1);
    await expect.poll(async () => page.locator('#itemDetailPage:not(.hide) .tide-dh-logo, #itemDetailPage:not(.hide) .tide-dh-title').first().getAttribute('alt')).not.toBe(before);
  }
});

test('favourite heart is a solid red SVG when on', async ({ page, request }) => {
  const id = await find(request, 'Movie', 'Sintel');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  const fav = page.locator('.tide-dh .tide-fav-toggle');
  if ((await fav.getAttribute('aria-pressed')) === 'true') await fav.click();
  await fav.click();
  await expect(fav).toHaveAttribute('aria-pressed', 'true');
  await expect(fav.locator('svg path')).toHaveCSS('fill', 'rgb(255, 55, 95)');
  await fav.click();
  await expect(fav.locator('svg path')).toHaveCSS('fill', 'rgba(0, 0, 0, 0)');
});

test('enableDetails=false keeps the stock page', async ({ page, request }) => {
  const a = await auth(request);
  const cfgUrl = `/Plugins/${PLUGIN_ID}/Configuration`;
  const original = await (await request.get(cfgUrl, { headers: a.headers })).json();
  await request.post(cfgUrl, { headers: a.headers, data: { ...original, EnableDetails: false } });
  try {
    const id = await find(request, 'Movie', 'Sintel');
    await login(page);
    await page.goto(`/web/#/details?id=${id}`);
    await expect(page.locator('#itemDetailPage:not(.hide) .detailPageWrapperContainer')).toBeVisible();
    await expect(page.locator('.tide-details')).toHaveCount(0);
  } finally {
    await request.post(cfgUrl, { headers: a.headers, data: original });
  }
});

test('phone layout: no poster column, full-width primary', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  const id = await find(request, 'Movie', 'Sintel');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('.tide-dh-poster')).toBeHidden();
  const b = await page.locator('.tide-dh-primary').boundingBox();
  expect(b!.width).toBeGreaterThan(300);
});
```

- [ ] **Step 4: Run.** `cd e2e && npx playwright test`. Expected: every existing home test passes and every new detail test passes, on both projects (desktop and phone).
  - When a selector or timing differs on the real 12.4 page (for example the stock wrapper class), adjust the selector, not the behaviour.
  - Also look at screenshots of a movie and a series detail page (`npx playwright test --update-snapshots` is not used; capture them with a quick `page.screenshot` while debugging), and confirm the header clears the top bar. If the logo sits under the app bar, raise `.tide-details` `padding-top` to `calc(var(--tide-appbar-h, 64px) + 32px)` and set `--tide-appbar-h` on the root in `mountDetails`, the same way home measures it (`document.querySelector(SELECTORS.appBar)?.getBoundingClientRect().height`).

- [ ] **Step 5: Full verification.** `./scripts/dotnet test Tide.slnx && (cd web && npm run typecheck && npm test && npm run build)`. Expected: all green.

- [ ] **Step 6: Commit.**
```bash
git add e2e web server
git commit -m "test: detail page e2e; bump to 0.3.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Manual checks before release (not automated)

- Jellyfin Desktop:
  - heart is solid red when on and a white outline when off
  - play / check / star / info look filled
- Hero trailer:
  - the backdrop never shows under a playing trailer
  - pausing (tab away and back) never shows YouTube's pause UI
- T3 strip readable on a bright backdrop; keyboard focus shows a white ring, not yellow.
- Wheel scrolling feels smooth with a mouse; a trackpad still feels native.
- Chevron glide; double-click pages twice smoothly.
