import { play } from '../src/api/actions';

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u', deviceId: () => 'dev1' };
  location.hash = '#/home';
});
afterEach(() => {
  delete (window as any).ApiClient;
  vi.restoreAllMocks();
});

function route(userData: unknown, sessions: unknown = [{ Id: 'sess1', DeviceId: 'dev1' }]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/Sessions?')) return new Response(JSON.stringify(sessions));
    if (u.includes('/UserData')) return new Response(JSON.stringify(userData));
    if (u.includes('/Playing')) return new Response(null, { status: 204 });
    return new Response('nope', { status: 404 });
  });
}

test('play sends PlayNow to this browser\'s own session, resuming from UserData', async () => {
  const spy = route({ PlaybackPositionTicks: 12345, Played: false });
  await play('item1');
  const calls = spy.mock.calls.map(([u, i]) => [String(u), (i as RequestInit | undefined)?.method]);
  expect(calls[0]![0]).toBe('http://jf/Sessions?deviceId=dev1');
  const post = calls.find(([u]) => u!.includes('/Playing'))!;
  expect(post[0]).toBe('http://jf/Sessions/sess1/Playing?playCommand=PlayNow&itemIds=item1&startPositionTicks=12345');
  expect(post[1]).toBe('POST');
  expect(location.hash).toBe('#/home');
});

test('play from the start omits startPositionTicks', async () => {
  const spy = route({ PlaybackPositionTicks: 0 });
  await play('item1');
  const post = spy.mock.calls.map(([u]) => String(u)).find((u) => u.includes('/Playing'))!;
  expect(post).toBe('http://jf/Sessions/sess1/Playing?playCommand=PlayNow&itemIds=item1');
});

test('play falls back to the details page when no own session is found', async () => {
  route({}, []);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await play('item1');
  expect(location.hash).toBe('#/details?id=item1');
});
