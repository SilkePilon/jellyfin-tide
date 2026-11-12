import { swapIcons } from '../src/icons/swap';
import { MUI_ICON_MAP } from '../src/icons/map';

test('hides mapped MUI svg and inserts symbol span before it, keeping size class', () => {
  document.body.innerHTML = '<button><svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeSmall" data-testid="HomeIcon"></svg></button>';
  swapIcons(document);
  const svg = document.querySelector('svg')!;
  expect(svg).not.toBeNull();
  expect(svg.classList.contains('tide-icon-hidden')).toBe(true);
  const span = svg.previousElementSibling as HTMLElement;
  expect(span.matches('span.tide-ms')).toBe(true);
  expect(span.textContent).toBe('home');
  expect(span.classList.contains('MuiSvgIcon-fontSizeSmall')).toBe(true);
});

test('removes orphaned span when React removes the svg', () => {
  document.body.innerHTML = '<button><svg data-testid="HomeIcon"></svg></button>';
  swapIcons(document);
  document.querySelector('svg')!.remove();
  swapIcons(document);
  expect(document.querySelector('span.tide-ms')).toBeNull();
});

test('updates span when svg node is reused for another icon, and restores svg if unmapped', () => {
  document.body.innerHTML = '<button><svg data-testid="HomeIcon"></svg></button>';
  swapIcons(document);
  const svg = document.querySelector('svg')!;
  svg.setAttribute('data-testid', 'SearchIcon');
  swapIcons(document);
  expect(document.querySelector('span.tide-ms')!.textContent).toBe('search');
  svg.setAttribute('data-testid', 'SomethingWeirdIcon');
  swapIcons(document);
  expect(document.querySelector('span.tide-ms')).toBeNull();
  expect(svg.classList.contains('tide-icon-hidden')).toBe(false);
});

test('remapped reuse keeps svg hidden', () => {
  document.body.innerHTML = '<button><svg data-testid="HomeIcon"></svg></button>';
  swapIcons(document);
  const svg = document.querySelector('svg')!;
  svg.setAttribute('data-testid', 'SearchIcon');
  swapIcons(document);
  expect(svg.classList.contains('tide-icon-hidden')).toBe(true);
  expect(document.querySelectorAll('span.tide-ms').length).toBe(1);
});

test('re-creates span adjacent to svg when something is inserted between them', () => {
  document.body.innerHTML = '<button><svg data-testid="HomeIcon"></svg></button>';
  swapIcons(document);
  const svg = document.querySelector('svg')!;
  const oldSpan = svg.previousElementSibling!;
  oldSpan.after(document.createElement('i'));
  swapIcons(document);
  expect(document.querySelectorAll('span.tide-ms').length).toBe(1);
  const span = svg.previousElementSibling as HTMLElement;
  expect(span.matches('span.tide-ms')).toBe(true);
  expect(span).not.toBe(oldSpan);
  expect(oldSpan.isConnected).toBe(false);
  expect(svg.classList.contains('tide-icon-hidden')).toBe(true);
});

test('leaves unmapped svg icons alone', () => {
  document.body.innerHTML = '<svg data-testid="SomethingWeirdIcon"></svg>';
  swapIcons(document);
  expect(document.querySelector('svg')).not.toBeNull();
});

test('converts legacy material-icons font spans and renames', () => {
  document.body.innerHTML = '<span class="material-icons">favorite_border</span><span class="material-icons">play_arrow</span>';
  swapIcons(document);
  const spans = [...document.querySelectorAll('span.tide-ms')];
  expect(spans.map((s) => s.textContent)).toEqual(['favorite', 'play_arrow']);
});

test('is idempotent', () => {
  document.body.innerHTML = '<svg data-testid="SearchIcon"></svg>';
  swapIcons(document);
  swapIcons(document);
  expect(document.querySelectorAll('span.tide-ms').length).toBe(1);
});

test('map covers core navigation icons', () => {
  for (const k of ['HomeIcon', 'SearchIcon', 'MenuIcon', 'SettingsIcon', 'PlayArrowIcon', 'FavoriteIcon', 'CastIcon']) {
    expect(MUI_ICON_MAP[k]).toBeTruthy();
  }
});

test('leaves stock font icons that the subset font lacks on the stock font', () => {
  document.body.innerHTML = '<span class="material-icons">bathtub</span>';
  swapIcons(document);
  const el = document.querySelector('span')!;
  expect(el.classList.contains('material-icons')).toBe(true);
  expect(el.classList.contains('tide-ms')).toBe(false);
});

test('observer swaps icons added later, scanning only the changed subtree', async () => {
  const { initIcons } = await import('../src/icons/swap');
  document.body.innerHTML = '<div id="a"></div><div id="b"><svg data-testid="HomeIcon"></svg></div>';
  initIcons({ enableIcons: true } as never);
  document.getElementById('a')!.innerHTML = '<button><svg data-testid="SearchIcon"></svg></button>';
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  expect([...document.querySelectorAll('span.tide-ms')].map((s) => s.textContent).sort()).toEqual(['home', 'search']);
  document.querySelector('#a svg')!.setAttribute('data-testid', 'MenuIcon');
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  expect(document.querySelector('#a span.tide-ms')!.textContent).toBe('menu');
});
