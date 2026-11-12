import { boot, registerFeature } from '../src/main';

afterEach(() => {
  delete (window as any).ApiClient;
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.className = '';
});

test('boot completes when the token appears 15 s after load (in-page login)', async () => {
  vi.useFakeTimers();
  let token = '';
  (window as any).ApiClient = { serverAddress: () => 'http://jf.local', accessToken: () => token, getCurrentUserId: () => 'user1' };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
    enableTheme: false, enableIcons: false, enableHome: false, enableTrailers: false, heroSlotSeconds: 30, newDays: 14,
    version: '0.1.0', defaultRowOrder: [], defaultHiddenRows: [],
  }), { status: 200 }));
  const ran = vi.fn();
  registerFeature(ran);
  let finished = false;
  void boot().then(() => (finished = true));
  await vi.advanceTimersByTimeAsync(15000);
  expect(finished).toBe(false);
  expect(document.body.classList.contains('tide')).toBe(false);
  token = 'tok';
  await vi.advanceTimersByTimeAsync(1100);
  await vi.waitFor(() => expect(finished).toBe(true));
  expect(document.body.classList.contains('tide')).toBe(true);
  expect(ran).toHaveBeenCalled();
});

test('boot gives up when window.ApiClient never appears', async () => {
  vi.useFakeTimers();
  const spy = vi.spyOn(globalThis, 'fetch');
  let finished = false;
  void boot().then(() => (finished = true));
  await vi.advanceTimersByTimeAsync(10500);
  await vi.waitFor(() => expect(finished).toBe(true));
  expect(spy).not.toHaveBeenCalled();
  expect(document.body.classList.contains('tide')).toBe(false);
});

test('boot starts from the cached config without waiting for /Tide/ClientConfig, then refreshes it', async () => {
  const { TIDE_VERSION } = await import('../src/main');
  localStorage.setItem('tide:config', JSON.stringify({ enableTheme: false, enableIcons: false, enableHome: false, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: TIDE_VERSION }));
  (window as any).ApiClient = { serverAddress: () => 'http://jf.local', accessToken: () => 'tok', getCurrentUserId: () => 'u' };
  let answer!: (r: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((r) => { answer = r; }));
  await boot();
  expect(document.body.classList.contains('tide')).toBe(true);
  answer(new Response(JSON.stringify({ enableHome: true, enableDetails: false, version: TIDE_VERSION })));
  await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('tide:config')!).enableHome).toBe(true));
  expect(JSON.parse(localStorage.getItem('tide:takeovers')!)).toEqual({ home: true, details: false });
});

test('on the Home route boot starts Home\'s data requests right away (before the page host exists)', async () => {
  const { TIDE_VERSION } = await import('../src/main');
  localStorage.setItem('tide:config', JSON.stringify({ enableTheme: false, enableIcons: false, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: TIDE_VERSION }));
  (window as any).ApiClient = { serverAddress: () => 'http://jf.local', accessToken: () => 'tok', getCurrentUserId: () => 'u' };
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => { urls.push(String(u)); return new Response('{"Items":[]}'); });
  location.hash = '#/home';
  await boot();
  expect(urls.some((u) => u.includes('/Tide/Home'))).toBe(true);
  expect(urls.some((u) => u.includes('/Genres'))).toBe(true);
  location.hash = '';
});
