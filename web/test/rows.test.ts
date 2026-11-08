import { pickGenres, renderRow, ROWS, visibleRows } from '../src/home/rows';
import type { UserPrefs } from '../src/types';
import * as quality from '../src/ui/quality';

const prefs = (o: Partial<UserPrefs> = {}): UserPrefs => ({
  rowOrder: ['random', 'continue', 'nextUp', 'latestMovies', 'latestShows', 'becauseYouWatched', 'topRated', 'genre1', 'genre2', 'genre3', 'favourites', 'collections', 'musicAlbums', 'musicArtists'],
  hidden: ['collections'], genres: {}, edited: true, ...o,
});

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
  (globalThis as any).IntersectionObserver = class {
    constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
    observe() { this.cb([{ isIntersecting: true }]); }
    disconnect() {}
  };
});
afterEach(() => vi.restoreAllMocks());

test('visibleRows follows order and drops hidden', () => {
  const v = visibleRows(prefs());
  expect(v[0]).toBe('random');
  expect(v).not.toContain('collections');
  expect(v.length).toBe(13);
});

test('pickGenres keeps fixed genres and fills random without duplicates', () => {
  const g = pickGenres(prefs({ genres: { genre1: 'Drama', genre2: null } }), ['Drama', 'Comedy', 'Sci-Fi'], () => 0);
  expect(g.genre1).toBe('Drama');
  expect(new Set(Object.values(g)).size).toBe(3);
});

test('pickGenres returns null when not enough genres', () => {
  expect(pickGenres(prefs(), ['Drama'], () => 0).genre2).toBeNull();
});

test('every row id has a definition', () => {
  for (const id of visibleRows(prefs({ hidden: [] }))) expect(ROWS[id]).toBeDefined();
});

test('renderRow fetches, renders cards, then fetches quality', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/Tide/Quality')) return new Response('{"a":{"res":"4K","codec":"HEVC"}}');
    return new Response(JSON.stringify({ Items: [{ Id: 'a', Name: 'A', Type: 'Movie' }] }));
  });
  const { el } = renderRow(ROWS.latestMovies, { userId: 'u', prefs: prefs(), newDays: 14, genres: [] });
  await vi.waitFor(() => expect(el.querySelectorAll('.tide-card').length).toBe(1));
  await vi.waitFor(() => expect(el.querySelector('.tide-q')?.textContent).toBe('4KHEVC'));
  expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('IncludeItemTypes=Movie'))).toBe(true);
});

test('renderRow hides itself when empty', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"Items":[]}'));
  const { el } = renderRow(ROWS.collections, { userId: 'u', prefs: prefs(), newDays: 14, genres: [] });
  await vi.waitFor(() => expect(el.hidden).toBe(true));
});

test('renderRow shows retry on error', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x', { status: 500 }));
  const { el } = renderRow(ROWS.topRated, { userId: 'u', prefs: prefs(), newDays: 14, genres: [] });
  await vi.waitFor(() => expect(el.querySelector('.tide-row-error button')?.textContent).toContain('Retry'));
});

test('a quality badge failure keeps the cards (badges are outside the row try)', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/Tide/Quality')) return new Response('{"a":{"res":"4K","codec":"HEVC"}}');
    return new Response(JSON.stringify({ Items: [{ Id: 'a', Name: 'A', Type: 'Movie' }] }));
  });
  const real = quality.qualityBadge;
  // cards render with no quality (null); only the post-fetch badge pass gets a real Quality and throws.
  const badge = vi.spyOn(quality, 'qualityBadge').mockImplementation((q, full) => { if (q) throw new Error('bad badge'); return real(q, full); });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { el } = renderRow(ROWS.latestMovies, { userId: 'u', prefs: prefs(), newDays: 14, genres: [] });
  await vi.waitFor(() => expect(badge.mock.calls.some(([q]) => !!q)).toBe(true));
  await new Promise((r) => setTimeout(r, 10));
  expect(el.querySelectorAll('.tide-card').length).toBe(1);
  expect(el.querySelector('.tide-row-error')).toBeNull();
});

test('renderRow dispose disconnects its observers', () => {
  const disconnected: string[] = [];
  (globalThis as any).IntersectionObserver = class { observe() {} disconnect() { disconnected.push('io'); } };
  const prevRO = (globalThis as any).ResizeObserver;
  (globalThis as any).ResizeObserver = class { observe() {} disconnect() { disconnected.push('ro'); } };
  try {
    const row = renderRow(ROWS.topRated, { userId: 'u', prefs: prefs(), newDays: 14, genres: [] });
    row.dispose();
    expect(disconnected.sort()).toEqual(['io', 'ro']);
  } finally {
    (globalThis as any).ResizeObserver = prevRO;
  }
});
