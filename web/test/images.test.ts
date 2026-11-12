import { backdropOf, chain, logoOf, primaryOf, sources } from '../src/ui/images';
import { wideCard } from '../src/ui/cards';
import type { JfItem } from '../src/types';

vi.mock('../src/api/actions', () => ({ openDetails: vi.fn(), play: vi.fn(), setFavourite: vi.fn(), setWatched: vi.fn() }));

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
});

const movie = (extra: Partial<JfItem> = {}): JfItem => ({ Id: 'm', Name: 'M', Type: 'Movie', ...extra });

test('tagged URLs when the item carries tags; null when known missing; undefined when unknown', () => {
  expect(primaryOf(movie({ ImageTags: { Primary: 'p1' } }), 400)).toBe('http://jf/Items/m/Images/Primary?maxWidth=400&quality=88&tag=p1');
  expect(primaryOf(movie({ ImageTags: {} }), 400)).toBeNull();
  expect(primaryOf(movie(), 400)).toBeUndefined();
  expect(backdropOf(movie({ BackdropImageTags: ['b1'] }), 720)).toContain('/Items/m/Images/Backdrop/0?maxWidth=720&quality=88&tag=b1');
  expect(backdropOf(movie({ BackdropImageTags: [] }), 720)).toBeNull();
  expect(logoOf(movie({ ImageTags: { Primary: 'p' } }), 360)).toBeNull();
});

test('episodes inherit the series backdrop / logo through parent tags; no parent info means none', () => {
  const ep: JfItem = { Id: 'e', Name: 'E', Type: 'Episode', SeriesId: 's', ImageTags: { Primary: 'p' }, BackdropImageTags: [] };
  expect(backdropOf(ep, 720)).toBeNull();
  expect(logoOf(ep, 360)).toBeNull();
  expect(logoOf({ Id: 'e', Name: 'E', Type: 'Episode', SeriesId: 's' }, 360)).toBeUndefined();
  const withParents = { ...ep, ParentBackdropItemId: 's', ParentBackdropImageTags: ['sb'], ParentLogoItemId: 's', ParentLogoImageTag: 'sl' };
  expect(backdropOf(withParents, 720)).toContain('/Items/s/Images/Backdrop/0?maxWidth=720&quality=88&tag=sb');
  expect(logoOf(withParents, 360)).toContain('/Items/s/Images/Logo?maxWidth=360&quality=88&tag=sl');
});

test('sources skips known-missing images, tries unknown ones untagged, and chain walks them on error', () => {
  const list = sources([null, 'x', 'Backdrop/0', 720], [undefined, 'x', 'Primary', 720]);
  expect(list).toEqual(['http://jf/Items/x/Images/Primary?maxWidth=720&quality=88']);
  const img = document.createElement('img');
  const none = vi.fn();
  expect(chain(img, ['a', 'b'], none)).toBe(true);
  expect(img.getAttribute('src')).toBe('a');
  img.onerror!(new Event('error'));
  expect(img.getAttribute('src')).toBe('b');
  img.onerror!(new Event('error'));
  expect(none).toHaveBeenCalledOnce();
  expect(chain(document.createElement('img'), [], none)).toBe(false);
});

test('a card for an item without logo or backdrop requests neither (no 404 + swap)', () => {
  const c = wideCard(movie({ ImageTags: { Primary: 'p' }, BackdropImageTags: [] }));
  expect(c.querySelector<HTMLImageElement>('.tide-wide-art')!.src).toContain('/Images/Primary?maxWidth=720&quality=88&tag=p');
  expect(c.querySelector('img.tide-wide-logo')).toBeNull();
  expect(c.querySelector('.tide-wide-logo-text')!.textContent).toBe('M');
  const bare = wideCard(movie({ ImageTags: {}, BackdropImageTags: [] }));
  expect(bare.querySelector('.tide-wide-art')).toBeNull();
});
