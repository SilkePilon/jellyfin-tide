import { createBridge } from '../src/player/bridge';
import { clock, trickplayFrame } from '../src/player/format';

function osd(): HTMLElement {
  document.body.innerHTML = `<div id="videoOsdPage" class="page">
    <div class="videoOsdBottom"><input is="emby-slider" class="osdPositionSlider" type="range" min="0" max="100" step=".01" value="25">
    <div class="osdPositionText">0:13</div>
    <button class="btnPause"><span class="material-icons">pause</span></button><button class="btnPreviousTrack"></button><button class="btnNextTrack"></button>
    <button class="btnFullscreen"></button><button class="btnPip"></button><button class="btnAudio"></button><button class="btnSubtitles"></button><button class="btnVideoOsdSettings"></button>
    <button title="Mute (M)" class="buttonMute"><span class="material-icons">volume_up</span></button><input class="osdVolumeSlider" type="range" value="80"></div></div>
    <div class="videoPlayerContainer"><video></video></div>`;
  return document.getElementById('videoOsdPage')!;
}

test('clock formatting', () => {
  expect(clock(42)).toBe('0:42');
  expect(clock(15 * 60 + 48)).toBe('15:48');
  expect(clock(3723)).toBe('1:02:03');
  expect(clock(-5)).toBe('0:00');
});

test('trickplay frame maths', () => {
  const info = { Width: 320, Height: 180, TileWidth: 10, TileHeight: 10, ThumbnailCount: 500, Interval: 10000 };
  expect(trickplayFrame(0, info)).toEqual({ image: 0, x: 0, y: 0 });
  expect(trickplayFrame(125, info)).toEqual({ image: 0, x: 2 * 320, y: 1 * 180 }); // tile 12
  expect(trickplayFrame(1005, info)).toEqual({ image: 1, x: 0, y: 0 });         // tile 100
  expect(trickplayFrame(99999, info).image).toBe(4);                             // clamped to last tile 499
});

test('reads state from the stock OSD and the web video', () => {
  const b = createBridge(osd());
  b.setDuration(52);
  const v = b.video()!;
  Object.defineProperty(v, 'paused', { configurable: true, value: false });
  Object.defineProperty(v, 'currentTime', { configurable: true, value: 13 });
  Object.defineProperty(v, 'buffered', { configurable: true, value: { length: 1, start: () => 0, end: () => 20 } });
  const s = b.read();
  expect(s.percent).toBe(25);
  expect(s.position).toBe(13);
  expect(s.duration).toBe(52);
  expect(s.paused).toBe(false);
  expect(s.volume).toBe(80);
  expect(s.buffered).toBe(7);
  expect(s.hasVideo).toBe(true);
});

test('without a web <video> (desktop/mpv): paused from the stock icon, buffered null', () => {
  const root = osd();
  document.querySelector('video')!.remove();
  root.querySelector('.btnPause .material-icons')!.textContent = 'play_arrow';
  const b = createBridge(root);
  b.setDuration(100);
  const s = b.read();
  expect(s.hasVideo).toBe(false);
  expect(s.paused).toBe(true);
  expect(s.buffered).toBeNull();
  expect(s.position).toBe(25);
});

test('commands click stock buttons; seek sets the slider and dispatches change', () => {
  const root = osd();
  const b = createBridge(root);
  b.setDuration(200);
  const clicks: string[] = [];
  root.querySelectorAll('button').forEach((x) => x.addEventListener('click', () => clicks.push(x.className)));
  b.togglePlay(); b.next(); b.previous(); b.fullscreen(); b.toggleMute(); b.openStock('audio');
  expect(clicks).toEqual(['btnPause', 'btnNextTrack', 'btnPreviousTrack', 'btnFullscreen', 'buttonMute', 'btnAudio']);
  const slider = root.querySelector<HTMLInputElement>('.osdPositionSlider')!;
  const changed = vi.fn();
  slider.addEventListener('change', changed);
  b.seek(100);
  expect(slider.value).toBe('50');
  expect(changed).toHaveBeenCalledTimes(1);
  b.seekBy(-1000);
  expect(slider.value).toBe('0');
});

test('onState only calls back when something changed', async () => {
  const root = osd();
  const b = createBridge(root);
  b.setDuration(52);
  const cb = vi.fn();
  const stop = b.onState(cb);
  await new Promise((r) => setTimeout(r, 50));
  const n = cb.mock.calls.length;
  expect(n).toBeGreaterThanOrEqual(1);
  await new Promise((r) => setTimeout(r, 50));
  expect(cb.mock.calls.length).toBe(n);
  root.querySelector<HTMLInputElement>('.osdPositionSlider')!.value = '30';
  await vi.waitFor(() => expect(cb.mock.calls.length).toBe(n + 1));
  stop();
});
