import { hold, isCloaked, readHint, release, saveHint, startBootCloak, wouldTakeOver, HOLD_MS } from '../src/boot/cloak';
import { initTakeover, type Takeover } from '../src/router/hook';
import { boot } from '../src/main';

const cfg = { enableTheme: false, enableIcons: false, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: '0.4.1' };
const loc = (hash: string) => ({ hash, pathname: '/web/' } as Location);
const cloaked = () => document.documentElement.classList.contains('tide-cloak');

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); location.hash = ''; delete (window as any).ApiClient; });

test('holds are named, the class is on while any is held, and each expires on its own', () => {
  vi.useFakeTimers();
  hold('a'); hold('b');
  expect(cloaked()).toBe(true);
  release('a');
  expect(cloaked()).toBe(true);
  release('b');
  expect(cloaked()).toBe(false);
  hold('c');
  vi.advanceTimersByTime(HOLD_MS + 1);
  expect(isCloaked()).toBe(false);
  expect(cloaked()).toBe(false);
});

test('hint: unknown means on; a config that turned home off stops cloaking home', () => {
  expect(readHint()).toEqual({ home: true, details: true });
  expect(wouldTakeOver(readHint(), loc('#/home'))).toBe(true);
  expect(wouldTakeOver(readHint(), loc('#/details?id=1'))).toBe(true);
  expect(wouldTakeOver(readHint(), loc('#/movies'))).toBe(false);
  saveHint({ home: false, details: true });
  expect(wouldTakeOver(readHint(), loc('#/home'))).toBe(false);
});

test('boot cloak starts only on a takeover route and ends when Tide stays out (no session)', async () => {
  vi.useFakeTimers();
  location.hash = '#/movies';
  startBootCloak();
  expect(cloaked()).toBe(false);
  location.hash = '#/home';
  startBootCloak();
  expect(cloaked()).toBe(true);
  let done = false;
  void boot().then(() => (done = true));
  await vi.advanceTimersByTimeAsync(10_500); // no ApiClient ever
  await vi.waitFor(() => expect(done).toBe(true));
  expect(cloaked()).toBe(false);
});

test('router cloaks the stock page while a takeover mounts and uncloaks once it resolved', async () => {
  location.hash = '#/home';
  document.body.innerHTML = '<div id="host"></div>';
  let finish!: (u: () => void) => void;
  const t: Takeover = {
    id: 'x', rootClass: 'tide-x', cloak: true,
    matches: () => location.hash === '#/home', key: () => 'k',
    findHost: () => document.getElementById('host'),
    mount: (host) => new Promise((r) => { finish = (u) => { host.append(Object.assign(document.createElement('div'), { className: 'tide-x' })); r(u); }; }),
  };
  const stop = initTakeover(t, cfg);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(cloaked()).toBe(true);
  finish(() => {});
  await vi.waitFor(() => expect(cloaked()).toBe(false));
  stop();
});

test('a takeover that fails uncloaks (the stock page shows)', async () => {
  location.hash = '#/home';
  document.body.innerHTML = '<div id="host"></div>';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const t: Takeover = {
    id: 'y', rootClass: 'tide-y', cloak: true, matches: () => true, key: () => 'k',
    findHost: () => document.getElementById('host'), mount: async () => { throw new Error('boom'); },
  };
  const stop = initTakeover(t, cfg);
  await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  expect(cloaked()).toBe(false);
  stop();
});
