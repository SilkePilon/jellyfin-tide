import { mountPlayer, PLAYER_TAKEOVER } from '../src/player/player';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: 't', introSkipper: false, creditsFallbackSeconds: 35 };

function stockOsd() {
  document.body.innerHTML = `<div id="videoOsdPage" class="page"><div class="videoOsdBottom">
    <input class="osdPositionSlider" type="range" value="10"><div class="osdPositionText">0:05</div>
    <button class="btnPause"><span class="material-icons">pause</span></button><button class="btnNextTrack"></button></div></div>
    <div class="videoPlayerContainer"><video></video></div>`;
  return document.getElementById('videoOsdPage')!;
}

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u', deviceId: () => 'd', getCurrentUser: async () => ({ Configuration: { EnableNextEpisodeAutoPlay: true } }) };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/Sessions?')) return new Response(JSON.stringify([{ Id: 's1', NowPlayingItem: { Id: 'e1', Name: 'Who Are You?', Type: 'Episode', SeriesId: 'ser', SeriesName: 'Silo', ParentIndexNumber: 3, IndexNumber: 1, RunTimeTicks: 3.06e10, SeasonId: 'se3' }, PlayState: { AudioStreamIndex: 1 } }]));
    if (u.includes('/Shows/ser/Seasons')) return new Response(JSON.stringify({ Items: [{ Id: 'se3', Name: 'Season 3', Type: 'Season', IndexNumber: 3, ChildCount: 2 }] }));
    if (u.includes('/Shows/ser/Episodes')) return new Response(JSON.stringify({ Items: [
      { Id: 'e1', Name: 'Who Are You?', Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 3, IndexNumber: 1 },
      { Id: 'e2', Name: "It's All Good", Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 3, IndexNumber: 2, RunTimeTicks: 3.06e10 }] }));
    if (u.includes('/Items/e1')) return new Response(JSON.stringify({ Id: 'e1', Name: 'Who Are You?', Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 3, IndexNumber: 1, MediaSources: [{ Id: 'm', MediaStreams: [{ Type: 'Video', Height: 2160 }, { Type: 'Audio', Index: 1, DisplayTitle: 'English - AAC - Stereo' }] }] }));
    return new Response('{}');
  });
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; document.documentElement.className = ''; });

test('takeover matches #/video with the flag on', () => {
  expect(PLAYER_TAKEOVER.matches(cfg as any, { hash: '#/video' } as Location)).toBe(true);
  expect(PLAYER_TAKEOVER.matches({ ...cfg, enablePlayer: false } as any, { hash: '#/video' } as Location)).toBe(false);
  expect(PLAYER_TAKEOVER.matches(cfg as any, { hash: '#/home' } as Location)).toBe(false);
});

test('mount hides the stock OSD, renders Tide controls from the session, unmount restores', async () => {
  const host = stockOsd();
  const un = await mountPlayer(host, cfg as any);
  expect(host.classList.contains('tide-taken')).toBe(true);
  await vi.waitFor(() => expect(document.querySelector('.tide-pc-ep')?.textContent).toBe('S3 · E1 · Who Are You?'));
  expect(document.querySelector('.tide-pc-epbtn')?.hasAttribute('hidden')).toBe(false);
  await vi.waitFor(() => expect(document.querySelector('.tide-pc-next')?.hasAttribute('hidden')).toBe(false));
  document.querySelector<HTMLButtonElement>('.tide-pc-epbtn')!.click();
  await vi.waitFor(() => expect(document.querySelector('.tide-pshelf.open')).not.toBeNull());
  expect(document.querySelector('.tide-player')!.classList.contains('tide-ps-open')).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.tide-pshelf.open')).toBeNull();
  un();
  expect(host.classList.contains('tide-taken')).toBe(false);
  expect(document.querySelector('.tide-player')).toBeNull();
});

test('stock Play button click starts the loading screen', async () => {
  const { initPlayLoading } = await import('../src/player/player');
  location.hash = '#/details?id=e1';
  document.body.innerHTML = '<div id="itemDetailPage"><button class="btnPlay">Play</button></div>';
  const stop = initPlayLoading(cfg as any);
  document.querySelector<HTMLButtonElement>('.btnPlay')!.click();
  expect(document.querySelector('.tide-ld.show')).not.toBeNull();
  stop();
});

test('paused screen stays up on mouse move and leaves only when playback resumes (click resumes)', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const host = stockOsd();
  const v = document.querySelector('video')!;
  let isPaused = true;
  Object.defineProperty(v, 'paused', { configurable: true, get: () => isPaused });
  const pauseBtn = host.querySelector<HTMLButtonElement>('.btnPause')!;
  const toggle = vi.fn(() => { isPaused = !isPaused; });
  pauseBtn.addEventListener('click', toggle);
  const un = await mountPlayer(host, cfg as any);
  const root = document.querySelector('.tide-player')!;
  await vi.advanceTimersByTimeAsync(3100);
  await vi.waitFor(() => expect(root.classList.contains('tide-pz-on')).toBe(true));
  root.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(100);
  expect(root.classList.contains('tide-pz-on')).toBe(true);
  root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(toggle).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  await vi.waitFor(() => expect(root.classList.contains('tide-pz-on')).toBe(false));
  un();
  vi.useRealTimers();
});

test('wheel over Tide panels scrolls them instead of reaching the stock volume handler', async () => {
  const host = stockOsd();
  const un = await mountPlayer(host, cfg as any);
  const stockVolume = vi.fn();
  document.addEventListener('wheel', stockVolume);
  const shelf = document.querySelector<HTMLElement>('.tide-pshelf')!;
  const track = document.createElement('div');
  track.className = 'tide-row-track';
  const card = document.createElement('button');
  track.append(card);
  shelf.append(track);
  const overShelf = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
  card.dispatchEvent(overShelf);
  expect(stockVolume).not.toHaveBeenCalled();
  expect(overShelf.defaultPrevented).toBe(true); // vertical notch over the episode row pages it sideways
  document.querySelector('.tide-pmset')!.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
  expect(stockVolume).not.toHaveBeenCalled();
  document.querySelector('.tide-player')!.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
  expect(stockVolume).toHaveBeenCalledTimes(1); // over the video itself the stock wheel-volume stays
  document.removeEventListener('wheel', stockVolume);
  un();
});

test('Jellyfin Desktop (no web <video>): play/pause button and paused screen follow the class-based stock icon', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const host = stockOsd();
  document.querySelector('.videoPlayerContainer')!.remove(); // mpv renders outside the page
  const stockIcon = host.querySelector('.btnPause')!;
  stockIcon.innerHTML = '<span class="xlargePaperIconButton material-icons pause" aria-hidden="true"></span>';
  const un = await mountPlayer(host, cfg as any);
  const root = document.querySelector('.tide-player')!;
  const shown = () => { const i = root.querySelector('.tide-pc-play > :first-child')!; return i.getAttribute('data-icon') ?? i.textContent; };
  await vi.advanceTimersByTimeAsync(100);
  expect(shown()).toBe('pause');
  stockIcon.querySelector('span')!.className = 'xlargePaperIconButton material-icons play_arrow'; // what videoosd does on pause
  await vi.advanceTimersByTimeAsync(100);
  expect(shown()).toBe('play_arrow');
  await vi.advanceTimersByTimeAsync(3_100);
  expect(root.classList.contains('tide-pz-on')).toBe(true);
  stockIcon.querySelector('span')!.className = 'xlargePaperIconButton material-icons pause';
  await vi.advanceTimersByTimeAsync(100);
  expect(shown()).toBe('pause');
  expect(root.classList.contains('tide-pz-on')).toBe(false);
  un();
  vi.useRealTimers();
});

test('subtitles and settings buttons open their own menus, one at a time; Esc closes; stock missing shows the fallback row', async () => {
  const host = stockOsd();
  const un = await mountPlayer(host, cfg as any);
  await vi.waitFor(() => expect(document.querySelector('.tide-pc-ep')?.textContent).toBe('S3 · E1 · Who Are You?'));
  document.querySelector<HTMLElement>('.tide-pc-set')!.click();
  expect(document.querySelector('.tide-pmset.open')).not.toBeNull();
  await vi.waitFor(() => expect(document.querySelector('.tide-pmset [data-stock]')).not.toBeNull(), { timeout: 3000 });
  expect(document.querySelector('.tide-pmset [data-go="audio"]')).not.toBeNull();
  document.querySelector<HTMLElement>('.tide-pc-subs')!.click();
  expect(document.querySelector('.tide-pmset.open')).toBeNull();
  expect(document.querySelector('.tide-pmsub.open')).not.toBeNull();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.tide-pmsub.open')).toBeNull();
  un();
});

test('shelf opens the current season with NOW PLAYING and no synopsis', async () => {
  const { createShelf } = await import('../src/player/shelf');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/Seasons')) return new Response(JSON.stringify({ Items: [{ Id: 's1', Name: 'Season 1', Type: 'Season', IndexNumber: 1, ChildCount: 2 }] }));
    if (u.includes('/Episodes')) return new Response(JSON.stringify({ Items: [
      { Id: 'a', Name: 'A', Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 1, IndexNumber: 1, Overview: 'x' },
      { Id: 'b', Name: 'B', Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 1, IndexNumber: 2, Overview: 'y' }] }));
    return new Response(JSON.stringify({ Id: 'b', Name: 'B', Type: 'Episode', ParentIndexNumber: 1 }));
  });
  const changes: boolean[] = [];
  const sh = createShelf((o) => changes.push(o));
  document.body.append(sh.el);
  await sh.setEpisode('ser', 'b');
  sh.open();
  expect(sh.el.querySelector('[data-id="b"] .tide-wide-tag')?.textContent).toBe('NOW PLAYING');
  expect(sh.el.querySelector('.tide-wide-syn')).toBeNull();
  sh.close();
  expect(changes).toEqual([true, false]);
});
