import { initTakeover, type Takeover } from '../src/router/hook';
import { ROUTES, SELECTORS } from '../src/router/selectors';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: 't' };

test('detail route helpers', () => {
  expect(ROUTES.isDetails({ hash: '#/details?id=abc&serverId=s' } as Location)).toBe(true);
  expect(ROUTES.isDetails({ hash: '#/home' } as Location)).toBe(false);
  expect(ROUTES.detailsParams({ hash: '#/details?id=abc&season=2' } as Location)?.get('season')).toBe('2');
  expect(ROUTES.detailsParams({ hash: '#/movies' } as Location)).toBeNull();
});

test('details host is the visible cached view', () => {
  document.body.innerHTML = '<div id="itemDetailPage" class="page itemDetailPage hide" data-n="1"></div><div id="itemDetailPage" class="page itemDetailPage" data-n="2"></div>';
  expect(document.querySelector<HTMLElement>(SELECTORS.detailsHost)?.dataset.n).toBe('2');
});

function fakeTakeover(over: Partial<Takeover> = {}): Takeover & { mounts: string[] } {
  const mounts: string[] = [];
  return {
    mounts,
    id: 't', rootClass: 'tide-x',
    matches: () => location.hash.startsWith('#/details'),
    key: () => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id') ?? '',
    findHost: () => document.querySelector<HTMLElement>('#host:not(.hide)'),
    mount: async (host) => {
      const k = new URLSearchParams(location.hash.split('?')[1] ?? '').get('id') ?? '';
      mounts.push(k);
      const root = document.createElement('div');
      root.className = 'tide-x';
      host.prepend(root);
      return () => root.remove();
    },
    ...over,
  };
}

test('remounts when the key changes on the same host, unmounts when leaving', async () => {
  location.hash = '#/details?id=a';
  document.body.innerHTML = '<div id="host"></div>';
  const t = fakeTakeover();
  const stop = initTakeover(t, cfg);
  try {
    await vi.waitFor(() => expect(t.mounts).toEqual(['a']));
    location.hash = '#/details?id=b';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.waitFor(() => expect(t.mounts).toEqual(['a', 'b']));
    expect(document.querySelectorAll('.tide-x').length).toBe(1);
    location.hash = '#/home';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.waitFor(() => expect(document.querySelector('.tide-x')).toBeNull());
  } finally { stop(); }
});

test('declined mount (null) is not retried for the same host and key', async () => {
  location.hash = '#/details?id=p';
  document.body.innerHTML = '<div id="host"></div>';
  let calls = 0;
  const t = fakeTakeover({ mount: async () => { calls++; return null; } });
  const stop = initTakeover(t, cfg);
  try {
    await vi.waitFor(() => expect(calls).toBe(1));
    document.body.append(document.createElement('span')); // DOM churn
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(1);
    location.hash = '#/details?id=q';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.waitFor(() => expect(calls).toBe(2));
  } finally { stop(); }
});

test('a host that appears a frame after the route change mounts at once (no 250 ms sleep)', async () => {
  const { initTakeover } = await import('../src/router/hook');
  location.hash = '#/x';
  document.body.innerHTML = '';
  const mount = vi.fn(async (host: HTMLElement) => { host.append(Object.assign(document.createElement('div'), { className: 'tide-q' })); return () => {}; });
  const stop = initTakeover({ id: 'q', rootClass: 'tide-q', matches: () => location.hash === '#/x', key: () => 'k', findHost: () => document.getElementById('qh'), mount }, {} as never);
  const t0 = performance.now();
  requestAnimationFrame(() => { document.body.append(Object.assign(document.createElement('div'), { id: 'qh' })); });
  await vi.waitFor(() => expect(mount).toHaveBeenCalled(), { interval: 5 });
  expect(performance.now() - t0).toBeLessThan(150);
  stop();
  location.hash = '';
});
