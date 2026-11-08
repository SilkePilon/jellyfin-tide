import { BUFFER_DELAY_MS, createBuffering, createLoading, loadingPercent, loadingSteps } from '../src/player/loading';

beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' }; vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Id: 'e1', Name: 'Who Are You?', Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 3, IndexNumber: 1 }))); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

test('steps and percent mapping', () => {
  expect(loadingSteps({ videoCodec: 'h264', height: 1080 }, '4K HEVC').map((s) => s.text)).toEqual(['Connecting to server', 'Preparing stream · 4K HEVC → 1080p H264', 'Buffering']);
  expect(loadingSteps(null, null)[1]!.text).toBe('Starting stream');
  expect(loadingPercent(0, null, null)).toBe(8);
  expect(loadingPercent(1, 50, null)).toBe(40);
  expect(loadingPercent(1, null, null)).toBeNull();
  expect(loadingPercent(2, null, 5)).toBe(85);
  expect(loadingPercent(2, null, 30)).toBe(100);
  expect(loadingPercent(2, null, null)).toBeNull();
});

test('loading overlay builds once and only updates ring + steps', async () => {
  const l = createLoading();
  document.body.append(l.el);
  l.show('e1');
  const ring = l.el.querySelector('.tide-ld-ring');
  l.update(1, 40, loadingSteps(null, null));
  expect(l.el.querySelector('.tide-ld-pct')?.textContent).toBe('40%');
  expect([...l.el.querySelectorAll('.tide-ld-step')].map((s) => s.className)).toEqual(['tide-ld-step done', 'tide-ld-step on', 'tide-ld-step']);
  l.update(2, null, loadingSteps(null, null));
  expect(l.el.querySelector('.tide-ld-ring')).toBe(ring);
  expect(l.el.querySelector('.tide-ld-ring')?.classList.contains('indet')).toBe(true);
  await vi.waitFor(() => expect(l.el.querySelector('.tide-ld-line')?.textContent).toBe('S3 · E1 · Who Are You?'));
  l.hide();
  expect(l.isOn()).toBe(false);
});

test('buffering shows only after 400 ms of waiting', () => {
  vi.useFakeTimers();
  const b = createBuffering();
  b.set(true, 20);
  vi.advanceTimersByTime(BUFFER_DELAY_MS - 50);
  expect(b.el.classList.contains('show')).toBe(false);
  vi.advanceTimersByTime(100);
  expect(b.el.classList.contains('show')).toBe(true);
  expect(b.el.querySelector('.tide-buf-pct')?.textContent).toBe('20%');
  b.set(false, null);
  expect(b.el.classList.contains('show')).toBe(false);
  b.set(true, 10); b.set(false, null);
  vi.advanceTimersByTime(1000);
  expect(b.el.classList.contains('show')).toBe(false);
});
