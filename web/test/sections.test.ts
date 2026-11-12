import { renderBento } from '../src/home/sections';
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
