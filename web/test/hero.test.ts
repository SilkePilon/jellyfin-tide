import { backgroundUrl, createHero, desktopMeta, phoneMeta, reasonLine, runtime, trailerSources } from '../src/home/hero';
import { setFavourite } from '../src/api/actions';
import type { ClientConfig, HeroItem } from '../src/types';

vi.mock('../src/api/actions', async (orig) => ({ ...(await orig<typeof import('../src/api/actions')>()), setFavourite: vi.fn() }));

const cfg: ClientConfig = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: true, heroSlotSeconds: 30, newDays: 14, version: '0.1.0' };
const base: HeroItem = { id: 'h1', type: 'Movie', reason: 'topRated', name: 'Top Gun: Maverick', year: 2022, genres: ['Action'], overview: 'x', hasLogo: true, hasThumb: false, isFavorite: false, youtube: ['Klc__shdj88', 'giXco2jaZ_4'], playTargetId: 'h1' };

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
  (globalThis as any).IntersectionObserver = class { observe() {} disconnect() {} };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (document as any).hidden;
  delete (window as any).matchMedia;
});

test('reason lines (W2)', () => {
  expect(reasonLine({ ...base, reason: 'resume', progress: { percent: 60, minutesLeft: 52 } })).toEqual({ chip: null, episode: null, button: 'Resume' });
  expect(reasonLine({ ...base, type: 'Series', reason: 'newEpisode', episode: { id: 'e', season: 1, number: 6, name: 'Bad Optics' } }))
    .toEqual({ chip: 'NEW EPISODE', episode: 'S1 · E6 “Bad Optics”', button: 'Play S1 E6' });
  expect(reasonLine({ ...base, type: 'Series', reason: 'nextEpisode', episode: { id: 'e', season: 2, number: 1, name: 'Hi' } }).chip).toBeNull();
  expect(reasonLine({ ...base, reason: 'new' })).toEqual({ chip: 'NEW', episode: null, button: 'Play' });
  expect(reasonLine(base)).toEqual({ chip: null, episode: null, button: 'Play' });
});

test('trailer chain: local first, then youtube in order', () => {
  expect(trailerSources(base, ['loc1'])).toEqual([
    { kind: 'local', url: 'http://jf/Videos/loc1/stream?static=true&ApiKey=t' },
    { kind: 'youtube', id: 'Klc__shdj88' },
    { kind: 'youtube', id: 'giXco2jaZ_4' },
  ]);
});

test('no label above logo; logo image used when available', () => {
  const { el } = createHero([base], cfg);
  expect(el.querySelector('.tide-hero-why')).toBeNull();
  expect(el.querySelector('img.tide-hero-logo')?.getAttribute('src')).toContain('/Items/h1/Images/Logo');
});

test('falls back to text title when no logo', () => {
  const { el } = createHero([{ ...base, hasLogo: false }], cfg);
  expect(el.querySelector('.tide-hero-title')?.textContent).toBe('Top Gun: Maverick');
});

test('T3 strip: one entry per item, active follows go()', () => {
  const items = [base, { ...base, id: 'h2' }, { ...base, id: 'h3' }];
  const hero = createHero(items, { ...cfg, enableTrailers: false });
  const strip = hero.el.querySelectorAll('.tide-t3-item');
  expect(strip.length).toBe(3);
  expect(strip[0]!.classList.contains('on')).toBe(true);
  hero.go(2);
  expect(hero.current()).toBe(2);
  expect(strip[2]!.classList.contains('on')).toBe(true);
  hero.destroy();
});

test('auto-advances after heroSlotSeconds when trailers off', () => {
  vi.useFakeTimers();
  const hero = createHero([base, { ...base, id: 'h2' }], { ...cfg, enableTrailers: false, heroSlotSeconds: 10 });
  vi.advanceTimersByTime(10_001);
  expect(hero.current()).toBe(1);
  hero.destroy();
});

test('logo load error falls back to text title', () => {
  const { el } = createHero([base], cfg);
  const img = el.querySelector('img.tide-hero-logo')!;
  img.dispatchEvent(new Event('error'));
  expect(el.querySelector('img.tide-hero-logo')).toBeNull();
  expect(el.querySelector('.tide-hero-title')?.textContent).toBe('Top Gun: Maverick');
});

test('pauses while tab hidden, resumes with remaining time when visible', () => {
  vi.useFakeTimers();
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const hero = createHero([base, { ...base, id: 'h2' }], { ...cfg, enableTrailers: false, heroSlotSeconds: 10 });
  vi.advanceTimersByTime(4_000);
  hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(30_000);
  expect(hero.current()).toBe(0);
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(5_900);
  expect(hero.current()).toBe(0);
  vi.advanceTimersByTime(200);
  expect(hero.current()).toBe(1);
  hero.destroy();
});

test('trailers disabled when prefers-reduced-motion matches', async () => {
  vi.useFakeTimers();
  const mm = vi.fn((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
  (window as any).matchMedia = mm;
  const hero = createHero([base, { ...base, id: 'h2' }], cfg);
  expect(mm).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  expect(hero.el.querySelector<HTMLElement>('.tide-hero-mute')!.hidden).toBe(true);
  await vi.advanceTimersByTimeAsync(8_000);
  expect(fetch).not.toHaveBeenCalled();
  expect(hero.el.querySelector('iframe, video')).toBeNull();
  expect(hero.el.querySelector('.kenburns')).toBeNull();
  hero.destroy();
});

test('trailers on: fetches LocalTrailers after 3 s and embeds youtube no-cookie', async () => {
  vi.useFakeTimers();
  const hero = createHero([base, { ...base, id: 'h2' }], cfg);
  await vi.advanceTimersByTimeAsync(2_900);
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(200);
  expect(String((fetch as any).mock.calls[0][0])).toBe('http://jf/Items/h1/LocalTrailers');
  const f = hero.el.querySelector('.tide-hero-slide.on iframe');
  expect(f?.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/Klc__shdj88');
  hero.destroy();
});

test('pausing during local trailer load does not skip to youtube', async () => {
  vi.useFakeTimers();
  (fetch as any).mockImplementation(() => Promise.resolve(new Response(JSON.stringify([{ Id: 'loc1' }]))));
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const hero = createHero([base, { ...base, id: 'h2' }], cfg);
  const box = () => hero.el.querySelector('.tide-hero-slide.on .tide-hero-vid')!;
  await vi.advanceTimersByTimeAsync(3_100);
  expect(box().querySelector('video')?.getAttribute('src')).toContain('/Videos/loc1/stream');
  await vi.advanceTimersByTimeAsync(900); // t = 4 s, local still buffering
  hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(hero.el.classList.contains('paused')).toBe(true);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(box().querySelector('iframe')).toBeNull();
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(1_000);
  expect(box().querySelector('video')?.getAttribute('src')).toContain('/Videos/loc1/stream');
  expect(box().querySelector('iframe')).toBeNull();
  // load timeout re-armed on resume: falls through to youtube after a full 6 s, not paused
  await vi.advanceTimersByTimeAsync(5_100);
  expect(box().querySelector('iframe')?.getAttribute('src')).toContain('autoplay=1');
  hero.destroy();
});

test('inactive slides are inert; active T3 item has aria-current; go() after destroy is a no-op', () => {
  const hero = createHero([base, { ...base, id: 'h2' }], { ...cfg, enableTrailers: false });
  const slides = hero.el.querySelectorAll('.tide-hero-slide');
  const t3 = hero.el.querySelectorAll('.tide-t3-item');
  expect(slides[0]!.hasAttribute('inert')).toBe(false);
  expect(slides[1]!.hasAttribute('inert')).toBe(true);
  expect(slides[1]!.getAttribute('aria-hidden')).toBe('true');
  expect(t3[0]!.getAttribute('aria-current')).toBe('true');
  hero.go(1);
  expect(slides[0]!.hasAttribute('inert')).toBe(true);
  expect(slides[1]!.hasAttribute('aria-hidden')).toBe(false);
  expect(t3[0]!.hasAttribute('aria-current')).toBe(false);
  expect(t3[1]!.getAttribute('aria-current')).toBe('true');
  hero.destroy();
  hero.go(0);
  expect(hero.current()).toBe(1);
});

test('phone meta: one line, first genre only, no rating box or quality badge', () => {
  const item: HeroItem = { ...base, reason: 'new', communityRating: 7.34, year: 2010, genres: ['Animation', 'Fantasy'], runtimeMinutes: 15, officialRating: 'PG', quality: { res: 'SD', codec: 'H.264' } as any };
  const m = phoneMeta(item, reasonLine(item).chip);
  expect(m.className).toBe('tide-hero-meta-ph');
  expect(m.querySelector('.tide-chip')?.textContent).toBe('NEW');
  expect(m.textContent).toContain('7.3');
  expect(m.textContent).toContain('2010');
  expect(m.textContent).toContain('Animation');
  expect(m.textContent).not.toContain('Fantasy');
  expect(m.textContent).toContain('15m');
  expect(m.textContent).not.toContain('PG');
  expect(m.querySelector('.tide-hero-rating, .tide-q')).toBeNull();
  // order: chip, rating, year, genre, runtime (separators between)
  const vals = [...m.children].filter((c) => !c.classList.contains('tide-hero-dot')).map((c) => c.textContent!.trim());
  expect(vals).toEqual(['NEW', 'star 7.3', '2010', 'Animation', '15m']);
  expect(m.children[1]!.classList.contains('tide-hero-dot')).toBe(false); // no separator right after the chip
  expect(m.querySelectorAll('.tide-hero-dot').length).toBe(3);
});

test('phone meta: seasons when no runtime, no chip unless new', () => {
  const m = phoneMeta({ ...base, type: 'Series', genres: [], seasonCount: 2, year: null }, null);
  expect(m.querySelector('.tide-chip')).toBeNull();
  expect(m.textContent).toBe('2 seasons');
});

test('hero renders both metas (CSS picks one per breakpoint)', () => {
  const { el } = createHero([{ ...base, genres: ['Action', 'Drama'] }], { ...cfg, enableTrailers: false });
  expect(el.querySelector('.tide-hero-meta')?.textContent).toContain('Action');
  expect(el.querySelector('.tide-hero-meta')?.textContent).not.toContain('Drama');
  expect(el.querySelector('.tide-hero-meta-ph')?.textContent).not.toContain('Drama');
});

test('phone uses Thumb only when the item has one; desktop always Backdrop; no image probing', () => {
  const RealImage = globalThis.Image;
  const probes: unknown[] = [];
  (globalThis as any).Image = class { constructor() { probes.push(this); } };
  try {
    expect(backgroundUrl({ id: 'h1', hasThumb: true }, true)).toContain('/Items/h1/Images/Thumb');
    expect(backgroundUrl({ id: 'h1', hasThumb: false }, true)).toContain('/Items/h1/Images/Backdrop/0');
    expect(backgroundUrl({ id: 'h1', hasThumb: true }, false)).toContain('/Items/h1/Images/Backdrop/0');
    const bgOf = (el: HTMLElement) => el.querySelector<HTMLElement>('.tide-hero-bg')!.style.backgroundImage;
    (window as any).matchMedia = (q: string) => ({ matches: q.includes('max-width: 699px'), media: q, addEventListener() {}, removeEventListener() {} });
    expect(bgOf(createHero([{ ...base, hasThumb: true }], { ...cfg, enableTrailers: false }).el)).toContain('/Items/h1/Images/Thumb');
    expect(bgOf(createHero([{ ...base, id: 'h2' }], { ...cfg, enableTrailers: false }).el)).toContain('/Items/h2/Images/Backdrop/0');
    expect(probes).toHaveLength(0);
  } finally {
    (globalThis as any).Image = RealImage;
  }
});

test('runtime matches the card format', () => {
  expect(runtime(9)).toBe('9m');
  expect(runtime(130)).toBe('2h 10m');
});

test('desktop meta (X1): one quiet line, first genre only, rating last, no badges', () => {
  const m = desktopMeta({ ...base, communityRating: 8.2, criticRating: 96, year: 2022, genres: ['Action', 'Drama'], runtimeMinutes: 130, officialRating: 'PG-13', quality: { res: '4K', codec: 'HEVC' } }, null);
  const parts = [...m.children].map((c) => c.classList.contains('tide-hero-dot') ? '·' : c.textContent);
  expect(parts).toEqual(['2022', '·', 'Action', '·', '2h 10m', '·', 'star 8.2']);
  expect(m.querySelector('.tide-q, .tide-hero-rating')).toBeNull();
});

test('resume shows the R3 ring inside the white button with minutes left', () => {
  const { el } = createHero([{ ...base, reason: 'resume', progress: { percent: 60, minutesLeft: 52 } }], { ...cfg, enableTrailers: false });
  const btn = el.querySelector('.tide-hero-resume')!;
  expect(btn.querySelector('.tide-hero-ring .tide-ring-arc')?.getAttribute('stroke-dashoffset')).toBe('35.18');
  expect(btn.textContent).toContain('Resume');
  expect(btn.querySelector('.tide-hero-left')?.textContent).toBe('52m left');
  expect(el.querySelector('.tide-hero-progress')).toBeNull();
});

test('hero reports the active item so the ambient glow can follow', () => {
  const seen: string[] = [];
  const hero = createHero([base, { ...base, id: 'h2' }], { ...cfg, enableTrailers: false }, (it) => seen.push(it.id));
  hero.go(1);
  expect(seen).toEqual(['h1', 'h2']);
  hero.destroy();
});

test('hero has one favourite toggle (no watchlist) that reflects and flips state', async () => {
  vi.mocked(setFavourite).mockResolvedValue(undefined);
  const { el } = createHero([{ ...base, isFavorite: true }], { ...cfg, enableTrailers: false });
  const btns = el.querySelectorAll('.tide-hero-slide .tide-hero-btns button');
  expect([...btns].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['play_arrowPlay', 'infoMore info', 'Favourite']);
  const fav = el.querySelector<HTMLButtonElement>('button[aria-label="Favourite"]')!;
  expect(fav.getAttribute('aria-pressed')).toBe('true');
  fav.click();
  expect(fav.getAttribute('aria-pressed')).toBe('false');
  expect(setFavourite).toHaveBeenCalledWith('h1', false);
  await Promise.resolve();
  await Promise.resolve();
  vi.mocked(setFavourite).mockRejectedValueOnce(new Error('x'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fav.click();
  expect(fav.getAttribute('aria-pressed')).toBe('true');
  await new Promise((r) => setTimeout(r, 0));
  expect(fav.getAttribute('aria-pressed')).toBe('false');
});

test('hero gets tide-hero-playing only while the active slide shows a trailer', async () => {
  vi.useFakeTimers();
  (fetch as any).mockImplementation(() => Promise.resolve(new Response(JSON.stringify([{ Id: 'loc1' }]))));
  const hero = createHero([base, { ...base, id: 'h2' }], cfg);
  expect(hero.el.classList.contains('tide-hero-playing')).toBe(false);
  await vi.advanceTimersByTimeAsync(3_100);
  const v = hero.el.querySelector('.tide-hero-slide.on video')!;
  v.dispatchEvent(new Event('playing'));
  expect(hero.el.classList.contains('tide-hero-playing')).toBe(true);
  hero.go(1);
  expect(hero.el.classList.contains('tide-hero-playing')).toBe(false);
  hero.destroy();
});
