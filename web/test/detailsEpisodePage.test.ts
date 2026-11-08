import { mountDetails } from '../src/details/details';
import { aboutFacts, endsAt } from '../src/details/logic';

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u', getCurrentUser: async () => ({ Policy: {} }) };
  document.body.innerHTML = '<div id="itemDetailPage" class="page itemDetailPage"><div class="detailPageWrapperContainer">stock</div></div>';
});
afterEach(() => vi.restoreAllMocks());

test('episode facts and ends-at', () => {
  expect(aboutFacts({ Id: 'e', Name: 'E', Type: 'Episode', ParentIndexNumber: 3, PremiereDate: '2026-05-01T00:00:00Z', OfficialRating: 'TV-MA', RunTimeTicks: 51 * 6e8,
    People: [{ Id: 'd', Name: 'Michael Dinner', Type: 'Director' }, { Id: 'w', Name: 'Graham Yost', Type: 'Writer' }] }))
    .toEqual([['Directed by', 'Michael Dinner'], ['Written by', 'Graham Yost'], ['Aired', 'May 2026'], ['Rating', 'TV-MA'], ['Season', '3'], ['Runtime', '51m']]);
  const now = new Date(2026, 10, 8, 22, 22);
  expect(endsAt(51 * 6e8, 13 * 6e8, now)).toBe('23:00');
  expect(endsAt(undefined, undefined, now)).toBeNull();
});

test('episode page: still, kicker, back link, next strip, NOW VIEWING row, no similar', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/Items/e1?')) return new Response(JSON.stringify({ Id: 'e1', Name: 'Who Are You?', Type: 'Episode', SeriesId: 'ser', SeriesName: 'Silo', SeasonId: 'se3', ParentIndexNumber: 3, IndexNumber: 1, RunTimeTicks: 3.06e10, Overview: 'x', UserData: { PlaybackPositionTicks: 7e9 } }));
    if (u.includes('/Shows/ser/Seasons')) return new Response(JSON.stringify({ Items: [{ Id: 'se3', Name: 'Season 3', Type: 'Season', IndexNumber: 3, ChildCount: 2 }] }));
    if (u.includes('/Shows/ser/Episodes')) return new Response(JSON.stringify({ Items: [
      { Id: 'e1', Name: 'Who Are You?', Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 3, IndexNumber: 1 },
      { Id: 'e2', Name: "It's All Good", Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 3, IndexNumber: 2, RunTimeTicks: 3.06e10 }] }));
    return new Response('{"Items":[]}');
  });
  const host = document.querySelector<HTMLElement>('#itemDetailPage')!;
  const un = await mountDetails(host, {} as any, { hash: '#/details?id=e1' } as Location);
  expect(un).toBeTypeOf('function');
  expect(host.querySelector('.tide-dh-still')).not.toBeNull();
  expect(host.querySelector('.tide-dh-poster')).toBeNull();
  expect(host.querySelector('.tide-dh-kick')?.textContent).toBe('SEASON 3 · EPISODE 1');
  expect(host.querySelector('.tide-dh-eptitle')?.textContent).toBe('Who Are You?');
  expect(host.querySelector('.tide-dh-back')?.getAttribute('href')).toBe('#/details?id=ser');
  expect(host.querySelector('.tide-dh-trailer')).toBeNull();
  await vi.waitFor(() => expect(host.querySelector('.tide-nu-k')?.textContent).toBe('NEXT EPISODE · S3 E2'));
  await vi.waitFor(() => expect(host.querySelector('[data-id="e1"] .tide-wide-tag')?.textContent).toBe('NOW VIEWING'));
  expect(host.querySelector('.tide-eps h2')?.textContent).toBe('More from');
  expect(host.querySelector('.tide-ep-dd')?.textContent).toContain('Season 3');
  expect(host.querySelector('.tide-similar')).toBeNull();
  un!();
});
