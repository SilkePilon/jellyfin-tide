import { renderAbout } from '../src/details/about';
import { renderCast } from '../src/details/cast';
import { renderSimilar } from '../src/details/similar';

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
});
afterEach(() => vi.restoreAllMocks());

const actors = Array.from({ length: 14 }, (_, i) => ({ Id: `a${i}`, Name: `Actor ${i}`, Type: 'Actor', Role: `Role ${i}`, PrimaryImageTag: i === 1 ? undefined : 't' }));

test('cast chips link to the stock person page; See all expands to actors + crew', () => {
  const el = renderCast([...actors, { Id: 'd', Name: 'Dir', Type: 'Director' }])!;
  expect(el.querySelectorAll('.tide-chipp').length).toBe(12);
  expect(el.querySelector('.tide-chipp')?.getAttribute('href')).toBe('#/details?id=a0');
  expect(el.querySelector('.tide-chipp b')?.textContent).toBe('Actor 0');
  expect(el.querySelector('.tide-chipp .tide-chipp-tx span')?.textContent).toBe('Role 0');
  expect(el.querySelectorAll('.tide-chipp')[1]!.querySelector('.tide-chipp-ini')?.textContent).toBe('A1'); // no photo: initials
  const all = el.querySelector<HTMLButtonElement>('.tide-cast-all')!;
  expect(all.textContent).toContain('See all');
  all.click();
  expect(el.querySelectorAll('.tide-chipp').length).toBe(15);
  expect(el.querySelectorAll('.tide-chipp')[14]!.querySelector('.tide-chipp-tx span')?.textContent).toBe('Director');
  expect(all.textContent).toContain('Show less');
  expect(renderCast([])).toBeNull();
  expect(renderCast(actors.slice(0, 3))!.querySelector('.tide-cast-all')).toBeNull();
});

test('similar row hides when empty and renders home cards otherwise', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"Items":[]}'));
  const empty = renderSimilar('x');
  await vi.waitFor(() => expect(empty.el.hidden).toBe(true));
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ Items: [{ Id: 'a', Name: 'A', Type: 'Movie' }, { Id: 'b', Name: 'B', Type: 'Series' }] })));
  const full = renderSimilar('y');
  await vi.waitFor(() => expect(full.el.querySelectorAll('.tide-wide').length).toBe(2));
  expect(full.el.hidden).toBe(false);
  expect(full.el.querySelector('.tide-row-title')?.textContent).toBe('More like this');
});

test('about + file panels', () => {
  const el = renderAbout(
    { Id: 'm', Name: 'M', Type: 'Movie', OfficialRating: 'PG-13', Genres: ['Action'] },
    { src: { Id: 's', Size: 2 * 1024 ** 3, MediaStreams: [{ Type: 'Video', Codec: 'hevc', Width: 1920, Height: 1080 }] }, label: 'Your file' },
    { res: '1080p', codec: 'HEVC' },
  )!;
  expect([...el.querySelectorAll('.tide-about .tide-fact')].map((f) => f.textContent)).toEqual(['RatingPG-13', 'GenresAction']);
  expect(el.querySelector('.tide-file h3')?.textContent).toContain('Your file');
  expect(el.querySelector('.tide-file .tide-q')).not.toBeNull();
  expect([...el.querySelectorAll('.tide-file .tide-frow')].map((f) => f.textContent)).toEqual(['Quality1080p', 'VideoHEVC', 'Size on disk2.0 GB']);
  expect(renderAbout({ Id: 'x', Name: 'x', Type: 'Movie' }, null, null)).toBeNull();
});
