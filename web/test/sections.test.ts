import { mountConstellation, moodFor, pickDiscover, renderBento, SLOTS } from '../src/home/sections';
import { ROWS } from '../src/home/rows';
import type { JfItem, UserPrefs } from '../src/types';

const prefs: UserPrefs = { rowOrder: [], hidden: [], genres: {}, edited: false };
const ctx = (becauseOf: JfItem | null = null) => ({ userId: 'u', prefs, newDays: 14, genres: [], becauseOf });
const item = (id: string, genre = 'Drama'): JfItem => ({ Id: id, Name: id.toUpperCase(), Type: 'Movie', Genres: [genre], ImageTags: { Primary: 't' } });

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
  (globalThis as any).IntersectionObserver = class {
    constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
    observe() { this.cb([{ isIntersecting: true }]); }
    disconnect() {}
  };
});
afterEach(() => vi.restoreAllMocks());

test('mood map with a fallback', () => {
  expect(moodFor('Sci-Fi & Fantasy')).toBe('Mind-bending sci-fi');
  expect(moodFor('Documentary')).toBe('Nature, up close');
  expect(moodFor('Western')).toBe('Hidden gems');
  expect(moodFor(undefined)).toBe('Hidden gems');
});

function mockPools(similar: JfItem[], top: JfItem[], random: JfItem[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    const list = u.includes('/Similar') ? similar : u.includes('SortBy=CommunityRating') ? top : random;
    return new Response(JSON.stringify({ Items: list }));
  });
}

test('discover picks 4 top-rated, 3 similar, 3 random; de-duplicated; posterless skipped; reasons set', async () => {
  const top = ['t1', 't2', 't3', 't4', 't5', 't6'].map((id) => item(id));
  const similar = [item('t1'), item('s1'), item('s2'), item('s3'), item('s4')];
  const random = [item('s1'), { ...item('r0'), ImageTags: {} }, item('r1'), item('r2'), item('r3')];
  mockPools(similar, top, random);
  const picks = await pickDiscover(ctx({ Id: 'w', Name: 'Top Gun', Type: 'Movie' }));
  expect(picks.map((p) => p.item.Id)).toEqual(['t1', 't2', 't3', 't4', 's1', 's2', 's3', 'r1', 'r2', 'r3']);
  expect(picks[0]!.reason).toBe('Top rated · you haven’t watched it yet');
  expect(picks[4]!.reason).toBe('Because you watched Top Gun');
  expect(picks[7]!.reason).toBe('Something different');
});

test('without a recent watch, discover fills from top-rated and random', async () => {
  mockPools([], ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id)), ['g', 'h', 'i', 'j'].map((id) => item(id)));
  const picks = await pickDiscover(ctx(null));
  expect(picks).toHaveLength(10);
  expect(new Set(picks.map((p) => p.item.Id)).size).toBe(10);
});

test('constellation: transform-only layout, click swaps into the centre, pills follow', () => {
  const wrap = document.createElement('div');
  document.body.append(wrap);
  const picks = Array.from({ length: 10 }, (_, i) => ({ item: item(`p${i}`, i === 1 ? 'Animation' : 'Drama'), reason: `why ${i}` }));
  const stop = mountConstellation(wrap, picks);
  const stage = wrap.querySelector<HTMLElement>('.tide-disc')!;
  Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 640 });
  window.dispatchEvent(new Event('resize'));
  const posters = [...wrap.querySelectorAll<HTMLElement>('.tide-disc-poster')];
  expect(posters).toHaveLength(SLOTS.length);
  expect(posters[0]!.classList.contains('center')).toBe(true);
  expect(posters[0]!.style.left).toBe('');
  expect(posters[0]!.style.transform).toMatch(/^translate\(.*\) scale\(1\)$/);
  expect(wrap.querySelector('.tide-disc-reason')?.textContent).toBe('why 0');
  expect([...wrap.querySelectorAll('.tide-disc-pill')].map((p) => p.textContent)).toContain('Animated & fun');
  posters[1]!.click();
  expect(posters[1]!.classList.contains('center')).toBe(true);
  expect(posters[0]!.classList.contains('center')).toBe(false);
  expect(wrap.querySelector('.tide-disc-reason')?.textContent).toBe('why 1');
  expect(wrap.querySelectorAll('.tide-disc-bg.on')).toHaveLength(1);
  stop();
  wrap.remove();
});

test('bento hides with fewer than 3 new items and shows NEW tiles otherwise', async () => {
  const few = { ...ROWS.newThisWeek, fetch: async () => [item('a'), item('b')] };
  const { el: hidden } = renderBento(few, ctx());
  await vi.waitFor(() => expect(hidden.hidden).toBe(true));
  const many = { ...ROWS.newThisWeek, fetch: async () => [item('a'), item('b'), item('c'), item('d'), item('e')] };
  const { el } = renderBento(many, ctx());
  await vi.waitFor(() => expect(el.querySelectorAll('.tide-bento-tile')).toHaveLength(5));
  expect(el.querySelector('.tide-bento')?.getAttribute('data-count')).toBe('5');
  expect(el.querySelectorAll('.tide-bento-new')).toHaveLength(5);
});
