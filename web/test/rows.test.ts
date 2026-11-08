import { pickGenres, renderRow, ROWS, visibleRows } from '../src/home/rows';
import type { UserPrefs } from '../src/types';

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

test('renderRow fetches and renders wide cards (no per-card quality requests)', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Items: [{ Id: 'a', Name: 'A', Type: 'Movie' }] })));
  const { el } = renderRow(ROWS.latestMovies, { userId: 'u', prefs: prefs(), newDays: 14, genres: [] });
  await vi.waitFor(() => expect(el.querySelectorAll('.tide-wide').length).toBe(1));
  expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('IncludeItemTypes=Movie'))).toBe(true);
  expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/Tide/Quality'))).toBe(false);
  expect(el.querySelector('.tide-row-chev-prev')).not.toBeNull();
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

test('newThisWeek keeps only the last 7 days (shows by newest episode), newest first, max 5', async () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const day = (d: number) => new Date(now - d * 864e5).toISOString();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('IncludeItemTypes=Movie')) return new Response(JSON.stringify({ Items: [
      { Id: 'm1', Name: 'M1', Type: 'Movie', DateCreated: day(1) }, { Id: 'm2', Name: 'M2', Type: 'Movie', DateCreated: day(9) }] }));
    return new Response(JSON.stringify({ Items: [
      { Id: 's1', Name: 'S1', Type: 'Series', DateCreated: day(400), DateLastContentAdded: day(0.5) },
      { Id: 's2', Name: 'S2', Type: 'Series', DateCreated: day(3) }] }));
  });
  const { newThisWeek } = await import('../src/home/rows');
  const list = await newThisWeek({ userId: 'u', prefs: prefs(), newDays: 14, genres: [] }, now);
  expect(list.map((i) => i.Id)).toEqual(['s1', 'm1', 's2']);
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
