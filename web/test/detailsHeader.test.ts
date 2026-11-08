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
