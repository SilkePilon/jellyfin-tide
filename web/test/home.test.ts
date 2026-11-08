import { moveRow } from '../src/home/editPanel';
import { mountHome } from '../src/home/home';
import * as hero from '../src/home/hero';
import { initRouter, shouldTakeOver } from '../src/router/hook';
import { initTabbar } from '../src/mobile/tabbar';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: '0.1.0' };

function mockFetch(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/Tide/Home')) return new Response(JSON.stringify({
      hero: [{ id: 'h1', type: 'Movie', reason: 'new', name: 'X', genres: [], overview: '', hasLogo: false, hasThumb: false, isFavorite: false, youtube: [], playTargetId: 'h1' }],
      prefs: { rowOrder: ['continue', 'topRated'], hidden: [], genres: {}, edited: false }, config: cfg,
    }));
    if (u.includes('/Genres')) return new Response('{"Items":[{"Name":"Drama"}]}');
    return new Response('{"Items":[]}');
  });
}

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
  (globalThis as any).IntersectionObserver = class { observe() {} disconnect() {} };
});
afterEach(() => vi.restoreAllMocks());

test('moveRow reorders', () => {
  expect(moveRow(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  expect(moveRow(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
});

test('shouldTakeOver only on home with feature on', () => {
  expect(shouldTakeOver(cfg, { hash: '#/home', pathname: '/web/' } as Location)).toBe(true);
  expect(shouldTakeOver(cfg, { hash: '#/details?id=1', pathname: '/web/' } as Location)).toBe(false);
  expect(shouldTakeOver({ ...cfg, enableHome: false }, { hash: '#/home', pathname: '/web/' } as Location)).toBe(false);
});

test('mountHome hides stock content, renders hero + rows + edit button, unmount restores', async () => {
  mockFetch();
  document.body.innerHTML = '<main><div class="stock">stock</div></main>';
  const host = document.querySelector('main') as HTMLElement;
  const unmount = await mountHome(host, cfg);
  expect((host.querySelector('.stock') as HTMLElement).hidden).toBe(true);
  expect(host.querySelector('.tide-hero')).not.toBeNull();
  expect(host.querySelectorAll('.tide-row').length).toBeGreaterThanOrEqual(2);
  expect(host.querySelector('.tide-edit-home button')?.textContent).toContain('Edit home');
  expect(document.body.classList.contains('tide-on-home')).toBe(true);
  unmount();
  expect(host.querySelector('.tide-home')).toBeNull();
  expect((host.querySelector('.stock') as HTMLElement).hidden).toBe(false);
  expect(document.body.classList.contains('tide-on-home')).toBe(false);
});

test('mountHome re-hides stock children added after mount and restores original hidden state', async () => {
  mockFetch();
  document.body.innerHTML = '<main><div class="stock">stock</div><div class="was-hidden" hidden></div></main>';
  const host = document.querySelector('main') as HTMLElement;
  const unmount = await mountHome(host, cfg);
  const late = document.createElement('div');
  late.className = 'late';
  host.append(late);
  await vi.waitFor(() => expect(late.hidden).toBe(true));
  unmount();
  expect(late.hidden).toBe(false);
  expect((host.querySelector('.was-hidden') as HTMLElement).hidden).toBe(true);
});

test('mountHome failure unhides stock and rethrows', async () => {
  mockFetch();
  vi.spyOn(hero, 'createHero').mockImplementation(() => { throw new Error('boom'); });
  document.body.innerHTML = '<main><div class="stock">stock</div></main>';
  const host = document.querySelector('main') as HTMLElement;
  await expect(mountHome(host, cfg)).rejects.toThrow('boom');
  expect((host.querySelector('.stock') as HTMLElement).hidden).toBe(false);
  expect(host.querySelector('.tide-home')).toBeNull();
  expect(document.body.classList.contains('tide-on-home')).toBe(false);
});

const page = () => '<div id="indexPage" class="homePage"><div id="homeTab">stock</div><div id="favoritesTab"></div></div>';

test('router mounts on home, unmounts on leave, remounts once on return and after host replacement', async () => {
  mockFetch();
  location.hash = '#/home';
  document.body.innerHTML = `<main>${page()}</main>`;
  const dispose = initRouter(cfg);
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('.tide-home').length).toBe(1));
    expect((document.querySelector('#homeTab') as HTMLElement).hidden).toBe(true);

    // React recreates #indexPage
    document.querySelector('#indexPage')!.remove();
    document.querySelector('main')!.insertAdjacentHTML('beforeend', page());
    await vi.waitFor(() => expect(document.querySelector('#indexPage .tide-home')).not.toBeNull());
    expect(document.querySelectorAll('.tide-home').length).toBe(1);
    expect((document.querySelector('#homeTab') as HTMLElement).hidden).toBe(true);

    // leave home: React removes the page
    location.hash = '#/movies';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    document.querySelector('#indexPage')!.remove();
    await vi.waitFor(() => expect(document.querySelector('.tide-home')).toBeNull());
    expect(document.body.classList.contains('tide-on-home')).toBe(false);

    // return
    location.hash = '#/home';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    document.querySelector('main')!.insertAdjacentHTML('beforeend', page());
    await vi.waitFor(() => expect(document.querySelector('#indexPage .tide-home')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 100));
    expect(document.querySelectorAll('.tide-home').length).toBe(1);
  } finally {
    dispose();
  }
});

test('router keeps stock home when mount fails and does not retry the same host', async () => {
  mockFetch();
  const heroSpy = vi.spyOn(hero, 'createHero').mockImplementation(() => { throw new Error('boom'); });
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  location.hash = '#/home';
  document.body.innerHTML = `<main>${page()}</main>`;
  const dispose = initRouter(cfg);
  try {
    await vi.waitFor(() => expect(err).toHaveBeenCalled());
    const fetches = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await new Promise((r) => setTimeout(r, 150));
    expect(err).toHaveBeenCalledTimes(1);
    expect(heroSpy).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(fetches);
    expect((document.querySelector('#homeTab') as HTMLElement).hidden).toBe(false);
    expect(document.querySelector('.tide-home')).toBeNull();

    // a recreated #indexPage is a new element: gets one fresh attempt
    document.querySelector('#indexPage')!.remove();
    document.querySelector('main')!.insertAdjacentHTML('beforeend', page());
    await vi.waitFor(() => expect(err).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 150));
    expect(err).toHaveBeenCalledTimes(2);
  } finally {
    dispose();
  }
});

async function mounted() {
  mockFetch();
  document.body.innerHTML = '<main><div class="stock">stock</div></main>';
  const host = document.querySelector('main') as HTMLElement;
  const unmount = await mountHome(host, cfg);
  const btn = host.querySelector('.tide-edit-home button') as HTMLButtonElement;
  return { host, unmount, btn };
}

test('edit panel focuses inside, traps Tab, Escape closes and returns focus', async () => {
  const { unmount, btn } = await mounted();
  btn.focus();
  btn.click();
  const panel = document.querySelector('.tide-edit-panel') as HTMLElement;
  expect(panel.contains(document.activeElement)).toBe(true);
  const buttons = [...panel.querySelectorAll<HTMLElement>('button, input, select')];
  buttons[buttons.length - 1]!.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  expect(document.activeElement).toBe(buttons[0]);
  const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(esc);
  expect(esc.defaultPrevented).toBe(true);
  expect(document.querySelector('.tide-edit-overlay')).toBeNull();
  expect(document.activeElement).toBe(btn);
  unmount();
});

test('unmount removes an open edit panel', async () => {
  const { unmount, btn } = await mounted();
  btn.click();
  expect(document.querySelector('.tide-edit-overlay')).not.toBeNull();
  unmount();
  expect(document.querySelector('.tide-edit-overlay')).toBeNull();
});

test('unmount with the edit panel open removes its keydown listener (Escape/Tab no longer prevented)', async () => {
  const { unmount, btn } = await mounted();
  btn.click();
  expect(document.querySelector('.tide-edit-overlay')).not.toBeNull();
  unmount();
  for (const key of ['Escape', 'Tab']) {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  }
});

test('Reset to default uses the admin defaults from ClientConfig', async () => {
  mockFetch();
  document.body.innerHTML = '<main><div class="stock">stock</div></main>';
  const host = document.querySelector('main') as HTMLElement;
  const admin = { ...cfg, defaultRowOrder: ['topRated', 'continue'], defaultHiddenRows: ['random'] };
  const unmount = await mountHome(host, admin);
  (host.querySelector('.tide-edit-home button') as HTMLButtonElement).click();
  const panel = document.querySelector('.tide-edit-panel') as HTMLElement;
  [...panel.querySelectorAll<HTMLButtonElement>('footer button')].find((b) => b.textContent === 'Reset to default')!.click();
  const labels = [...panel.querySelectorAll('.tide-edit-label')].map((l) => l.textContent);
  expect(labels.slice(0, 2)).toEqual(['Top rated, not watched yet', 'Continue Watching']);
  expect(labels.length).toBe(14);
  const randomBox = [...panel.querySelectorAll('.tide-edit-item')].find((li) => li.textContent?.includes('Something different'))!
    .querySelector('input[type=checkbox]') as HTMLInputElement;
  expect(randomBox.checked).toBe(false);
  unmount();
});

test('mountHome without /Tide/Home falls back to admin defaults', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/Tide/Home')) return new Response('x', { status: 500 });
    return new Response('{"Items":[]}');
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  document.body.innerHTML = '<main></main>';
  const host = document.querySelector('main') as HTMLElement;
  const unmount = await mountHome(host, { ...cfg, defaultRowOrder: ['favourites', 'continue'], defaultHiddenRows: ['continue'] });
  const rows = [...host.querySelectorAll<HTMLElement>('section.tide-row')].map((r) => r.dataset.row);
  expect(rows[0]).toBe('favourites');
  expect(rows).not.toContain('continue');
  unmount();
});

test('save failure shows a toast', async () => {
  const { unmount, btn } = await mounted();
  const f = globalThis.fetch as unknown as { mockImplementation(fn: (u: unknown, init?: RequestInit) => Promise<Response>): void };
  f.mockImplementation(async (_u, init) => (init?.method === 'PUT' ? new Response('no', { status: 500 }) : new Response('{"Items":[]}')));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  btn.click();
  (document.querySelector('.tide-edit-panel .tide-btn-w') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.querySelector('.tide-home-toast')?.textContent).toMatch(/save/i));
  unmount();
  document.querySelector('.tide-home-toast')?.remove();
});

test('mountHome pulls the root up by the measured page offset (full-bleed hero under app bar)', async () => {
  mockFetch();
  document.body.innerHTML = '<main><div class="stock">stock</div></main>';
  const host = document.querySelector('main') as HTMLElement;
  const orig = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('tide-home') ? ({ top: 48, left: 0, width: 0, height: 0 } as DOMRect) : orig.call(this);
  });
  const unmount = await mountHome(host, cfg);
  expect((host.querySelector('.tide-home') as HTMLElement).style.getPropertyValue('--tide-home-offset')).toBe('48px');
  unmount();
});

test('initTabbar is idempotent and disposable', () => {
  document.body.innerHTML = '';
  const d1 = initTabbar();
  const d2 = initTabbar();
  try {
    expect(d2).toBe(d1);
    expect(document.querySelectorAll('.tide-tabbar').length).toBe(1);
    expect(document.querySelectorAll('.tide-tabbar a').length).toBe(4);
  } finally {
    d1();
  }
  expect(document.querySelector('.tide-tabbar')).toBeNull();
});

test('tab bar toggles body padding class and hides on player/queue routes', () => {
  document.body.innerHTML = '';
  location.hash = '#/home';
  const dispose = initTabbar();
  try {
    expect(document.body.classList.contains('tide-has-tabbar')).toBe(true);
    location.hash = '#/queue';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.querySelector('.tide-tabbar')!.classList.contains('off')).toBe(true);
    expect(document.body.classList.contains('tide-has-tabbar')).toBe(false);
    location.hash = '#/nowplaying';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.querySelector('.tide-tabbar')!.classList.contains('off')).toBe(true);
  } finally {
    dispose();
  }
});

test('tab bar follows history.pushState/replaceState and restores history on dispose', () => {
  document.body.innerHTML = '';
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.replaceState(null, '', '#/login');
  const dispose = initTabbar();
  try {
    expect(document.body.classList.contains('tide-has-tabbar')).toBe(false);
    history.pushState(null, '', '#/home');
    expect(document.body.classList.contains('tide-has-tabbar')).toBe(true);
    expect(document.querySelector('.tide-tabbar a.on')?.textContent).toContain('Home');
    history.replaceState(null, '', '#/movies');
    expect(document.querySelector('.tide-tabbar a.on')?.textContent).toContain('Movies');
  } finally {
    dispose();
  }
  expect(history.pushState).toBe(origPush);
  expect(history.replaceState).toBe(origReplace);
});

function rectTop(get: () => number) {
  const orig = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('tide-home')) {
      // natural top only when our margin is reset, like a real layout
      const reset = this.style.getPropertyValue('--tide-home-offset') === '0px';
      return { top: reset ? get() : 0, left: 0, width: 0, height: 0 } as DOMRect;
    }
    return orig.call(this);
  });
}
const offsetOf = (host: HTMLElement) => (host.querySelector('.tide-home') as HTMLElement).style.getPropertyValue('--tide-home-offset');

test('mountHome pulls the root up by the measured page offset and re-measures on resize', async () => {
  mockFetch();
  document.body.innerHTML = '<main><div class="stock">stock</div></main>';
  const host = document.querySelector('main') as HTMLElement;
  let top = 48;
  rectTop(() => top);
  const unmount = await mountHome(host, cfg);
  expect(offsetOf(host)).toBe('48px');
  top = 86;
  window.dispatchEvent(new Event('resize'));
  expect(offsetOf(host)).toBe('86px');
  unmount();
});

test('mountHome re-measures on animation frames until the layout settles', async () => {
  mockFetch();
  document.body.innerHTML = '<main><div class="stock">stock</div></main>';
  const host = document.querySelector('main') as HTMLElement;
  let top = 86;
  rectTop(() => top);
  const unmount = await mountHome(host, cfg);
  top = 48; // stock section tabs go away after mount
  await vi.waitFor(() => expect(offsetOf(host)).toBe('48px'));
  unmount();
});

test('unmount releases resize listener, observers and frames', async () => {
  mockFetch();
  const prevRO = (globalThis as any).ResizeObserver;
  const disconnect = vi.fn();
  const observed: Element[] = [];
  (globalThis as any).ResizeObserver = class { constructor(_cb: unknown) {} observe(el: Element) { observed.push(el); } disconnect() { disconnect(); } };
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  document.body.innerHTML = '<div class="spacer"></div><main><div class="stock">stock</div></main>';
  const host = document.querySelector('main') as HTMLElement;
  try {
    const unmount = await mountHome(host, cfg);
    expect(observed).toContain(host);
    expect(observed).toContain(document.querySelector('.spacer'));
    const resizeHandler = add.mock.calls.find(([t]) => t === 'resize')![1];
    const writes = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
    unmount();
    expect(remove).toHaveBeenCalledWith('resize', resizeHandler);
    expect(disconnect).toHaveBeenCalled();
    writes.mockClear();
    window.dispatchEvent(new Event('resize'));
    await new Promise((r) => setTimeout(r, 100)); // several frames
    expect(writes).not.toHaveBeenCalled();
  } finally {
    (globalThis as any).ResizeObserver = prevRO;
  }
});
