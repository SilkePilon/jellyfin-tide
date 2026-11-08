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
