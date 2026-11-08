import { initTheme, markActiveNav, navMatches, updateScrolled } from '../src/theme/index';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: true, heroSlotSeconds: 30, newDays: 14, version: '0.1.0' };

test('adds tide-theme when enabled', () => {
  initTheme(cfg);
  expect(document.body.classList.contains('tide-theme')).toBe(true);
});

test('does nothing when disabled', () => {
  document.body.className = '';
  initTheme({ ...cfg, enableTheme: false });
  expect(document.body.classList.contains('tide-theme')).toBe(false);
});

test('scrolled class toggles past 80px', () => {
  updateScrolled(10);
  expect(document.body.classList.contains('tide-scrolled')).toBe(false);
  updateScrolled(81);
  expect(document.body.classList.contains('tide-scrolled')).toBe(true);
});

test('navMatches: libraries by topParentId, favourites by tab, brand never', () => {
  const movies = '#/movies?topParentId=abc&collectionType=movies';
  expect(navMatches(movies, '#/movies?topParentId=abc&collectionType=movies')).toBe(true);
  expect(navMatches(movies, '#/movies?collectionType=movies&topParentId=abc&tab=1')).toBe(true);
  expect(navMatches(movies, '#/movies?topParentId=other')).toBe(false);
  expect(navMatches(movies, '#/tv?topParentId=abc')).toBe(false);
  expect(navMatches('#/home?tab=1', '#/home?tab=1')).toBe(true);
  expect(navMatches('#/home?tab=1', '#/home')).toBe(false);
  expect(navMatches('#/', '#/home')).toBe(false);
  expect(navMatches('#/', '#/')).toBe(false);
});

test('markActiveNav sets aria-current on the matching app-bar link only', () => {
  document.body.innerHTML = `<header class="MuiAppBar-root">
    <a class="MuiButton-root" href="#/">srv</a>
    <a class="MuiButton-root" href="#/home?tab=1">Favorites</a>
    <a class="MuiButton-root" href="#/movies?topParentId=m&collectionType=movies">Movies</a>
    <a class="MuiButton-root" href="#/tv?topParentId=t&collectionType=tvshows">Shows</a></header>`;
  markActiveNav('#/movies?topParentId=m&collectionType=movies');
  expect([...document.querySelectorAll('[aria-current="page"]')].map((e) => e.textContent)).toEqual(['Movies']);
  markActiveNav('#/home');
  expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
});
