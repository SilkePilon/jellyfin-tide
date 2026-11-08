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
  await vi.waitFor(() => expect(r.el.querySelector('.tide-ep-count')?.textContent).toBe('10 of 10 watched'));
  expect(r.el.querySelector('.tide-ep-dd')?.textContent).toContain('Season 1');
  expect(String(fetchSpy.mock.calls[0]![0])).toContain('/Shows/ser/Episodes');
  expect(String(fetchSpy.mock.calls[0]![0])).toContain('seasonId=s1');
  // back to season 2: served from cache
  (r.el.querySelector('.tide-ep-dd') as HTMLButtonElement).click();
  document.querySelectorAll<HTMLElement>('.tide-pop .tide-pop-item')[1]!.click();
  await vi.waitFor(() => expect(r.el.querySelector('.tide-ep-dd')?.textContent).toContain('Season 2'));
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  r.dispose();
});
