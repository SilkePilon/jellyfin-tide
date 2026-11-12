import { labelNavLinks } from '../src/theme/navbar';

test('library links get their label for tooltips and screen readers; the home link is skipped', () => {
  document.body.innerHTML = `<header class="MuiAppBar-root"><div class="MuiToolbar-root"><div class="MuiStack-root">
    <a class="MuiButton-root" href="#/"><span class="MuiButton-startIcon"><img></span>server</a>
    <a class="MuiButton-root" href="#/home?tab=1"><span class="MuiButton-startIcon"><span class="tide-ms">favorite</span></span>Favorites</a>
    <a class="MuiButton-root" href="#/movies?topParentId=x"><span class="MuiButton-startIcon"><span class="tide-ms">movie</span></span>Movies</a>
  </div></div></header>`;
  labelNavLinks();
  const [home, fav, movies] = [...document.querySelectorAll<HTMLAnchorElement>('a')];
  expect(home!.dataset.tideLabel).toBeUndefined();
  expect(fav!.dataset.tideLabel).toBe('Favorites');
  expect(fav!.getAttribute('aria-label')).toBe('Favorites');
  expect(movies!.dataset.tideLabel).toBe('Movies');
});

test('the user box width is exposed to CSS so the right island covers buttons other plugins add', async () => {
  const { measureUserBox } = await import('../src/theme/navbar');
  document.body.innerHTML = `<header class="MuiAppBar-root"><div class="MuiToolbar-root"><div class="MuiStack-root"></div><div class="MuiBox-root"></div><div class="MuiBox-root"></div></div></header>`;
  const box = document.querySelectorAll<HTMLElement>('.MuiBox-root')[1]!;
  Object.defineProperty(box, 'offsetWidth', { configurable: true, value: 81 });
  measureUserBox();
  expect(document.querySelector<HTMLElement>('.MuiToolbar-root')!.style.getPropertyValue('--tide-ub-w')).toBe('81px');
});
