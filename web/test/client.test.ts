import { api, getSession, imageUrl, streamUrl, waitForSession } from '../src/api/client';

function fakeApiClient() {
  (window as any).ApiClient = {
    serverAddress: () => 'http://jf.local',
    accessToken: () => 'tok123',
    getCurrentUserId: () => 'user1',
  };
}

afterEach(() => {
  delete (window as any).ApiClient;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('getSession reads window.ApiClient', () => {
  expect(getSession()).toBeNull();
  fakeApiClient();
  expect(getSession()).toEqual({ server: 'http://jf.local', token: 'tok123', userId: 'user1' });
});

test('waitForSession resolves once ApiClient appears', async () => {
  vi.useFakeTimers();
  const p = waitForSession(5000);
  setTimeout(fakeApiClient, 300);
  await vi.advanceTimersByTimeAsync(600);
  expect((await p)?.token).toBe('tok123');
});

test('waitForSession gives up after timeout', async () => {
  vi.useFakeTimers();
  const p = waitForSession(1000);
  await vi.advanceTimersByTimeAsync(1200);
  expect(await p).toBeNull();
});

test('waitForSession keeps waiting on the login page (ApiClient without token) past the timeout', async () => {
  vi.useFakeTimers();
  let token = '';
  (window as any).ApiClient = { serverAddress: () => 'http://jf.local', accessToken: () => token, getCurrentUserId: () => 'user1' };
  let result: unknown = 'pending';
  void waitForSession(10000).then((r) => (result = r));
  await vi.advanceTimersByTimeAsync(15000);
  expect(result).toBe('pending');
  token = 'late';
  await vi.advanceTimersByTimeAsync(1100);
  expect((result as { token: string }).token).toBe('late');
});

test('waitForSession re-checks on hashchange', async () => {
  vi.useFakeTimers();
  let token = '';
  (window as any).ApiClient = { serverAddress: () => 'http://jf.local', accessToken: () => token, getCurrentUserId: () => 'u' };
  let result: unknown = 'pending';
  void waitForSession(10000).then((r) => (result = r));
  await vi.advanceTimersByTimeAsync(20);
  token = 'now';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await vi.advanceTimersByTimeAsync(0);
  expect((result as { token: string }).token).toBe('now');
});

test('getSession returns null when ApiClient throws', () => {
  (window as any).ApiClient = { serverAddress: () => 'x', accessToken: () => { throw new Error('boom'); }, getCurrentUserId: () => 'u' };
  expect(getSession()).toBeNull();
});

test('api sends MediaBrowser token header and query params', async () => {
  fakeApiClient();
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":1}', { status: 200 }));
  const r = await api<{ ok: number }>('/Items', { query: { Limit: 5, IsPlayed: false, skip: undefined } });
  expect(r.ok).toBe(1);
  const [url, init] = spy.mock.calls[0]!;
  expect(url).toBe('http://jf.local/Items?Limit=5&IsPlayed=false');
  expect((init!.headers as Record<string, string>).Authorization).toBe('MediaBrowser Token="tok123"');
});

test('api throws on non-2xx', async () => {
  fakeApiClient();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
  await expect(api('/x')).rejects.toThrow('500');
});

test('url helpers', () => {
  fakeApiClient();
  expect(imageUrl('abc', 'Backdrop/0', 1920)).toBe('http://jf.local/Items/abc/Images/Backdrop/0?maxWidth=1920&quality=88');
  expect(streamUrl('vid')).toBe('http://jf.local/Videos/vid/stream?static=true&ApiKey=tok123');
});

test('waitForSession picks up a token that arrives shortly after ApiClient (no 1 s poll on app open)', async () => {
  vi.useFakeTimers();
  let token = '';
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => token, getCurrentUserId: () => 'u' };
  let got: unknown = null;
  void waitForSession(10000).then((s) => (got = s));
  await vi.advanceTimersByTimeAsync(300);
  token = 't';
  await vi.advanceTimersByTimeAsync(60);
  expect(got).toEqual({ server: 'http://jf', token: 't', userId: 'u' });
  vi.useRealTimers();
  delete (window as any).ApiClient;
});

test('api(): an external AbortSignal aborts the request', async () => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
  let seen: AbortSignal | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
    seen = (init as RequestInit).signal ?? undefined;
    return new Promise<Response>((_res, rej) => seen!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
  });
  const { api } = await import('../src/api/client');
  const ctrl = new AbortController();
  const p = api('/x', { signal: ctrl.signal });
  ctrl.abort();
  await expect(p).rejects.toThrow();
  expect(seen?.aborted).toBe(true);
  vi.restoreAllMocks();
});
