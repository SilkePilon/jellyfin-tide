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
