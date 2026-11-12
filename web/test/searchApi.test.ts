import { CHIPS, groupHints, PER_GROUP, searchHints, SEARCH_TYPES, type Hint } from '../src/search/searchApi';
import { addRecent, loadRecent, RECENT_MAX, removeRecent } from '../src/search/recent';

const hint = (Id: string, Type: string, Name = Id): Hint => ({ Id, Name, Type });
beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' }; });
afterEach(() => vi.restoreAllMocks());

test('chips are All, Movies, Shows, Episodes, People, Music, Collections, Playlists', () => {
  expect(CHIPS.map((c) => c.label)).toEqual(['All', 'Movies', 'Shows', 'Episodes', 'People', 'Music', 'Collections', 'Playlists']);
});

test('groupHints(all): first hint is the top result; groups in display order, capped; counts per chip', () => {
  const hints = [hint('m1', 'Movie'), hint('p1', 'Person'), hint('s1', 'Series'), ...Array.from({ length: 8 }, (_, i) => hint(`e${i}`, 'Episode')), hint('a1', 'MusicAlbum'), hint('b1', 'BoxSet')];
  const g = groupHints(hints, 'all');
  expect(g.top?.Id).toBe('m1');
  expect(g.groups.map((x) => x.id)).toEqual(['shows', 'episodes', 'people', 'music', 'collections']);
  expect(g.groups.find((x) => x.id === 'episodes')!.items).toHaveLength(PER_GROUP);
  expect(g.counts).toMatchObject({ all: 13, movies: 1, shows: 1, episodes: 8, people: 1, music: 1, collections: 1, playlists: 0 });
});

test('groupHints(chip): no top result, the full filtered list', () => {
  const hints = Array.from({ length: 9 }, (_, i) => hint(`e${i}`, 'Episode'));
  const g = groupHints([hint('m1', 'Movie'), ...hints], 'episodes');
  expect(g.top).toBeNull();
  expect(g.groups).toHaveLength(1);
  expect(g.groups[0]!.items).toHaveLength(9);
});

test('searchHints asks for every type incl. Person and MusicArtist (people only come back when listed)', async () => {
  let url = '';
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => { url = String(u); return new Response(JSON.stringify({ SearchHints: [hint('x', 'Movie')] })); });
  expect((await searchHints('sin'))[0]!.Id).toBe('x');
  expect(url).toContain('/Search/Hints?searchTerm=sin');
  expect(url).toContain(`includeItemTypes=${encodeURIComponent(SEARCH_TYPES)}`);
  expect(SEARCH_TYPES.split(',')).toEqual(expect.arrayContaining(['Person', 'MusicArtist', 'Movie', 'Series', 'Episode', 'BoxSet', 'Playlist', 'MusicAlbum', 'Audio']));
});

test('recent: newest first, case-insensitive de-dupe, capped, removable, per user', () => {
  for (let i = 0; i < 10; i++) addRecent('u1', `q${i}`);
  expect(loadRecent('u1')).toHaveLength(RECENT_MAX);
  expect(loadRecent('u1')[0]).toBe('q9');
  addRecent('u1', 'Q5');
  expect(loadRecent('u1')[0]).toBe('Q5');
  expect(loadRecent('u1').filter((x) => x.toLowerCase() === 'q5')).toHaveLength(1);
  expect(removeRecent('u1', 'Q5')).not.toContain('Q5');
  expect(loadRecent('u2')).toEqual([]);
  addRecent('u1', '   ');
  expect(loadRecent('u1')).not.toContain('');
});
