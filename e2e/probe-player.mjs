// Dev probe: start an episode in the local 12.4 container and report which /Sessions commands change state.
import { chromium } from '@playwright/test';
const BASE = process.env.JF_URL ?? 'http://localhost:8096';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${BASE}/web/`); await p.waitForSelector('input[type=password]');
await p.fill('input[type=text], #txtManualName', 'tide'); await p.fill('input[type=password]', 'tide'); await p.keyboard.press('Enter');
await p.waitForSelector('.tide-home', { timeout: 30000 });
const api = (path, init = {}) => p.evaluate(async ({ path, init }) => {
  const c = window.ApiClient; const r = await fetch(c.serverAddress() + path.replace('{u}', c.getCurrentUserId()), { ...init, headers: { Authorization: `MediaBrowser Token="${c.accessToken()}"`, 'Content-Type': 'application/json' } });
  const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null };
}, { path, init });
const ep = (await api('/Items?userId={u}&Recursive=true&IncludeItemTypes=Episode&SortBy=ParentIndexNumber,IndexNumber&Limit=1')).body.Items[0];
await p.goto(`${BASE}/web/#/details?id=${ep.Id}`); await p.waitForTimeout(3000);
await p.locator('#itemDetailPage:not(.hide) .btnPlay, .tide-dh-primary').first().click();
await p.waitForSelector('#videoOsdPage:not(.hide)', { timeout: 60000 }); await p.waitForTimeout(3000);
const own = async () => { const deviceId = await p.evaluate(() => window.ApiClient.deviceId()); return (await api(`/Sessions?deviceId=${encodeURIComponent(deviceId)}`)).body[0]; };
const s0 = await own();
const results = {};
async function tryCmd(name, args, check) {
  const r = await api(`/Sessions/${s0.Id}/Command`, { method: 'POST', body: JSON.stringify({ Name: name, Arguments: args }) });
  await p.waitForTimeout(2500); const s = await own(); results[name] = { http: r.status, honoured: await check(s) };
}
const audio = (s0.NowPlayingItem.MediaStreams ?? []).filter((x) => x.Type === 'Audio');
const subs = (s0.NowPlayingItem.MediaStreams ?? []).filter((x) => x.Type === 'Subtitle');
results.streams = { audio: audio.map((a) => a.Index), subs: subs.map((x) => x.Index) };
if (audio.length > 1) await tryCmd('SetAudioStreamIndex', { Index: String(audio[1].Index) }, (s) => s.PlayState.AudioStreamIndex === audio[1].Index);
if (subs.length) await tryCmd('SetSubtitleStreamIndex', { Index: String(subs[0].Index) }, (s) => s.PlayState.SubtitleStreamIndex === subs[0].Index);
await tryCmd('SetMaxStreamingBitrate', { MaxBitrate: '3000000' }, async () => true);
await tryCmd('SetPlaybackRate', { PlaybackRate: '1.5' }, async () => p.evaluate(() => document.querySelector('video')?.playbackRate === 1.5));
results.sessionFields = { PlayState: Object.keys(s0.PlayState ?? {}), TranscodingInfo: Object.keys(s0.TranscodingInfo ?? {}), NowPlayingItemHasStreams: !!s0.NowPlayingItem?.MediaStreams };
results.segments = (await api(`/MediaSegments/${ep.Id}`)).status;
console.log(JSON.stringify(results, null, 2));
await b.close();
