import { createSearchDialog, DEBOUNCE_MS, subline } from '../src/search/dialog';
import { loadRecent } from '../src/search/recent';
import type { Hint } from '../src/search/searchApi';

const H: Hint[] = [
  { Id: 'm1', Name: 'Sintel', Type: 'Movie', ProductionYear: 2010, RunTimeTicks: 8.88e10 },
  { Id: 's1', Name: 'Silo', Type: 'Series', ProductionYear: 2023, ChildCount: 3 },
  { Id: 'e1', Name: 'Who Are You?', Type: 'Episode', Series: 'Silo', ParentIndexNumber: 3, IndexNumber: 1, RunTimeTicks: 3.06e10 },
  { Id: 'p1', Name: 'Rebecca Ferguson', Type: 'Person' },
];
function setup() {
  const search = vi.fn(async (q: string, _signal?: AbortSignal) => (q === 'none' ? [] : H));
  const genres = vi.fn(async () => [{ id: 'g1', name: 'Action', image: null }, { id: 'g2', name: 'Drama', image: 'http://jf/x.jpg' }]);
  const genreTitles = vi.fn(async () => [H[0]!]);
  const d = createSearchDialog({ search, genres, genreTitles, userId: () => 'u1' });
  document.body.append(d.el);
  const input = () => d.el.querySelector<HTMLInputElement>('.tide-sd-q')!;
  const type = async (v: string) => { input().value = v; input().dispatchEvent(new Event('input')); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 5); };
  const key = (k: string, shift = false) => input().dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
  return { d, search, genres, genreTitles, input, type, key };
}
beforeEach(() => { vi.useFakeTimers(); (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u1' }; location.hash = '#/home'; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; document.documentElement.className = ''; });

test('subline per type', () => {
  expect(subline(H[0]!)).toBe('2010 · 2h 28m');
  expect(subline(H[1]!)).toBe('2023 · 3 seasons');
  expect(subline(H[2]!)).toBe('Silo · S3 E1 · 51m');
  expect(subline({ Id: 'a', Name: 'A', Type: 'MusicAlbum', AlbumArtist: 'Daft Punk', ProductionYear: 2013 })).toBe('Daft Punk · 2013');
});

test('open: empty state with recent searches and genre tiles; html lock class', async () => {
  localStorage.setItem('tide-recent:u1', JSON.stringify(['Silo', 'Top Gun']));
  const { d } = setup();
  d.open();
  await vi.advanceTimersByTimeAsync(0);
  expect(d.isOpen()).toBe(true);
  expect(document.documentElement.classList.contains('tide-sd-on')).toBe(true);
  expect([...d.el.querySelectorAll('[data-recent] .tide-sd-rl')].map((e) => e.textContent)).toEqual(['Silo', 'Top Gun']);
  expect(d.el.querySelectorAll('[data-genre]')).toHaveLength(2);
});

test('typing: one debounced search, top result + groups + chip counts, match highlighted', async () => {
  const { d, search, type } = setup();
  d.open();
  await type('s');
  await type('si');
  expect(search).toHaveBeenCalledTimes(2);
  expect(search.mock.calls[1]![0]).toBe('si');
  expect(d.el.querySelector('.tide-sd-top b')?.textContent).toBe('Sintel');
  expect(d.el.querySelector('.tide-sd-top mark')?.textContent).toBe('Si');
  expect([...d.el.querySelectorAll('.tide-sd-hd')].map((e) => e.textContent)).toEqual(['TOP RESULT', 'SHOWS', 'EPISODES', 'PEOPLE']);
  expect(d.el.querySelector('[data-chip="episodes"] .tide-sd-n')?.textContent).toBe('1');
  expect(d.el.querySelector('[data-chip="music"]')).toBeNull();
});

test('a newer query aborts the older request', async () => {
  const { d, search, input } = setup();
  d.open();
  input().value = 'a'; input().dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 5);
  const first = search.mock.calls[0]![1] as AbortSignal;
  input().value = 'ab'; input().dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 5);
  expect(first.aborted).toBe(true);
});

test('keyboard: arrows move the selection (wrapping), Enter opens details and saves the query, Esc closes', async () => {
  const { d, type, key } = setup();
  d.open();
  await type('si');
  key('ArrowDown');
  expect(d.el.querySelector('.tide-sd-row.sel')?.getAttribute('data-i')).toBe('1');
  key('ArrowUp'); key('ArrowUp');
  expect(d.el.querySelector('.tide-sd-row.sel')?.getAttribute('data-i')).toBe('3');
  key('ArrowDown');
  key('Enter');
  expect(location.hash).toBe('#/details?id=m1');
  expect(d.isOpen()).toBe(false);
  expect(loadRecent('u1')[0]).toBe('si');
  d.open();
  key('Escape');
  expect(d.isOpen()).toBe(false);
});

test('Shift+Enter plays playable types (tide:play), the chip filter shows the full list', async () => {
  const played: string[] = [];
  window.addEventListener('tide:play', (e) => played.push((e as CustomEvent).detail.id));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('[]'));
  const { d, type, key } = setup();
  d.open();
  await type('si');
  key('Enter', true);
  await vi.advanceTimersByTimeAsync(0);
  expect(played).toContain('m1');
  d.open();
  await type('si');
  d.el.querySelector<HTMLElement>('[data-chip="episodes"]')!.click();
  expect(d.el.querySelector('.tide-sd-top')).toBeNull();
  expect(d.el.querySelectorAll('.tide-sd-row')).toHaveLength(1);
});

test('no results message; genre tile shows that genre; recent × removes', async () => {
  localStorage.setItem('tide-recent:u1', JSON.stringify(['Silo']));
  const { d, type, genreTitles } = setup();
  d.open();
  await vi.advanceTimersByTimeAsync(0);
  d.el.querySelector<HTMLElement>('[data-recent-x]')!.click();
  expect(d.el.querySelectorAll('[data-recent]')).toHaveLength(0);
  d.el.querySelector<HTMLElement>('[data-genre="g1"]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(genreTitles).toHaveBeenCalledWith('g1');
  expect(d.el.querySelector('.tide-sd-hd')?.textContent).toBe('ACTION');
  expect(d.el.querySelectorAll('.tide-sd-row')).toHaveLength(1);
  await type('none');
  expect(d.el.querySelector('.tide-sd-empty')?.textContent).toBe('No results for “none”.');
});

test('scrim click closes', () => {
  const { d } = setup();
  d.open();
  d.el.querySelector<HTMLElement>('.tide-sd-scrim')!.click();
  expect(d.isOpen()).toBe(false);
});

test('closing gives focus back: the hidden input is blurred and the closed dialog is inert', async () => {
  const { d, input } = setup();
  d.open();
  await vi.advanceTimersByTimeAsync(40);
  expect(document.activeElement).toBe(input());
  expect(d.el.hasAttribute('inert')).toBe(false);
  d.close();
  expect(document.activeElement).not.toBe(input());
  expect(d.el.hasAttribute('inert')).toBe(true);
});

test('a person as top result reads "Person" once', async () => {
  const search = vi.fn(async () => [{ Id: 'p1', Name: 'Sacha', Type: 'Person' }] as Hint[]);
  const d = createSearchDialog({ search, genres: async () => [], genreTitles: async () => [], userId: () => 'u1' });
  document.body.append(d.el);
  d.open();
  const i = d.el.querySelector<HTMLInputElement>('.tide-sd-q')!;
  i.value = 'sa'; i.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 5);
  expect(d.el.querySelector('.tide-sd-top small')?.textContent).toBe('Person');
});
