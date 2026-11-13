import { applySetting, qualityChoices, QUALITY_BITRATES } from '../src/player/commands';
import { parseSession } from '../src/player/session';
import { loadSegments } from '../src/player/segments';

beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u', deviceId: () => 'd' }; });
afterEach(() => vi.restoreAllMocks());

test('parseSession maps play state and transcoding info', () => {
  const n = parseSession({ Id: 's1', NowPlayingItem: { Id: 'e1', Name: 'Ep', Type: 'Episode', RunTimeTicks: 3e10 }, PlayState: { AudioStreamIndex: 1, SubtitleStreamIndex: -1, PlayMethod: 'Transcode' },
    TranscodingInfo: { VideoCodec: 'h264', AudioCodec: 'aac', Width: 1920, Height: 1080, CompletionPercentage: 42.5, TranscodeReasons: ['VideoCodecNotSupported'] } })!;
  expect(n.sessionId).toBe('s1');
  expect(n.item.Id).toBe('e1');
  expect(n.audioIndex).toBe(1);
  expect(n.subtitleIndex).toBeNull(); // -1 = off
  expect(n.playMethod).toBe('Transcode');
  expect(n.transcode).toEqual({ videoCodec: 'h264', audioCodec: 'aac', width: 1920, height: 1080, completion: 42.5, reasons: ['VideoCodecNotSupported'] });
  expect(parseSession({ Id: 's2' })).toBeNull();
});

test('quality choices never exceed the source', () => {
  expect(qualityChoices(2160)).toEqual(['Auto', '4K', '1080p', '720p', '480p']);
  expect(qualityChoices(1080)).toEqual(['Auto', '1080p', '720p', '480p']);
  expect(qualityChoices(480)).toEqual(['Auto', '480p']);
  expect(QUALITY_BITRATES['1080p']).toBe(20e6);
});

function bridgeStub() {
  const opened: string[] = [];
  const v = document.createElement('video');
  return { opened, v, bridge: { video: () => v, openStock: (w: string) => opened.push(w) } as any };
}

test('speed sets the web video rate directly', async () => {
  const { bridge, v } = bridgeStub();
  expect(await applySetting('speed', '1.5', { sessionId: 's', bridge })).toBe('command');
  expect(v.playbackRate).toBe(1.5);
});

test('audio: POST ok -> applied (optimistic); POST fails -> stock dialog fallback', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
  const a = bridgeStub();
  expect(await applySetting('audio', '2', { sessionId: 's9', bridge: a.bridge })).toBe('command');
  const [url, init] = fetchSpy.mock.calls[0]!;
  expect(String(url)).toBe('http://jf/Sessions/s9/Command');
  expect(JSON.parse(String((init as RequestInit).body))).toEqual({ Name: 'SetAudioStreamIndex', Arguments: { Index: '2' } });
  expect(a.opened).toEqual([]);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const b = bridgeStub();
  expect(await applySetting('subtitles', '0', { sessionId: 's9', bridge: b.bridge })).toBe('fallback');
  expect(b.opened).toEqual(['subtitles']);
});

test('segments: every skippable media segment, any provider; Outro sets the credits, else the fallback', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Items: [
    { Type: 'Outro', StartTicks: 2900e7, EndTicks: 3000e7 }, { Type: 'Intro', StartTicks: 45e7, EndTicks: 95e7 },
    { Type: 'Recap', StartTicks: 0, EndTicks: 30e7 }, { Type: 'Unknown', StartTicks: 100e7, EndTicks: 200e7 },
    { Type: 'Preview', StartTicks: 3000e7, EndTicks: 3050e7 }, { Type: 'Commercial', StartTicks: 500e7, EndTicks: 500e7 }] })));
  expect(await loadSegments('e1', 3060, { creditsFallbackSeconds: 35 })).toEqual({
    skips: [{ kind: 'recap', start: 0, end: 30 }, { kind: 'intro', start: 45, end: 95 }, { kind: 'preview', start: 3000, end: 3050 }],
    credits: 2900,
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Items: [] })));
  expect(await loadSegments('e1', 3060, { creditsFallbackSeconds: 35 })).toEqual({ skips: [], credits: 3025 });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('x'));
  expect(await loadSegments('e1', 100, {})).toEqual({ skips: [], credits: 65 });
});
