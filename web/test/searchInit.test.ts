import { initSearch, isSearchRoute } from '../src/search/index';
import type { SearchDialog } from '../src/search/dialog';

function fakeDialog() {
  let open = false;
  const d: SearchDialog & { opens: number } = { el: document.createElement('div'), opens: 0, open() { open = true; d.opens++; }, close() { open = false; }, isOpen: () => open };
  return d;
}
const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: 't' } as any;
let stop: (() => void) | null = null;
afterEach(() => { stop?.(); stop = null; document.body.innerHTML = ''; location.hash = ''; });

test('isSearchRoute', () => {
  expect(isSearchRoute('#/search')).toBe(true);
  expect(isSearchRoute('#/search?query=x')).toBe(true);
  expect(isSearchRoute('#/searchx')).toBe(false);
  expect(isSearchRoute('#/home')).toBe(false);
});

test('app-bar search link opens the dialog instead of navigating', () => {
  const d = fakeDialog();
  document.body.innerHTML = '<header class="MuiAppBar-root"><a href="#/search" aria-label="Search"><span>search</span></a></header>';
  stop = initSearch(cfg, () => d);
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  document.querySelector('a span')!.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(d.opens).toBe(1);
});

test('/ and Ctrl+K open it, but not while typing or in the player', () => {
  const d = fakeDialog();
  stop = initSearch(cfg, () => d);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
  expect(d.opens).toBe(1);
  d.close();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
  expect(d.opens).toBe(2);
  d.close();
  const inp = document.createElement('input');
  document.body.append(inp);
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
  expect(d.opens).toBe(2);
  location.hash = '#/video';
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
  expect(d.opens).toBe(2);
});

test('#/search opens the dialog and returns to the previous page', async () => {
  const d = fakeDialog();
  location.hash = '#/movies?topParentId=x';
  stop = initSearch(cfg, () => d);
  location.hash = '#/search';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 0));
  expect(d.opens).toBe(1);
  expect(location.hash).toBe('#/movies?topParentId=x');
});

test('enableSearch=false: nothing is intercepted', () => {
  const d = fakeDialog();
  document.body.innerHTML = '<a href="#/search">s</a>';
  stop = initSearch({ ...cfg, enableSearch: false }, () => d);
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  document.querySelector('a')!.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(false);
  expect(d.opens).toBe(0);
});
