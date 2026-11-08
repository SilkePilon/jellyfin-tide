# Tide 0.4.0 — Player + Episode Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stock video player controls with Tide's control layer (L1, E2, S3, Z4, N2, K1, touch), add an episode detail page, and ship the held 0.3.1 fixes as 0.4.0.

**Architecture:** The stock player keeps playing underneath with its OSD hidden. `player/bridge.ts` is the only code that touches it:
- **Reads:** the slider, the text and the button state.
- **Controls:** button clicks, plus slider value with a `change` event.

`player/session.ts` polls the user's own playback session for the item, its tracks and transcoding info. `player/commands.ts` changes tracks and quality through session commands, falling back to the stock dialogs. Each UI piece is its own module, mounted by `player/player.ts` through the existing takeover router.

**Tech Stack:**
- TypeScript 5.8 + Vite 6 IIFE, vitest 3 + jsdom
- C# .NET 10 Jellyfin 12.4 plugin + xUnit
- Playwright 1.52 against the local 12.4 container

**Spec:** `docs/superpowers/specs/2026-11-08-tide-player-design.md`. Prototype for visuals: `.superpowers/brainstorm/1768206-1794175749/content/player-proto.html`. Open it when a visual detail is unclear. This plan carries every exact value the code needs.

## Global Constraints

- **Target:** Jellyfin 12.4. Player route `#/video`, host `#videoOsdPage:not(.hide)`.
- **Stock OSD:** it stays in the DOM and keeps running. Tide only hides it visually:
  `#videoOsdPage.tide-taken :is(.videoOsdBottom, .skinHeader, .upNextContainer, .osdLockButton) { opacity: 0 !important; pointer-events: none !important; }`
- **Surfaces:** solid only. Panels `#141416`, buttons `#2a2a2e` (hover `#3a3a3c`), ring track `#48484a`, accent white, segment marks `#ffd60a`.
- **Motion:** transform and opacity only. Player curve `--tide-sp: cubic-bezier(.22,1,.36,1)`. Show .6s, hide .45s. The pills' drop transition has a .08s delay. Under reduced motion, use opacity only.
- **Idle:** hide after **3 s**. Paused screen after **4 s**. Countdown **10 s**. Buffering indicator after **400 ms**. Command confirm timeout **1.5 s**. Session poll **2 s**.
- **Pill lift:** `--tide-lift: -132px` (phone `-84px`). Pills rest at `bottom: 44px` (phone `16px`).
- **Never rebuild animated nodes per frame.** Build once per item, then update text and attributes only.
- **Invisible overlays never take pointer events.**
- **Version 0.4.0:** `web/package.json`, `TIDE_VERSION`, csproj `0.4.0.0`, compose plugin dir `Tide_0.4.0.0`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Repo hygiene:** never add the private server URL or key, or library mockups, to the repo.

**Commands** (repo root `/home/silke/.t3/scratch/2026-11-08-i-want-to-make-my-dd552d62`, branch `feat/player`):

| What | Command |
|---|---|
| Web tests | `cd web && npx vitest run <file>`; full suite `cd web && npm test && npm run typecheck` |
| Server tests | `./scripts/dotnet test Tide.slnx` |
| Deploy | `(cd web && npm run build) && ./scripts/dotnet publish server/Jellyfin.Plugin.Tide -c Release -o e2e/plugins/Tide && (cd e2e && docker compose up -d --force-recreate)` |
| E2E | `cd e2e && npx playwright test` |

Note: e2e tests re-authenticate with the same DeviceId, which revokes earlier tokens. Restore config with a **fresh** `auth()`.

---

## File structure

| File | Responsibility |
|---|---|
| `server/.../Configuration/PluginConfiguration.cs`, `Models/Dtos.cs`, `Api/TideController.cs`, `Configuration/configPage.html` | `EnablePlayer`, `CreditsFallbackSeconds`, `introSkipper` detection |
| `server/.../Api/IntroSkipperProbe.cs` (new) | pure detection from a list of (id, name, active) |
| `web/src/types.ts` | ClientConfig fields |
| `docs/notes/web-12.4-player.md` (new) | probe results: which session commands 12.4 honours |
| `web/src/player/bridge.ts` | stock-player reads + commands |
| `web/src/player/session.ts` | own-session poller |
| `web/src/player/commands.ts` | audio / subtitle / quality / speed, with fallbacks |
| `web/src/player/segments.ts` | intro + credits ranges |
| `web/src/player/format.ts` | time formatting, trickplay frame maths |
| `web/src/player/controls.ts` | L1 layout, scrubber, idle, keyboard, skip pill |
| `web/src/player/shelf.ts` | E2 shelf (wraps `renderEpisodes`) |
| `web/src/player/settingsSheet.ts` | S3 |
| `web/src/player/paused.ts` | Z4 |
| `web/src/player/endCard.ts` | N2 |
| `web/src/player/loading.ts` | K1 + buffering |
| `web/src/player/touch.ts` | phone gestures |
| `web/src/player/player.ts`, `player.css` | mount + takeover |
| `web/src/ui/cards.ts` | `wideCard` options `synopsis`, free-text `tag` |
| `web/src/details/episodes.ts` | options for the shelf / episode page |
| `web/src/details/header.ts`, `details.ts`, `details.css` | episode page |
| `web/src/api/actions.ts` | `play()` dispatches `tide:play` |
| `e2e/tests/player.spec.ts` | e2e |

---

### Task 1: Server config + Intro Skipper detection

**Files:**
- Create: `server/Jellyfin.Plugin.Tide/Api/IntroSkipperProbe.cs`
- Modify: `Configuration/PluginConfiguration.cs`, `Models/Dtos.cs` (ClientConfig), `Api/TideController.cs`, `Configuration/configPage.html`, `web/src/types.ts`
- Test: `server/Jellyfin.Plugin.Tide.Tests/TideControllerTests.cs`

**Interfaces:**
- **Server:**
  - `public static class IntroSkipperProbe { public static readonly Guid Id = new("c83d86bb-a1e0-4c35-a113-e2101cf4ee6b"); public static bool IsActive(IEnumerable<(Guid Id, string Name, bool Active)> plugins) }`
  - `TideController.BuildClientConfig(PluginConfiguration cfg, string version, bool introSkipper = false)`
- **Client:** `ClientConfig.enablePlayer?: boolean; creditsFallbackSeconds?: number; introSkipper?: boolean`

- [ ] **Step 1: Failing tests.** Append to `TideControllerTests`:

```csharp
    [Fact]
    public void ClientConfigExposesPlayerSettings()
    {
        using var d = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(new PluginConfiguration(), "0.4.0", introSkipper: true)));
        Assert.True(d.RootElement.GetProperty("enablePlayer").GetBoolean());
        Assert.Equal(35, d.RootElement.GetProperty("creditsFallbackSeconds").GetInt32());
        Assert.True(d.RootElement.GetProperty("introSkipper").GetBoolean());
        using var c = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(new PluginConfiguration { CreditsFallbackSeconds = 9999, EnablePlayer = false }, "0.4.0")));
        Assert.Equal(300, c.RootElement.GetProperty("creditsFallbackSeconds").GetInt32());
        Assert.False(c.RootElement.GetProperty("enablePlayer").GetBoolean());
        Assert.False(c.RootElement.GetProperty("introSkipper").GetBoolean());
    }

    [Theory]
    [InlineData("c83d86bb-a1e0-4c35-a113-e2101cf4ee6b", "Whatever", true, true)]
    [InlineData("00000000-0000-0000-0000-000000000001", "Intro Skipper", true, true)]
    [InlineData("00000000-0000-0000-0000-000000000001", "intro skipper", true, true)]
    [InlineData("c83d86bb-a1e0-4c35-a113-e2101cf4ee6b", "Intro Skipper", false, false)]
    [InlineData("00000000-0000-0000-0000-000000000001", "Tide", true, false)]
    public void IntroSkipperDetection(string id, string name, bool active, bool expected)
        => Assert.Equal(expected, IntroSkipperProbe.IsActive(new[] { (Guid.Parse(id), name, active) }));
```

- [ ] **Step 2: Run.** `./scripts/dotnet test Tide.slnx --filter "ClientConfigExposesPlayerSettings|IntroSkipperDetection"`. Expected: build FAIL.

- [ ] **Step 3: Implement.**

`IntroSkipperProbe.cs`:
```csharp
namespace Jellyfin.Plugin.Tide.Api;

/// <summary>Is the Intro Skipper plugin installed and active? (Its media segments drive Skip intro / credits.)</summary>
public static class IntroSkipperProbe
{
    public static readonly Guid Id = new("c83d86bb-a1e0-4c35-a113-e2101cf4ee6b");

    public static bool IsActive(IEnumerable<(Guid Id, string Name, bool Active)> plugins)
        => plugins.Any(p => p.Active && (p.Id == Id || string.Equals(p.Name, "Intro Skipper", StringComparison.OrdinalIgnoreCase)));
}
```

In `PluginConfiguration`, after `EnableSmoothScroll`:
```csharp
    public bool EnablePlayer { get; set; } = true;
    public int CreditsFallbackSeconds { get; set; } = 35;
```

In `Dtos.cs`, change the end of `ClientConfig`:
```csharp
    [property: JsonPropertyName("enableSmoothScroll")] bool EnableSmoothScroll,
    [property: JsonPropertyName("enablePlayer")] bool EnablePlayer,
    [property: JsonPropertyName("creditsFallbackSeconds")] int CreditsFallbackSeconds,
    [property: JsonPropertyName("introSkipper")] bool IntroSkipper);
```

In `TideController`:
- Add `using MediaBrowser.Common.Plugins; using MediaBrowser.Model.Plugins;`
- Add field `private readonly IPluginManager _plugins;`
- Add a constructor parameter `IPluginManager plugins` (last) and assign it.
- Replace the private overload and the static builder:

```csharp
    private ClientConfig BuildClientConfig()
    {
        var intro = IntroSkipperProbe.IsActive(_plugins.Plugins.Select(p => (p.Id, p.Name, p.Manifest.Status == PluginStatus.Active)));
        return BuildClientConfig(Cfg, Plugin.Instance!.Version.ToString(3), intro);
    }

    internal static ClientConfig BuildClientConfig(Configuration.PluginConfiguration cfg, string version, bool introSkipper = false)
    {
        var defaults = UserPrefsStore.Normalize(new UserPrefs { RowOrder = cfg.DefaultRowOrder, Hidden = cfg.DefaultHiddenRows });
        return new ClientConfig(
            cfg.EnableTheme, cfg.EnableIcons, cfg.EnableHome, cfg.EnableTrailers,
            Math.Clamp(cfg.HeroSlotSeconds, 8, 120), NewDays(cfg.NewDays), version,
            defaults.RowOrder, defaults.Hidden, cfg.EnableDetails, cfg.EnableSmoothScroll,
            cfg.EnablePlayer, Math.Clamp(cfg.CreditsFallbackSeconds, 0, 300), introSkipper);
    }
```

The existing calls to `BuildClientConfig()` (no args) in `GetClientConfig` and `GetHome` keep working; they are now instance calls.

If `IPluginManager` lives in a different namespace in 12.4, the build error says so. Fix the `using` (it is `MediaBrowser.Common.Plugins` in 10.10+). `LocalPlugin.Manifest.Status` is `PluginStatus`.

In `configPage.html`:
- After the SmoothScroll checkbox, add:
```html
      <label class="checkboxContainer"><input is="emby-checkbox" type="checkbox" id="EnablePlayer"><span>Tide player</span></label>
      <div class="inputContainer"><input is="emby-input" type="number" id="CreditsFallbackSeconds" min="0" max="300" label="Credits start (seconds before the end) when Intro Skipper is not installed"></div>
```
- Add `'EnablePlayer'` to `bools` and `'CreditsFallbackSeconds'` to `nums`.

In `web/src/types.ts` `ClientConfig`, add:
```ts
  /** 0.4.0+. Missing (older server) means on / 35 / false. */
  enablePlayer?: boolean; creditsFallbackSeconds?: number; introSkipper?: boolean;
```

- [ ] **Step 4: Run.** `./scripts/dotnet test Tide.slnx` and `cd web && npm run typecheck`. Expected: all PASS.

- [ ] **Step 5: Commit.**
```bash
git add server web/src/types.ts
git commit -m "feat: player config flags and Intro Skipper detection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Probe the 12.4 stock player (record facts)

**Files:**
- Create: `e2e/probe-player.mjs` (kept in repo as a dev tool), `docs/notes/web-12.4-player.md`

**Goal:** Record which session commands 12.4's web client honours, so `commands.ts` knows its fallbacks. This task has no unit test. Its deliverable is the notes file with measured results.

- [ ] **Step 1: Write** `e2e/probe-player.mjs`:

```js
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
const ep = (await api('/Items?userId={u}&Recursive=true&IncludeItemTypes=Episode&Limit=1')).body.Items[0];
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
```

- [ ] **Step 2: Run** it against the running container (deploy the current branch first if needed): `cd e2e && node probe-player.mjs`.

  The fixture episodes have one audio track and no subtitles. If `streams.audio` has fewer than 2 entries, add a multi-audio / subtitle fixture:
  ```sh
  cd e2e && docker run --rm -v "$PWD/media:/m" -w /m jrottenberg/ffmpeg:6.1-alpine -y -i "Shows/Blender Shorts/Season 01/Blender Shorts S01E01.mp4" -f lavfi -t 52 -i sine=frequency=440 -map 0:v -map 0:a -map 1:a -c:v copy -c:a aac -metadata:s:a:0 language=eng -metadata:s:a:1 language=dut "Shows/Blender Shorts/Season 01/tmp.mkv"
  ```
  Then move it over S01E01 as `Blender Shorts S01E01.mkv` (delete the `.mp4`), create `Blender Shorts S01E01.en.srt` with one cue (`1\n00:00:01,000 --> 00:00:05,000\nHello\n`), and rescan (`POST /Library/Refresh`).
  - Add the same commands to `fetch-media.sh`.
  - Re-run the probe.

- [ ] **Step 3: Write** `docs/notes/web-12.4-player.md` with:
  - the probe output
  - one line per command: **honoured** or **not honoured**
  - the session field lists

  `commands.ts` (Task 4) reads this file's verdicts. For each command marked not honoured, Task 4 uses the fallback listed there.

- [ ] **Step 4: Commit.**
```bash
git add e2e/probe-player.mjs e2e/fetch-media.sh docs/notes/web-12.4-player.md
git commit -m "docs: probe which session commands the 12.4 web player honours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Bridge to the stock player + format helpers

**Files:**
- Create: `web/src/player/bridge.ts`, `web/src/player/format.ts`
- Test: `web/test/playerBridge.test.ts`

**Interfaces:**
- `format.ts`:
  - `export function clock(seconds: number): string` gives `0:42`, `15:48`, `1:02:03`.
  - `export interface TrickplayInfo { Width: number; Height: number; TileWidth: number; TileHeight: number; ThumbnailCount: number; Interval: number }`
  - `export function trickplayFrame(t: number, info: TrickplayInfo): { image: number; x: number; y: number }` returns the sheet index plus the pixel offset of the tile.
- `bridge.ts`:
```ts
export interface PlayerState { percent: number; position: number; duration: number; paused: boolean; muted: boolean; volume: number; buffered: number | null; hasVideo: boolean }
export interface Bridge {
  root: HTMLElement;                         // #videoOsdPage
  video(): HTMLVideoElement | null;
  read(): PlayerState;                       // duration from setDuration() (seconds); position = percent × duration
  setDuration(seconds: number): void;
  togglePlay(): void; seek(seconds: number): void; seekBy(delta: number): void;
  next(): void; previous(): void; toggleMute(): void; setVolume(v: number): void;
  fullscreen(): void; pip(): void; openStock(which: 'audio' | 'subtitles' | 'settings'): void;
  onState(cb: (s: PlayerState) => void): () => void;   // rAF loop while subscribed; calls cb only when a value changed
}
export function createBridge(root: HTMLElement): Bridge
```

- [ ] **Step 1: Failing tests** `web/test/playerBridge.test.ts`:

```ts
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
```

- [ ] **Step 2: Run.** `cd web && npx vitest run test/playerBridge.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `web/src/player/format.ts`:

```ts
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
}

export interface TrickplayInfo { Width: number; Height: number; TileWidth: number; TileHeight: number; ThumbnailCount: number; Interval: number }

/** Which trickplay sheet and which tile (pixel offset inside the sheet) shows second `t`. */
export function trickplayFrame(t: number, info: TrickplayInfo): { image: number; x: number; y: number } {
  const per = info.TileWidth * info.TileHeight;
  const tile = Math.max(0, Math.min(info.ThumbnailCount - 1, Math.floor((t * 1000) / info.Interval)));
  const inSheet = tile % per;
  return { image: Math.floor(tile / per), x: (inSheet % info.TileWidth) * info.Width, y: Math.floor(inSheet / info.TileWidth) * info.Height };
}
```

`web/src/player/bridge.ts`:

```ts
/** The only module that touches the stock 12.4 player (#videoOsdPage). Verified selectors: docs/notes/web-12.4-player.md */
export interface PlayerState { percent: number; position: number; duration: number; paused: boolean; muted: boolean; volume: number; buffered: number | null; hasVideo: boolean }
export interface Bridge {
  root: HTMLElement;
  video(): HTMLVideoElement | null;
  read(): PlayerState;
  setDuration(seconds: number): void;
  togglePlay(): void; seek(seconds: number): void; seekBy(delta: number): void;
  next(): void; previous(): void; toggleMute(): void; setVolume(v: number): void;
  fullscreen(): void; pip(): void; openStock(which: 'audio' | 'subtitles' | 'settings'): void;
  onState(cb: (s: PlayerState) => void): () => void;
}

const SEL = {
  slider: '.osdPositionSlider', pause: '.btnPause', next: '.btnNextTrack', prev: '.btnPreviousTrack',
  fullscreen: '.btnFullscreen', pip: '.btnPip', audio: '.btnAudio', subtitles: '.btnSubtitles', settings: '.btnVideoOsdSettings',
  mute: 'button[title^="Mute"], button[title^="Unmute"], .buttonMute', volume: '.osdVolumeSlider',
} as const;

export function createBridge(root: HTMLElement): Bridge {
  let duration = 0;
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s);
  const click = (s: string) => q<HTMLButtonElement>(s)?.click();
  const video = () => document.querySelector<HTMLVideoElement>('.videoPlayerContainer video');
  const slider = () => q<HTMLInputElement>(SEL.slider);
  const icon = (s: string) => (q(`${s} .material-icons, ${s} .tide-ms`)?.textContent ?? '').trim();

  const read = (): PlayerState => {
    const v = video();
    const pct = Number(slider()?.value ?? 0) || 0;
    const position = v && Number.isFinite(v.currentTime) && v.currentTime > 0 ? v.currentTime : (pct / 100) * duration;
    let buffered: number | null = null;
    if (v) {
      buffered = 0;
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= position && v.buffered.end(i) >= position) buffered = v.buffered.end(i) - position;
      }
    }
    return {
      percent: pct, position, duration,
      paused: v ? v.paused : icon(SEL.pause) === 'play_arrow',
      muted: v ? v.muted : icon(SEL.mute) === 'volume_off',
      volume: Number(q<HTMLInputElement>(SEL.volume)?.value ?? 100),
      buffered, hasVideo: !!v,
    };
  };

  const seek = (seconds: number) => {
    const s = slider();
    if (!s || duration <= 0) return;
    const pct = Math.max(0, Math.min(100, (seconds / duration) * 100));
    s.value = String(Math.round(pct * 100) / 100);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  };

  return {
    root, video, read,
    setDuration: (d) => { duration = d; },
    togglePlay: () => click(SEL.pause),
    seek,
    seekBy: (delta) => seek(read().position + delta),
    next: () => click(SEL.next), previous: () => click(SEL.prev),
    toggleMute: () => click(SEL.mute),
    setVolume: (val) => { const s = q<HTMLInputElement>(SEL.volume); if (s) { s.value = String(val); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); } },
    fullscreen: () => click(SEL.fullscreen), pip: () => click(SEL.pip),
    openStock: (w) => click(SEL[w]),
    onState(cb) {
      let last = '';
      let frame = 0;
      const tick = () => {
        const s = read();
        const key = JSON.stringify([s.percent, Math.round(s.position * 10), s.paused, s.muted, s.volume, s.buffered === null ? null : Math.round(s.buffered * 10)]);
        if (key !== last) { last = key; cb(s); }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    },
  };
}
```

- [ ] **Step 4: Run.** `npx vitest run test/playerBridge.test.ts && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/player/bridge.ts web/src/player/format.ts web/test/playerBridge.test.ts
git commit -m "feat(player): bridge to the hidden stock player + time/trickplay helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Session poller, commands, segments

**Files:**
- Create: `web/src/player/session.ts`, `web/src/player/commands.ts`, `web/src/player/segments.ts`
- Test: `web/test/playerData.test.ts`

**Interfaces:**
```ts
// session.ts
export interface NowPlaying {
  sessionId: string; item: JfDetail;                     // NowPlayingItem (has MediaStreams, RunTimeTicks, SeriesId, ParentIndexNumber, IndexNumber, Trickplay?)
  audioIndex: number | null; subtitleIndex: number | null; playMethod: string | null;
  transcode: { videoCodec?: string; audioCodec?: string; width?: number; height?: number; completion?: number; reasons?: string[] } | null;
}
export function parseSession(s: unknown): NowPlaying | null;
export function pollSession(cb: (n: NowPlaying | null) => void, ms?: number): () => void;   // default 2000
// commands.ts
export type SettingKind = 'audio' | 'subtitles' | 'quality' | 'speed';
export const QUALITY_BITRATES: Record<'Auto' | '4K' | '1080p' | '720p' | '480p', number>;   // 120e6, 120e6, 20e6, 8e6, 3e6
export function qualityChoices(sourceHeight: number): (keyof typeof QUALITY_BITRATES)[];
export async function applySetting(kind: SettingKind, value: string, ctx: { sessionId: string; bridge: Bridge; confirm: () => boolean; timeoutMs?: number }): Promise<'command' | 'fallback'>;
// segments.ts
export interface Segments { intro: [number, number] | null; credits: number | null }   // seconds
export async function loadSegments(itemId: string, duration: number, cfg: Pick<ClientConfig, 'introSkipper' | 'creditsFallbackSeconds'>): Promise<Segments>;
```

`applySetting` does the following:
- **speed:** sets `bridge.video().playbackRate` directly when a web `<video>` exists and returns `'command'`. Otherwise it opens the stock settings dialog and returns `'fallback'`.
- **audio / subtitles / quality:** POSTs the session command (`SetAudioStreamIndex` `{Index}`, `SetSubtitleStreamIndex` `{Index}`, `SetMaxStreamingBitrate` `{MaxBitrate}`), then polls `confirm()` every 150 ms until `timeoutMs` (1500). If unconfirmed, it opens the stock dialog (`audio` / `subtitles` / `settings`) and returns `'fallback'`.
- **Notes override:** when Task 2's notes mark a command as not honoured, the call skips straight to the fallback. Encode this as `const HONOURED = { audio: true, subtitles: true, quality: true }` at the top of `commands.ts`, set from the notes file.

- [ ] **Step 1: Failing tests** `web/test/playerData.test.ts`:

```ts
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
  expect(await applySetting('speed', '1.5', { sessionId: 's', bridge, confirm: () => true })).toBe('command');
  expect(v.playbackRate).toBe(1.5);
});

test('audio: command confirmed -> command; unconfirmed -> stock dialog fallback', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
  const a = bridgeStub();
  expect(await applySetting('audio', '2', { sessionId: 's9', bridge: a.bridge, confirm: () => true, timeoutMs: 300 })).toBe('command');
  const [url, init] = fetchSpy.mock.calls[0]!;
  expect(String(url)).toBe('http://jf/Sessions/s9/Command');
  expect(JSON.parse(String((init as RequestInit).body))).toEqual({ Name: 'SetAudioStreamIndex', Arguments: { Index: '2' } });
  const b = bridgeStub();
  expect(await applySetting('audio', '2', { sessionId: 's9', bridge: b.bridge, confirm: () => false, timeoutMs: 300 })).toBe('fallback');
  expect(b.opened).toEqual(['audio']);
});

test('segments: intro skipper on reads media segments; off uses the fallback credits', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Items: [
    { Type: 'Intro', StartTicks: 45e7, EndTicks: 95e7 }, { Type: 'Outro', StartTicks: 2900e7, EndTicks: 3000e7 }] })));
  expect(await loadSegments('e1', 3060, { introSkipper: true, creditsFallbackSeconds: 35 })).toEqual({ intro: [45, 95], credits: 2900 });
  expect(await loadSegments('e1', 3060, { introSkipper: false, creditsFallbackSeconds: 35 })).toEqual({ intro: null, credits: 3025 });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('x'));
  expect(await loadSegments('e1', 100, { introSkipper: true })).toEqual({ intro: null, credits: 65 });
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.**

`session.ts`:
```ts
import { api, jfApiClient } from '../api/client';
import type { JfDetail } from '../api/item';

export interface NowPlaying {
  sessionId: string; item: JfDetail;
  audioIndex: number | null; subtitleIndex: number | null; playMethod: string | null;
  transcode: { videoCodec?: string; audioCodec?: string; width?: number; height?: number; completion?: number; reasons?: string[] } | null;
}

type Raw = { Id?: string; NowPlayingItem?: JfDetail; PlayState?: { AudioStreamIndex?: number; SubtitleStreamIndex?: number; PlayMethod?: string };
  TranscodingInfo?: { VideoCodec?: string; AudioCodec?: string; Width?: number; Height?: number; CompletionPercentage?: number; TranscodeReasons?: string[] } };

export function parseSession(s: unknown): NowPlaying | null {
  const r = s as Raw;
  if (!r?.Id || !r.NowPlayingItem) return null;
  const ps = r.PlayState ?? {};
  const t = r.TranscodingInfo;
  const idx = (n?: number) => (n === undefined || n === null || n < 0 ? null : n);
  return {
    sessionId: r.Id, item: r.NowPlayingItem,
    audioIndex: idx(ps.AudioStreamIndex), subtitleIndex: idx(ps.SubtitleStreamIndex), playMethod: ps.PlayMethod ?? null,
    transcode: t ? { videoCodec: t.VideoCodec, audioCodec: t.AudioCodec, width: t.Width, height: t.Height, completion: t.CompletionPercentage, reasons: t.TranscodeReasons } : null,
  };
}

export function pollSession(cb: (n: NowPlaying | null) => void, ms = 2000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      const deviceId = jfApiClient()?.deviceId?.();
      const list = await api<unknown[]>('/Sessions', { query: { deviceId } });
      if (!stopped) cb(parseSession(list?.[0]) ?? null);
    } catch { if (!stopped) cb(null); }
    if (!stopped) timer = setTimeout(tick, ms);
  };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
```

`commands.ts`:
```ts
import { api } from '../api/client';
import type { Bridge } from './bridge';

/** Verdicts from docs/notes/web-12.4-player.md (Task 2). false = go straight to the stock dialog. */
const HONOURED = { audio: true, subtitles: true, quality: true };

export type SettingKind = 'audio' | 'subtitles' | 'quality' | 'speed';
export const QUALITY_BITRATES = { Auto: 120e6, '4K': 120e6, '1080p': 20e6, '720p': 8e6, '480p': 3e6 } as const;
const HEIGHT: Record<string, number> = { '4K': 2160, '1080p': 1080, '720p': 720, '480p': 480 };

export function qualityChoices(sourceHeight: number): (keyof typeof QUALITY_BITRATES)[] {
  return (['Auto', '4K', '1080p', '720p', '480p'] as const).filter((q) => q === 'Auto' || HEIGHT[q]! <= sourceHeight);
}

const STOCK: Record<Exclude<SettingKind, 'speed'>, 'audio' | 'subtitles' | 'settings'> = { audio: 'audio', subtitles: 'subtitles', quality: 'settings' };

export async function applySetting(kind: SettingKind, value: string, ctx: { sessionId: string; bridge: Pick<Bridge, 'video' | 'openStock'>; confirm: () => boolean; timeoutMs?: number }): Promise<'command' | 'fallback'> {
  if (kind === 'speed') {
    const v = ctx.bridge.video();
    if (v) { v.playbackRate = Number(value); return 'command'; }
    ctx.bridge.openStock('settings');
    return 'fallback';
  }
  if (!HONOURED[kind]) { ctx.bridge.openStock(STOCK[kind]); return 'fallback'; }
  const cmd = kind === 'audio' ? { Name: 'SetAudioStreamIndex', Arguments: { Index: value } }
    : kind === 'subtitles' ? { Name: 'SetSubtitleStreamIndex', Arguments: { Index: value } }
      : { Name: 'SetMaxStreamingBitrate', Arguments: { MaxBitrate: String(QUALITY_BITRATES[value as keyof typeof QUALITY_BITRATES] ?? value) } };
  try { await api(`/Sessions/${ctx.sessionId}/Command`, { method: 'POST', body: cmd }); } catch { /* fall back below */ }
  const until = Date.now() + (ctx.timeoutMs ?? 1500);
  while (Date.now() < until) {
    if (ctx.confirm()) return 'command';
    await new Promise((r) => setTimeout(r, 150));
  }
  if (ctx.confirm()) return 'command';
  ctx.bridge.openStock(STOCK[kind]);
  return 'fallback';
}
```

For quality, the caller's `confirm()` checks that the session's transcode height is ≤ the requested height, or returns `true` immediately for `Auto`.

`segments.ts`:
```ts
import { api } from '../api/client';
import type { ClientConfig } from '../types';

export interface Segments { intro: [number, number] | null; credits: number | null }

export async function loadSegments(itemId: string, duration: number, cfg: Pick<ClientConfig, 'introSkipper' | 'creditsFallbackSeconds'>): Promise<Segments> {
  const fallback = duration > 0 ? Math.max(0, duration - (cfg.creditsFallbackSeconds ?? 35)) : null;
  if (!cfg.introSkipper) return { intro: null, credits: fallback };
  try {
    const r = await api<{ Items?: { Type: string; StartTicks: number; EndTicks: number }[] }>(`/MediaSegments/${itemId}`);
    const items = r?.Items ?? [];
    const s = (t: number) => Math.round(t / 1e7);
    const intro = items.find((x) => x.Type === 'Intro');
    const outro = items.find((x) => x.Type === 'Outro');
    return { intro: intro ? [s(intro.StartTicks), s(intro.EndTicks)] : null, credits: outro ? s(outro.StartTicks) : fallback };
  } catch {
    return { intro: null, credits: fallback };
  }
}
```

- [ ] **Step 4: Run.** `npx vitest run test/playerData.test.ts && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/player/session.ts web/src/player/commands.ts web/src/player/segments.ts web/test/playerData.test.ts
git commit -m "feat(player): session poller, track/quality commands with stock fallbacks, media segments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Card and episode-row options for player + episode page

**Files:**
- Modify: `web/src/ui/cards.ts` (`WideCardOpts`), `web/src/details/episodes.ts` (`renderEpisodes` options)
- Test: `web/test/cards.test.ts`, `web/test/detailsEpisodes.test.ts`

**Interfaces:**
- `export interface WideCardOpts { episode?: { tag: string | null; synopsis?: boolean } }`. The `synopsis` default is `true`; `false` omits `.tide-wide-syn`.
- `renderEpisodes(seriesId, sorted, startIdx, next, firstEps, opts?: { synopsis?: boolean; current?: { id: string; tag: string } })`
  - When `current` is set, that episode gets `opts.current.tag` (e.g. `NOW PLAYING` / `NOW VIEWING`) and is used as the row's start target, instead of the next-up rules.

- [ ] **Step 1: Failing tests.**

Append to `web/test/cards.test.ts`:
```ts
test('episode mode: synopsis can be turned off and tags are free text', () => {
  const ep2 = { Id: 'e9', Name: 'X', Type: 'Episode', SeriesId: 's', IndexNumber: 2, ParentIndexNumber: 1, RunTimeTicks: 6e9, Overview: 'Long text' };
  const c = wideCard(ep2, { episode: { tag: 'NOW PLAYING', synopsis: false } });
  expect(c.querySelector('.tide-wide-syn')).toBeNull();
  expect(c.querySelector('.tide-wide-tag')?.textContent).toBe('NOW PLAYING');
});
```

Append to `web/test/detailsEpisodes.test.ts`:
```ts
test('current option tags that episode and drops synopsis when asked', () => {
  const sorted = [season(1, 10)];
  const list = eps(1, 3);
  const r = renderEpisodes('ser', sorted, 0, null, list, { synopsis: false, current: { id: 's1e5', tag: 'NOW VIEWING' } });
  const cur = r.el.querySelector('[data-id="s1e5"]')!;
  expect(cur.querySelector('.tide-wide-tag')?.textContent).toBe('NOW VIEWING');
  expect(r.el.querySelectorAll('.tide-wide-tag').length).toBe(1);
  expect(r.el.querySelector('.tide-wide-syn')).toBeNull();
  r.dispose();
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.**

In `cards.ts`, change the interface to the one above. In `wideCard`, change the synopsis line to:
```ts
      epMode && item.Overview && opts.episode?.synopsis !== false ? h('span', { class: 'tide-wide-syn' }, item.Overview) : null),
```

In `episodes.ts`:
- Add the `opts` parameter.
- In `show()`, replace the `track.replaceChildren(...)` line and the `const i = rowStartIndex(...)` line with:
```ts
    const up = nextInSeason(eps, next);
    const tagFor = (e: JfItem) => opts?.current ? (e.Id === opts.current.id ? opts.current.tag : null) : episodeTag(e, next && next.Id === up?.Id ? next : null);
    track.replaceChildren(...eps.map((e) => wideCard(e, { episode: { tag: tagFor(e), synopsis: opts?.synopsis } })));
    scroller.sync();
    const ci = opts?.current ? eps.findIndex((e) => e.Id === opts.current!.id) : -1;
    const i = ci >= 0 ? Math.max(0, ci - 1) : rowStartIndex(eps, next);
```
Then delete the now-duplicated `const up = …` line above it.

- [ ] **Step 4: Run.** `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/ui/cards.ts web/src/details/episodes.ts web/test/cards.test.ts web/test/detailsEpisodes.test.ts
git commit -m "feat: card synopsis option and current-episode tagging for rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Controls (L1), idle, keyboard, scrubber, Skip intro

**Files:**
- Create: `web/src/player/controls.ts`, `web/src/player/player.css`
- Test: `web/test/playerControls.test.ts`

**Interfaces:**
```ts
export interface ControlsDeps { bridge: Bridge; onEpisodes(): void; onSettings(): void; onNext(): void; hasNext(): boolean; isSeries(): boolean }
export interface Controls {
  el: HTMLElement;                                   // .tide-pc (full-size layer)
  setItem(info: { logoId: string; title: string; line: string; trickplay?: { id: string; mediaSourceId: string; info: TrickplayInfo } | null; stillId: string }): void;
  setSegments(s: Segments): void;
  update(s: PlayerState): void;                      // text/attr updates only
  wake(): void;                                      // show controls, restart 3 s idle timer
  isIdle(): boolean;
  setPinned(on: boolean): void;                      // sheet open / paused: never auto-hide
  dispose(): void;
}
export function createControls(deps: ControlsDeps): Controls;
export const IDLE_MS = 3000;
```

**Behaviour:**
- **Idle state:** `.tide-player` gets class `tide-pc-idle` when idle. `document.documentElement` gets `tide-player-idle`, which hides the cursor.
- **Idle timer:** runs only while playing and not pinned.
- **Wake:** `wake()` is called from pointermove on the layer and from keydown.
- **Scrubber:**
  - pointerdown+move+up seeks via `bridge.seek` on release.
  - While dragging, it shows the drag position locally.
  - Hover shows `.tide-pc-tip` with time and thumbnail. The thumbnail uses `/Videos/{id}/Trickplay/{Width}/{image}.jpg?mediaSourceId=` positioned with `background-position: -x -y` when trickplay info exists, else `Items/{stillId}/Images/Primary`.
- **Segment marks:** `.tide-pc-seg` elements for the intro range and the credits start→end, placed by % of duration.
- **Skip intro:** `.tide-pc-skip` gets class `show` while `intro[0] ≤ position < intro[1]`. Click → `bridge.seek(intro[1])`.
- **Keyboard** (on `document`, only while mounted; ignored inside inputs):
  - Space / k → `togglePlay`
  - ArrowLeft / j → `seekBy(-10)`; ArrowRight / l → `seekBy(10)`
  - e → `onEpisodes`; s → `onSettings`; f → `fullscreen`; m → `toggleMute`; n → `onNext`
  - All of these call `preventDefault` + `stopPropagation`, so the stock handlers don't double-handle them.
  - Escape is handled by `player.ts`.

- [ ] **Step 1: Failing tests** `web/test/playerControls.test.ts`:

```ts
import { createControls, IDLE_MS } from '../src/player/controls';
import type { PlayerState } from '../src/player/bridge';

beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' }; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.documentElement.className = ''; });

function setup() {
  const bridge = { seek: vi.fn(), seekBy: vi.fn(), togglePlay: vi.fn(), fullscreen: vi.fn(), toggleMute: vi.fn(), setVolume: vi.fn(), read: () => st } as any;
  const deps = { bridge, onEpisodes: vi.fn(), onSettings: vi.fn(), onNext: vi.fn(), hasNext: () => true, isSeries: () => true };
  const c = createControls(deps);
  const host = document.createElement('div'); host.className = 'tide-player'; host.append(c.el); document.body.append(host);
  c.setItem({ logoId: 'ser', title: 'Silo', line: 'S3 · E1 · Who Are You?', stillId: 'e1' });
  return { c, deps, bridge, host };
}
let st: PlayerState = { percent: 0, position: 50, duration: 3000, paused: false, muted: false, volume: 80, buffered: 10, hasVideo: true };

test('renders L1 text and times; update changes text only (same nodes)', () => {
  const { c } = setup();
  expect(c.el.querySelector('.tide-pc-ep')?.textContent).toBe('S3 · E1 · Who Are You?');
  const cur = c.el.querySelector('.tide-pc-cur')!;
  c.update({ ...st, position: 60 });
  expect(cur.textContent).toBe('1:00');
  expect(c.el.querySelector('.tide-pc-cur')).toBe(cur);
  expect(c.el.querySelector('.tide-pc-rem')?.textContent).toBe('−49:00');
});

test('idle after 3 s while playing; wake shows; pinned never hides', () => {
  vi.useFakeTimers();
  const { c, host } = setup();
  c.update(st);
  c.wake();
  vi.advanceTimersByTime(IDLE_MS + 10);
  expect(c.isIdle()).toBe(true);
  expect(host.classList.contains('tide-pc-idle')).toBe(true);
  expect(document.documentElement.classList.contains('tide-player-idle')).toBe(true);
  c.wake();
  expect(c.isIdle()).toBe(false);
  c.setPinned(true);
  vi.advanceTimersByTime(IDLE_MS * 3);
  expect(c.isIdle()).toBe(false);
  c.setPinned(false);
  c.update({ ...st, paused: true });
  vi.advanceTimersByTime(IDLE_MS * 3);
  expect(c.isIdle()).toBe(false); // never hides while paused
});

test('skip intro shows inside the intro and seeks to its end', () => {
  const { c, bridge } = setup();
  c.setSegments({ intro: [45, 95], credits: 2960 });
  c.update({ ...st, position: 50 });
  const skip = c.el.querySelector<HTMLButtonElement>('.tide-pc-skip')!;
  expect(skip.classList.contains('show')).toBe(true);
  skip.querySelector('button')!.click();
  expect(bridge.seek).toHaveBeenCalledWith(95);
  c.update({ ...st, position: 120 });
  expect(skip.classList.contains('show')).toBe(false);
  expect(c.el.querySelectorAll('.tide-pc-seg').length).toBe(2);
});

test('keyboard map', () => {
  const { deps, bridge } = setup();
  const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key(' '); key('k'); key('ArrowLeft'); key('l'); key('e'); key('s'); key('f'); key('m'); key('n');
  expect(bridge.togglePlay).toHaveBeenCalledTimes(2);
  expect(bridge.seekBy).toHaveBeenNthCalledWith(1, -10);
  expect(bridge.seekBy).toHaveBeenNthCalledWith(2, 10);
  expect(deps.onEpisodes).toHaveBeenCalled();
  expect(deps.onSettings).toHaveBeenCalled();
  expect(bridge.fullscreen).toHaveBeenCalled();
  expect(bridge.toggleMute).toHaveBeenCalled();
  expect(deps.onNext).toHaveBeenCalled();
});

test('scrubber: drag previews locally and seeks once on release', () => {
  const { c, bridge } = setup();
  c.update(st);
  const track = c.el.querySelector<HTMLElement>('.tide-pc-track')!;
  track.getBoundingClientRect = () => ({ left: 100, width: 1000, top: 0, height: 6, right: 1100, bottom: 6 } as DOMRect);
  const ev = (t: string, x: number) => track.dispatchEvent(Object.assign(new Event(t, { bubbles: true }), { clientX: x, pointerId: 1, button: 0 }));
  ev('pointerdown', 600);
  ev('pointermove', 700);
  expect(c.el.querySelector('.tide-pc-cur')?.textContent).toBe('30:00');
  expect(bridge.seek).not.toHaveBeenCalled();
  document.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 700, pointerId: 1 }));
  expect(bridge.seek).toHaveBeenCalledWith(1800);
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** `web/src/player/controls.ts`:

```ts
import { imageUrl, getSession } from '../api/client';
import { h, icon } from '../ui/dom';
import { clock, trickplayFrame, type TrickplayInfo } from './format';
import type { Bridge, PlayerState } from './bridge';
import type { Segments } from './segments';

export const IDLE_MS = 3000;
export interface ControlsDeps { bridge: Bridge; onEpisodes(): void; onSettings(): void; onNext(): void; hasNext(): boolean; isSeries(): boolean }
export interface Controls {
  el: HTMLElement;
  setItem(info: { logoId: string; title: string; line: string; trickplay?: { id: string; mediaSourceId: string; info: TrickplayInfo } | null; stillId: string }): void;
  setSegments(s: Segments): void;
  update(s: PlayerState): void;
  wake(): void; isIdle(): boolean; setPinned(on: boolean): void; dispose(): void;
}

const btn = (cls: string, name: string, label: string, onClick: () => void) =>
  h('button', { class: `tide-pc-b ${cls}`, type: 'button', 'aria-label': label, onclick: (e: Event) => { e.stopPropagation(); onClick(); } }, icon(name));
const pill = (cls: string, name: string, text: string, onClick: () => void) =>
  h('button', { class: `tide-pc-p ${cls}`, type: 'button', onclick: (e: Event) => { e.stopPropagation(); onClick(); } }, icon(name), text);

export function createControls(deps: ControlsDeps): Controls {
  const { bridge } = deps;
  let state: PlayerState | null = null;
  let segs: Segments = { intro: null, credits: null };
  let trick: { id: string; mediaSourceId: string; info: TrickplayInfo } | null = null;
  let stillId = '';
  let idle = false;
  let pinned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let drag: number | null = null; // seconds while dragging

  const logo = h('img', { class: 'tide-pc-logo', alt: '' }) as HTMLImageElement;
  const titleText = h('span', { class: 'tide-pc-title' });
  const epLine = h('div', { class: 'tide-pc-ep' });
  const head = h('div', { class: 'tide-pc-hd tide-pc-ui' }, logo, titleText, epLine);

  const buf = h('div', { class: 'tide-pc-buf' });
  const fill = h('div', { class: 'tide-pc-fill' });
  const knob = h('div', { class: 'tide-pc-knob' });
  const segBox = h('div', { class: 'tide-pc-segs' });
  const track = h('div', { class: 'tide-pc-track' }, buf, segBox, fill, knob);
  const tipImg = h('i', { class: 'tide-pc-tipimg' });
  const tipTime = h('span', {});
  const tip = h('div', { class: 'tide-pc-tip' }, tipImg, tipTime);
  const scr = h('div', { class: 'tide-pc-scr' }, track, tip);
  const cur = h('span', { class: 'tide-pc-cur' }, '0:00');
  const rem = h('span', { class: 'tide-pc-rem' }, '−0:00');
  const play = btn('tide-pc-play', 'pause', 'Play/pause', () => bridge.togglePlay());
  const muteBtn = btn('tide-pc-mute', 'volume_up', 'Mute', () => bridge.toggleMute());
  const vol = h('input', { class: 'tide-pc-vol', type: 'range', min: '0', max: '100', 'aria-label': 'Volume', oninput: (e: Event) => bridge.setVolume(Number((e.target as HTMLInputElement).value)) }) as HTMLInputElement;
  vol.addEventListener('click', (e) => e.stopPropagation());
  const epBtn = pill('tide-pc-epbtn', 'video_library', 'Episodes', deps.onEpisodes);
  const nextBtn = pill('tide-pc-next', 'skip_next', 'Next episode', deps.onNext);
  const row = h('div', { class: 'tide-pc-row' },
    play, btn('tide-pc-rw', 'replay_10', 'Back 10 seconds', () => bridge.seekBy(-10)), btn('tide-pc-fw', 'forward_10', 'Forward 10 seconds', () => bridge.seekBy(10)),
    h('div', { class: 'tide-pc-volw' }, muteBtn, vol), h('span', { class: 'tide-pc-sp' }),
    epBtn, nextBtn,
    btn('tide-pc-subs', 'subtitles', 'Subtitles', deps.onSettings), btn('tide-pc-set', 'tune', 'Settings', deps.onSettings),
    btn('tide-pc-full', 'fullscreen', 'Full screen', () => bridge.fullscreen()));
  const bottom = h('div', { class: 'tide-pc-bt tide-pc-ui' }, scr, h('div', { class: 'tide-pc-times' }, cur, rem), row);
  const skip = h('div', { class: 'tide-pc-skip tide-pc-float' },
    h('button', { class: 'tide-pc-p tide-pc-w', type: 'button', onclick: (e: Event) => { e.stopPropagation(); if (segs.intro) bridge.seek(segs.intro[1]); } }, icon('fast_forward'), 'Skip intro'));
  const centre = h('div', { class: 'tide-pc-ctr tide-pc-ui' },
    btn('', 'replay_10', 'Back 10 seconds', () => bridge.seekBy(-10)), btn('tide-pc-big', 'pause', 'Play/pause', () => bridge.togglePlay()), btn('', 'forward_10', 'Forward 10 seconds', () => bridge.seekBy(10)));
  const el = h('div', { class: 'tide-pc' }, h('div', { class: 'tide-pc-shade tide-pc-ui' }), head, centre, skip, bottom);

  const host = () => el.parentElement;
  const setIdle = (on: boolean) => {
    idle = on;
    host()?.classList.toggle('tide-pc-idle', on);
    document.documentElement.classList.toggle('tide-player-idle', on);
  };
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (pinned || !state || state.paused) return;
    timer = setTimeout(() => setIdle(true), IDLE_MS);
  };
  const wake = () => { if (idle) setIdle(false); arm(); };

  const pctOf = (sec: number) => (state && state.duration > 0 ? Math.max(0, Math.min(100, (sec / state.duration) * 100)) : 0);
  const paintTime = (pos: number) => {
    if (!state) return;
    fill.style.transform = `scaleX(${pctOf(pos) / 100})`;
    knob.style.left = `${pctOf(pos)}%`;
    cur.textContent = clock(pos);
    rem.textContent = `−${clock(Math.max(0, state.duration - pos))}`;
  };
  const paintSegs = () => {
    segBox.replaceChildren();
    if (!state || state.duration <= 0) return;
    const add = (a: number, b: number) => { const s = h('i', { class: 'tide-pc-seg' }); s.style.left = `${pctOf(a)}%`; s.style.width = `${Math.max(0.4, pctOf(b) - pctOf(a))}%`; segBox.append(s); };
    if (segs.intro) add(segs.intro[0], segs.intro[1]);
    if (segs.credits !== null && segs.credits < state.duration) add(segs.credits, state.duration);
  };

  const at = (clientX: number) => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1))) * (state?.duration ?? 0);
  };
  const showTip = (sec: number, clientX: number) => {
    const r = track.getBoundingClientRect();
    tip.style.left = `${Math.max(0, Math.min(r.width, clientX - r.left))}px`;
    tipTime.textContent = clock(sec);
    const server = getSession()?.server ?? '';
    if (trick) {
      const f = trickplayFrame(sec, trick.info);
      tipImg.style.backgroundImage = `url("${server}/Videos/${trick.id}/Trickplay/${trick.info.Width}/${f.image}.jpg?mediaSourceId=${trick.mediaSourceId}")`;
      tipImg.style.backgroundPosition = `-${f.x}px -${f.y}px`;
      tipImg.style.backgroundSize = 'auto';
    } else {
      tipImg.style.backgroundImage = `url("${imageUrl(stillId, 'Primary', 320)}")`;
      tipImg.style.backgroundPosition = 'center';
      tipImg.style.backgroundSize = 'cover';
    }
  };
  track.addEventListener('pointermove', (e) => { if (drag === null) showTip(at(e.clientX), e.clientX); });
  const onMove = (e: PointerEvent) => { if (drag === null) return; drag = at(e.clientX); paintTime(drag); showTip(drag, e.clientX); };
  const onUp = (e: PointerEvent) => {
    if (drag === null) return;
    drag = at(e.clientX);
    bridge.seek(drag);
    drag = null;
    scr.classList.remove('drag');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
  track.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    drag = at(e.clientX);
    scr.classList.add('drag');
    paintTime(drag);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
  // The scrubber area must not toggle play.
  scr.addEventListener('click', (e) => e.stopPropagation());

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const map: Record<string, () => void> = {
      ' ': () => bridge.togglePlay(), k: () => bridge.togglePlay(),
      ArrowLeft: () => bridge.seekBy(-10), j: () => bridge.seekBy(-10),
      ArrowRight: () => bridge.seekBy(10), l: () => bridge.seekBy(10),
      e: deps.onEpisodes, s: deps.onSettings, f: () => bridge.fullscreen(), m: () => bridge.toggleMute(), n: deps.onNext,
    };
    const fn = map[k];
    wake();
    if (!fn) return;
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  document.addEventListener('keydown', onKey, true);
  el.addEventListener('pointermove', wake);

  return {
    el,
    setItem(info) {
      logo.hidden = false;
      logo.src = imageUrl(info.logoId, 'Logo', 600);
      logo.onerror = () => { logo.hidden = true; titleText.textContent = info.title; };
      titleText.textContent = '';
      epLine.textContent = info.line;
      trick = info.trickplay ?? null;
      stillId = info.stillId;
      epBtn.hidden = !deps.isSeries();
      nextBtn.hidden = !deps.hasNext();
    },
    setSegments(s) { segs = s; paintSegs(); },
    update(s) {
      const durChanged = !state || state.duration !== s.duration;
      const pausedChanged = !state || state.paused !== s.paused;
      state = s;
      if (durChanged) paintSegs();
      if (drag === null) paintTime(s.position);
      if (s.buffered !== null && s.duration > 0) buf.style.transform = `scaleX(${Math.min(1, (s.position + s.buffered) / s.duration)})`;
      const iconName = s.paused ? 'play_arrow' : 'pause';
      el.querySelectorAll('.tide-pc-play, .tide-pc-big').forEach((b) => b.replaceChildren(icon(iconName)));
      muteBtn.replaceChildren(icon(s.muted || s.volume === 0 ? 'volume_off' : 'volume_up'));
      if (document.activeElement !== vol) vol.value = String(s.volume);
      skip.classList.toggle('show', !!segs.intro && s.position >= segs.intro[0] && s.position < segs.intro[1]);
      nextBtn.hidden = !deps.hasNext();
      if (pausedChanged) { if (s.paused) wake(); else arm(); }
    },
    wake,
    isIdle: () => idle,
    setPinned(on) { pinned = on; if (on) wake(); else arm(); },
    dispose() {
      if (timer) clearTimeout(timer);
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.classList.remove('tide-player-idle');
    },
  };
}
```

Note: `update` replaces only the icon span inside the play buttons, never the buttons themselves, so their transitions survive.

Create `web/src/player/player.css`. The full player stylesheet lives here: controls in this task, and later tasks append their own blocks.

```css
/* ── Tide player (0.4.0) ───────────────────────────────────────────────────── */
:root { --tide-sp: cubic-bezier(.22, 1, .36, 1); }
#videoOsdPage.tide-taken :is(.videoOsdBottom, .skinHeader, .upNextContainer, .osdLockButton) { opacity: 0 !important; pointer-events: none !important; }
html.tide-player-idle, html.tide-player-idle * { cursor: none !important; }
body.tide .tide-player { position: fixed; inset: 0; z-index: 1000; color: #fff; font-family: var(--tide-font); --tide-lift: -132px; --tide-pb: 44px; --tide-pg: 48px; pointer-events: none; }
body.tide .tide-player > * { pointer-events: auto; }
body.tide .tide-pc { position: absolute; inset: 0; }
body.tide .tide-pc-ui { transition: opacity .45s var(--tide-sp), transform .6s var(--tide-sp); }
body.tide .tide-pc-idle .tide-pc-ui { opacity: 0; pointer-events: none; transition: opacity .35s ease, transform .45s ease; }
body.tide .tide-pc-idle .tide-pc-hd { transform: translateY(-16px); }
body.tide .tide-pc-idle .tide-pc-bt { transform: translateY(22px); }
body.tide .tide-pc-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(0,0,0,.65), transparent 26%), linear-gradient(0deg, rgba(0,0,0,.85), rgba(0,0,0,.3) 30%, transparent 55%); }
body.tide .tide-pc-hd { position: absolute; left: var(--tide-pg); top: 40px; }
body.tide .tide-pc-logo { display: block; height: 54px; max-width: 420px; object-fit: contain; object-position: left center; filter: drop-shadow(0 2px 12px rgba(0,0,0,.6)); }
body.tide .tide-pc-title { font-size: 34px; font-weight: 800; letter-spacing: -.03em; }
body.tide .tide-pc-ep { font-size: 17px; font-weight: 600; color: #e5e5ea; margin-top: 8px; }
body.tide .tide-pc-bt { position: absolute; left: var(--tide-pg); right: var(--tide-pg); bottom: 36px; }
body.tide .tide-pc-scr { position: relative; height: 22px; display: flex; align-items: center; cursor: pointer; }
body.tide .tide-pc-track { position: relative; flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,.25); transition: transform .2s var(--tide-sp); touch-action: none; }
body.tide .tide-pc-scr:hover .tide-pc-track, body.tide .tide-pc-scr.drag .tide-pc-track { transform: scaleY(1.34); }
body.tide :is(.tide-pc-buf, .tide-pc-fill) { position: absolute; inset: 0; border-radius: 3px; transform-origin: left center; transform: scaleX(0); }
body.tide .tide-pc-buf { background: rgba(255,255,255,.35); }
body.tide .tide-pc-fill { background: #fff; }
body.tide .tide-pc-segs { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
body.tide .tide-pc-seg { position: absolute; top: 0; bottom: 0; background: #ffd60a; border-radius: 3px; }
body.tide .tide-pc-knob { position: absolute; top: 50%; z-index: 3; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.6); transform: scale(0); transition: transform .2s var(--tide-sp); }
body.tide .tide-pc-scr:is(:hover, .drag) .tide-pc-knob { transform: scale(1); }
body.tide .tide-pc-tip { position: absolute; bottom: 30px; transform: translateX(-50%); background: #1c1c1e; border-radius: 10px; padding: 6px; text-align: center; font-size: 12px; font-weight: 700; opacity: 0; pointer-events: none; transition: opacity .2s; }
body.tide .tide-pc-tipimg { display: block; width: 160px; aspect-ratio: 16/9; border-radius: 6px; background: #000 no-repeat; margin-bottom: 5px; }
body.tide .tide-pc-scr:is(:hover, .drag) .tide-pc-tip { opacity: 1; }
body.tide .tide-pc-times { display: flex; justify-content: space-between; margin-top: 8px; font-size: 14px; font-weight: 600; color: #e5e5ea; font-variant-numeric: tabular-nums; }
body.tide .tide-pc-row { display: flex; align-items: center; gap: 14px; margin-top: 16px; }
body.tide .tide-pc-sp { flex: 1; }
body.tide .tide-pc-b { width: 52px; height: 52px; border-radius: 50%; border: 0; background: #2a2a2e; color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: 0 0 auto; transition: transform .2s var(--tide-sp), background-color .2s; }
body.tide .tide-pc-b .tide-ms { font-size: 26px; }
body.tide .tide-pc-b:hover { background: #3a3a3c; transform: scale(1.06); }
body.tide .tide-pc-b:active { transform: scale(.94); }
body.tide .tide-pc-play { background: #fff; color: #000; }
body.tide .tide-pc-play:hover { background: #e5e5ea; }
body.tide .tide-pc-p { height: 46px; border-radius: 23px; border: 0; background: #2a2a2e; color: #fff; display: inline-flex; align-items: center; gap: 8px; padding: 0 18px; font: 700 15px var(--tide-font); cursor: pointer; transition: background-color .2s; }
body.tide .tide-pc-p:hover { background: #3a3a3c; }
body.tide .tide-pc-p.on, body.tide .tide-pc-w { background: #fff; color: #000; }
body.tide .tide-pc-volw { display: flex; align-items: center; gap: 10px; }
body.tide .tide-pc-vol { width: 100px; accent-color: #fff; opacity: 0; transform: scaleX(.6); transform-origin: left center; transition: opacity .3s var(--tide-sp), transform .3s var(--tide-sp); }
body.tide .tide-pc-volw:hover .tide-pc-vol { opacity: 1; transform: none; }
/* Floating pills: stay when controls hide; lift above them when shown (transform only). */
body.tide .tide-pc-float { position: absolute; right: var(--tide-pg); bottom: var(--tide-pb); z-index: 5; opacity: 0; transform: translateY(14px) scale(.96); pointer-events: none; transition: opacity .45s var(--tide-sp), transform .7s var(--tide-sp); }
body.tide .tide-pc-float.show { opacity: 1; transform: none; pointer-events: auto; }
body.tide .tide-player:not(.tide-pc-idle):not(.tide-pz-on) .tide-pc-float.show { transform: translateY(var(--tide-lift)); }
body.tide .tide-pc-idle .tide-pc-float { transition: opacity .45s var(--tide-sp), transform .6s var(--tide-sp) .08s; }
body.tide .tide-pc-skip .tide-pc-p { height: 48px; padding: 0 22px; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
body.tide .tide-pc-ctr { display: none; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); gap: 56px; align-items: center; }
@media (prefers-reduced-motion: reduce) {
  body.tide :is(.tide-pc-ui, .tide-pc-float) { transition: opacity .3s ease !important; transform: none !important; }
}
```

Note: the `Subtitles` button opens S3 here as well. The spec's quick-toggle and long-press refinement is folded into S3 to keep one code path; the plan treats this as YAGNI. The scrubber transform uses `scaleY` instead of a height change (transform-only rule).

- [ ] **Step 4: Run.** `npx vitest run test/playerControls.test.ts && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/player/controls.ts web/src/player/player.css web/test/playerControls.test.ts
git commit -m "feat(player): L1 controls with scrubber, idle, keyboard and skip intro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Episodes shelf (E2) and settings sheet (S3)

**Files:**
- Create: `web/src/player/shelf.ts`, `web/src/player/settingsSheet.ts`; append CSS to `player.css`
- Test: `web/test/playerSheets.test.ts`

**Interfaces:**
```ts
// shelf.ts
export interface Shelf { el: HTMLElement; open(): void; close(): void; isOpen(): boolean; setEpisode(seriesId: string, currentId: string): Promise<void>; dispose(): void }
export function createShelf(onOpenChange: (open: boolean) => void): Shelf;
// settingsSheet.ts
export interface SheetData { audio: { index: number; label: string; sub: string }[]; subtitles: { index: number; label: string; sub: string }[]; audioIndex: number | null; subtitleIndex: number | null; quality: string[]; qualityCur: string; speed: number; subSize: 'S' | 'M' | 'L' | 'XL' }
export interface SettingsSheet { el: HTMLElement; open(): void; close(): void; isOpen(): boolean; setData(d: SheetData): void; dispose(): void }
export function createSettingsSheet(onPick: (kind: 'audio' | 'subtitles' | 'quality' | 'speed' | 'subSize', value: string) => void, onOpenChange: (open: boolean) => void): SettingsSheet;
export function streamsToSheet(item: JfDetail): Pick<SheetData, 'audio' | 'subtitles'>;
```

**Shelf (`setEpisode`):**
1. Fetches seasons: `getSeasons(seriesId)` → `sortSeasons`.
2. Finds the current episode's season: `getItem(currentId)` → `ParentIndexNumber`.
3. Fetches `getEpisodes(seriesId, seasonId)`.
4. Calls `renderEpisodes(seriesId, sorted, idx, null, eps, { synopsis: false, current: { id: currentId, tag: 'NOW PLAYING' } })`.

Clicking a card plays the episode, because `wideCard` episode mode already calls `play(id)`. That starts a new stream; the player follows via the session poll.

**Settings sheet:**
- Three columns: Audio list, Subtitles list (`Off` first, index −1), and a right column with chips for Quality, Speed (`0.5 0.75 1 1.25 1.5 2`) and Subtitle size (`S M L XL`).
- `setData` updates the content.
- Clicking an option calls `onPick` and marks it as current (`.on`).
- The sheet stays open after a pick.

- [ ] **Step 1: Failing tests** `web/test/playerSheets.test.ts`:

```ts
import { createSettingsSheet, streamsToSheet } from '../src/player/settingsSheet';
import { createShelf } from '../src/player/shelf';

beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' }; });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

test('streamsToSheet lists audio and subtitles with labels', () => {
  const d = streamsToSheet({ Id: 'e', Name: 'E', Type: 'Episode', MediaSources: [{ Id: 'm', MediaStreams: [
    { Type: 'Video', Codec: 'hevc' }, { Type: 'Audio', Index: 1, DisplayTitle: 'English - Dolby Digital+ - 5.1 - Default', Language: 'eng' } as any,
    { Type: 'Audio', Index: 2, DisplayTitle: 'Dutch - AAC - Stereo', Language: 'dut' } as any,
    { Type: 'Subtitle', Index: 3, DisplayTitle: 'English - SDH', Language: 'eng' } as any] }] });
  expect(d.audio).toEqual([{ index: 1, label: 'English', sub: 'Dolby Digital+ · 5.1' }, { index: 2, label: 'Dutch', sub: 'AAC · Stereo' }]);
  expect(d.subtitles).toEqual([{ index: 3, label: 'English', sub: 'SDH' }]);
});

test('sheet: three columns, picks call back and mark current, stays open', () => {
  const picks: string[] = [];
  const s = createSettingsSheet((k, v) => picks.push(`${k}=${v}`), () => {});
  document.body.append(s.el);
  s.setData({ audio: [{ index: 1, label: 'English', sub: '5.1' }, { index: 2, label: 'Dutch', sub: 'Stereo' }], subtitles: [{ index: 3, label: 'English', sub: '' }],
    audioIndex: 1, subtitleIndex: null, quality: ['Auto', '1080p'], qualityCur: 'Auto', speed: 1, subSize: 'M' });
  s.open();
  expect(s.isOpen()).toBe(true);
  const audio = [...s.el.querySelectorAll<HTMLElement>('[data-kind="audio"]')];
  expect(audio.map((a) => a.classList.contains('on'))).toEqual([true, false]);
  audio[1]!.click();
  expect(picks).toEqual(['audio=2']);
  expect(audio[1]!.classList.contains('on')).toBe(true);
  s.el.querySelector<HTMLElement>('[data-kind="subtitles"][data-value="-1"]')!.click();
  s.el.querySelector<HTMLElement>('[data-kind="speed"][data-value="1.5"]')!.click();
  s.el.querySelector<HTMLElement>('[data-kind="quality"][data-value="1080p"]')!.click();
  expect(picks).toEqual(['audio=2', 'subtitles=-1', 'speed=1.5', 'quality=1080p']);
  expect(s.isOpen()).toBe(true);
  s.close();
  expect(s.isOpen()).toBe(false);
});

test('shelf opens the current season with NOW PLAYING and no synopsis', async () => {
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
  expect(sh.isOpen()).toBe(true);
  expect(sh.el.querySelector('[data-id="b"] .tide-wide-tag')?.textContent).toBe('NOW PLAYING');
  expect(sh.el.querySelector('.tide-wide-syn')).toBeNull();
  sh.close();
  expect(changes).toEqual([true, false]);
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.**

`shelf.ts`:
```ts
import { getEpisodes, getItem, getSeasons } from '../api/item';
import { renderEpisodes } from '../details/episodes';
import { sortSeasons } from '../details/logic';
import { h } from '../ui/dom';

export interface Shelf { el: HTMLElement; open(): void; close(): void; isOpen(): boolean; setEpisode(seriesId: string, currentId: string): Promise<void>; dispose(): void }

export function createShelf(onOpenChange: (open: boolean) => void): Shelf {
  const el = h('div', { class: 'tide-pshelf', 'aria-hidden': 'true' });
  let open = false;
  let disposeRow: (() => void) | null = null;
  let key = '';
  return {
    el,
    open() { if (open) return; open = true; el.classList.add('open'); el.removeAttribute('aria-hidden'); onOpenChange(true); },
    close() { if (!open) return; open = false; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); onOpenChange(false); },
    isOpen: () => open,
    async setEpisode(seriesId, currentId) {
      if (key === `${seriesId}/${currentId}`) return;
      key = `${seriesId}/${currentId}`;
      const [seasons, cur] = await Promise.all([getSeasons(seriesId), getItem(currentId)]);
      const sorted = sortSeasons(seasons);
      const idx = Math.max(0, sorted.findIndex((s) => s.IndexNumber === cur.ParentIndexNumber));
      if (!sorted[idx]) return;
      const eps = await getEpisodes(seriesId, sorted[idx]!.Id);
      disposeRow?.();
      const row = renderEpisodes(seriesId, sorted, idx, null, eps, { synopsis: false, current: { id: currentId, tag: 'NOW PLAYING' } });
      disposeRow = row.dispose;
      el.replaceChildren(row.el);
    },
    dispose() { disposeRow?.(); },
  };
}
```

`settingsSheet.ts`:
```ts
import { h, icon } from '../ui/dom';
import type { JfDetail } from '../api/item';

export interface SheetData { audio: { index: number; label: string; sub: string }[]; subtitles: { index: number; label: string; sub: string }[]; audioIndex: number | null; subtitleIndex: number | null; quality: string[]; qualityCur: string; speed: number; subSize: 'S' | 'M' | 'L' | 'XL' }
export interface SettingsSheet { el: HTMLElement; open(): void; close(): void; isOpen(): boolean; setData(d: SheetData): void; dispose(): void }
type Kind = 'audio' | 'subtitles' | 'quality' | 'speed' | 'subSize';

/** "English - Dolby Digital+ - 5.1 - Default" -> label "English", sub "Dolby Digital+ · 5.1". */
function split(t = ''): { label: string; sub: string } {
  const parts = t.split(' - ').filter((p) => p && p !== 'Default' && p !== 'External');
  return { label: parts[0] ?? '', sub: parts.slice(1).join(' · ') };
}

export function streamsToSheet(item: JfDetail): Pick<SheetData, 'audio' | 'subtitles'> {
  const streams = (item.MediaSources?.[0]?.MediaStreams ?? []) as (NonNullable<JfDetail['MediaSources']>[0]['MediaStreams'][0] & { Index?: number })[];
  const pick = (type: string) => streams.filter((s) => s.Type === type).map((s) => ({ index: s.Index ?? -1, ...split(s.DisplayTitle) }));
  return { audio: pick('Audio'), subtitles: pick('Subtitle') };
}

export function createSettingsSheet(onPick: (kind: Kind, value: string) => void, onOpenChange: (open: boolean) => void): SettingsSheet {
  const el = h('div', { class: 'tide-pset', role: 'dialog', 'aria-label': 'Playback settings', 'aria-hidden': 'true' });
  let open = false;
  const opt = (kind: Kind, value: string, label: string, sub: string, on: boolean) =>
    h('button', { class: `tide-pset-opt${on ? ' on' : ''}`, type: 'button', 'data-kind': kind, 'data-value': value }, h('span', {}, label, sub ? h('small', {}, sub) : null), icon('check', 'tide-pset-ck'));
  const chip = (kind: Kind, value: string, label: string, on: boolean) =>
    h('button', { class: `tide-pset-chip${on ? ' on' : ''}`, type: 'button', 'data-kind': kind, 'data-value': value }, label);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]');
    if (!t) return;
    const kind = t.dataset.kind as Kind;
    el.querySelectorAll(`[data-kind="${kind}"]`).forEach((x) => x.classList.toggle('on', x === t));
    onPick(kind, t.dataset.value!);
  });
  return {
    el,
    open() { if (open) return; open = true; el.classList.add('open'); el.removeAttribute('aria-hidden'); onOpenChange(true); },
    close() { if (!open) return; open = false; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); onOpenChange(false); },
    isOpen: () => open,
    setData(d) {
      el.replaceChildren(
        h('div', { class: 'tide-pset-col' }, h('h5', {}, 'AUDIO'), ...d.audio.map((a) => opt('audio', String(a.index), a.label, a.sub, a.index === d.audioIndex))),
        h('div', { class: 'tide-pset-col' }, h('h5', {}, 'SUBTITLES'), opt('subtitles', '-1', 'Off', '', d.subtitleIndex === null),
          ...d.subtitles.map((s) => opt('subtitles', String(s.index), s.label, s.sub, s.index === d.subtitleIndex))),
        h('div', { class: 'tide-pset-col' },
          h('h5', {}, 'QUALITY'), h('div', { class: 'tide-pset-chips' }, ...d.quality.map((q) => chip('quality', q, q, q === d.qualityCur))),
          h('h5', {}, 'SPEED'), h('div', { class: 'tide-pset-chips' }, ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((x) => chip('speed', String(x), `${x}×`, x === d.speed))),
          h('h5', {}, 'SUBTITLE SIZE'), h('div', { class: 'tide-pset-chips' }, ...(['S', 'M', 'L', 'XL'] as const).map((x) => chip('subSize', x, x, x === d.subSize)))));
    },
    dispose() { /* nothing */ },
  };
}
```

Append to `player.css`:
```css
/* E2 shelf */
body.tide .tide-pshelf { position: absolute; left: 0; right: 0; bottom: 150px; z-index: 9; opacity: 0; transform: translateY(24px); pointer-events: none; transition: opacity .45s var(--tide-sp), transform .6s var(--tide-sp); }
body.tide .tide-pshelf.open { opacity: 1; transform: none; pointer-events: auto; }
body.tide .tide-pshelf .tide-dsec { margin: 0; }
body.tide .tide-pshelf .tide-row-track > * { flex-basis: 330px; }
body.tide .tide-player.tide-ps-open .tide-pc-shade { background: linear-gradient(0deg, rgba(0,0,0,.95), rgba(0,0,0,.6) 55%, rgba(0,0,0,.1) 85%); }
body.tide .tide-player.tide-ps-open .tide-pc-skip { opacity: 0 !important; pointer-events: none !important; }
/* S3 settings sheet */
body.tide .tide-pset { position: absolute; left: var(--tide-pg); right: var(--tide-pg); bottom: 118px; z-index: 21; display: grid; grid-template-columns: 1fr 1fr 1.1fr; gap: 10px; padding: 18px; background: #141416; border-radius: 24px; box-shadow: 0 30px 60px rgba(0,0,0,.8); opacity: 0; transform: translateY(16px); pointer-events: none; transition: opacity .3s var(--tide-sp), transform .5s var(--tide-sp); }
body.tide .tide-pset.open { opacity: 1; transform: none; pointer-events: auto; }
body.tide .tide-pset-col { min-width: 0; display: flex; flex-direction: column; }
body.tide .tide-pset-col + .tide-pset-col { border-left: 1px solid #222; padding-left: 10px; }
body.tide .tide-pset h5 { margin: 10px 14px 6px; font-size: 12px; font-weight: 800; letter-spacing: .1em; color: #8e8e93; }
body.tide .tide-pset-opt { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border: 0; border-radius: 12px; background: none; color: #fff; font: 600 14px var(--tide-font); text-align: left; cursor: pointer; }
body.tide .tide-pset-opt:hover { background: #2a2a2e; }
body.tide .tide-pset-opt small { display: block; color: #8e8e93; font-weight: 500; font-size: 12px; margin-top: 2px; }
body.tide .tide-pset-ck { margin-left: auto; font-size: 20px; opacity: 0; }
body.tide .tide-pset-opt.on .tide-pset-ck { opacity: 1; }
body.tide .tide-pset-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 14px 10px; }
body.tide .tide-pset-chip { padding: 8px 14px; border: 0; border-radius: 12px; background: #2a2a2e; color: #fff; font: 700 13px var(--tide-font); cursor: pointer; }
body.tide .tide-pset-chip:hover { background: #3a3a3c; }
body.tide .tide-pset-chip.on { background: #fff; color: #000; }
body.tide .tide-player.tide-pset-open::before { content: ""; position: absolute; inset: 0; background: rgba(0,0,0,.45); pointer-events: none; }
/* Subtitle size (rendered subtitles) */
html[data-tide-subsize="S"] .videoSubtitles { font-size: 80% !important; } html[data-tide-subsize="L"] .videoSubtitles { font-size: 125% !important; } html[data-tide-subsize="XL"] .videoSubtitles { font-size: 150% !important; }
html[data-tide-subsize="S"] video::cue { font-size: 80%; } html[data-tide-subsize="L"] video::cue { font-size: 125%; } html[data-tide-subsize="XL"] video::cue { font-size: 150%; }
```

Two simplifications from the spec, recorded here so they don't get re-litigated:
- The "dim the video" effect uses a 45% black overlay (`::before`) rather than a filter on the stock video (which Tide does not own).
- Subtitle size is a Tide CSS scale on rendered subtitles. It does not write Jellyfin's appearance setting.

- [ ] **Step 4: Run.** `npx vitest run test/playerSheets.test.ts && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/player/shelf.ts web/src/player/settingsSheet.ts web/src/player/player.css web/test/playerSheets.test.ts
git commit -m "feat(player): episodes shelf (E2) and settings sheet (S3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Paused screen (Z4) and countdown card (N2)

**Files:**
- Create: `web/src/player/paused.ts`, `web/src/player/endCard.ts`; append CSS
- Test: `web/test/playerOverlays.test.ts`

**Interfaces:**
```ts
// paused.ts
export const PAUSE_MS = 4000;
export interface PausedScreen { el: HTMLElement; setItem(d: { posterId: string; logoId: string; line: string; meta: string; overview: string; next: { id: string; label: string; runtime: string } | null }, onNext: () => void): void; arm(paused: boolean, blocked: boolean): void; dismiss(): void; isOn(): boolean; dispose(): void }
export function createPausedScreen(host: HTMLElement): PausedScreen;   // host gets class tide-pz-on while showing
// endCard.ts
export const COUNTDOWN_S = 10;
export interface EndCard { el: HTMLElement; setNext(n: { id: string; title: string; runtime: string; stillId: string } | null, autoplay: boolean): void; update(position: number, creditsAt: number | null, playing: boolean, dt: number): void; isShowing(): boolean; dispose(): void }
export function createEndCard(onPlayNext: () => void): EndCard;
```

**Paused screen:**
- `arm(paused, blocked)`:
  - Starts a 4 s timer when `paused && !blocked`.
  - When it fires, the screen shows: `host.classList.add('tide-pz-on')`.
  - `arm(false, …)` or `dismiss()` hides it and clears the timer.
- `pointermove` over `[data-pz-next]` must not dismiss it. `player.ts` handles this by checking `e.target.closest('[data-pz-next]')` before calling `dismiss()`.
- The Up next element carries `data-pz-next` and is hidden by CSS when the host has `tide-end-on`.

**End card:**
- `update(position, creditsAt, playing, dt)`:
  - It shows when `creditsAt !== null && position >= creditsAt && next && !dismissed`.
  - While showing and `playing && autoplay`, `left -= dt`. At ≤ 0 it calls `onPlayNext()` once.
  - The card's DOM is built **once** in `setNext`. Afterwards only the text (`Next episode in Ns`) and the ring `stroke-dasharray` change.
  - Without autoplay the kicker reads `Up next` and the ring is hidden.
- `Watch credits` sets `dismissed`.
- `setNext` resets `dismissed` and `left`.

- [ ] **Step 1: Failing tests** `web/test/playerOverlays.test.ts`:

```ts
import { createEndCard, COUNTDOWN_S } from '../src/player/endCard';
import { createPausedScreen, PAUSE_MS } from '../src/player/paused';

beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' }; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

test('paused screen appears after 4 s paused, not when blocked, and dismisses', () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  const pz = createPausedScreen(host);
  host.append(pz.el);
  const onNext = vi.fn();
  pz.setItem({ posterId: 'ser', logoId: 'ser', line: 'S3 · E1 · Who Are You?', meta: '2026 · 51m · 38m left', overview: 'x', next: { id: 'e2', label: '2. It’s All Good', runtime: '51m' } }, onNext);
  pz.arm(true, false);
  vi.advanceTimersByTime(PAUSE_MS - 10);
  expect(pz.isOn()).toBe(false);
  vi.advanceTimersByTime(20);
  expect(pz.isOn()).toBe(true);
  expect(host.classList.contains('tide-pz-on')).toBe(true);
  expect(pz.el.querySelector('.tide-pz-line')?.textContent).toBe('S3 · E1 · Who Are You?');
  pz.el.querySelector<HTMLElement>('[data-pz-next]')!.click();
  expect(onNext).toHaveBeenCalled();
  pz.dismiss();
  expect(pz.isOn()).toBe(false);
  pz.arm(true, true);
  vi.advanceTimersByTime(PAUSE_MS * 2);
  expect(pz.isOn()).toBe(false);
});

test('end card: shows at credits, counts down only while playing with autoplay, plays next once', () => {
  const next = vi.fn();
  const c = createEndCard(next);
  document.body.append(c.el);
  c.setNext({ id: 'e2', title: '2. It’s All Good', runtime: '51m', stillId: 'e2' }, true);
  const card = c.el.querySelector('.tide-end-card')!;
  c.update(100, 2900, true, 0.1);
  expect(c.isShowing()).toBe(false);
  c.update(2900, 2900, true, 0.1);
  expect(c.isShowing()).toBe(true);
  expect(c.el.querySelector('.tide-end-cd')?.textContent).toBe('Next episode in 10s');
  c.update(2901, 2900, false, 5); // paused: no countdown
  expect(c.el.querySelector('.tide-end-cd')?.textContent).toBe('Next episode in 10s');
  for (let i = 0; i < 12; i++) c.update(2902 + i, 2900, true, 1);
  expect(next).toHaveBeenCalledTimes(1);
  expect(c.el.querySelector('.tide-end-card')).toBe(card); // built once
});

test('end card: Watch credits dismisses; no autoplay = no countdown', () => {
  const next = vi.fn();
  const c = createEndCard(next);
  c.setNext({ id: 'e2', title: 'T', runtime: '1m', stillId: 'e2' }, false);
  c.update(10, 5, true, 20);
  expect(c.isShowing()).toBe(true);
  expect(c.el.querySelector('.tide-end-cd')?.textContent).toBe('Up next');
  expect(next).not.toHaveBeenCalled();
  c.el.querySelector<HTMLElement>('.tide-end-wc')!.click();
  c.update(11, 5, true, 1);
  expect(c.isShowing()).toBe(false);
  expect(COUNTDOWN_S).toBe(10);
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.**

`paused.ts`:
```ts
import { imageUrl } from '../api/client';
import { h, icon } from '../ui/dom';

export const PAUSE_MS = 4000;
export interface PausedScreen {
  el: HTMLElement;
  setItem(d: { posterId: string; logoId: string; line: string; meta: string; overview: string; next: { id: string; label: string; runtime: string } | null }, onNext: () => void): void;
  arm(paused: boolean, blocked: boolean): void; dismiss(): void; isOn(): boolean; dispose(): void;
}

export function createPausedScreen(host: HTMLElement): PausedScreen {
  const el = h('div', { class: 'tide-pz', 'aria-hidden': 'true' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let on = false;
  const set = (v: boolean) => { on = v; host.classList.toggle('tide-pz-on', v); el.toggleAttribute('aria-hidden', !v); };
  const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
  return {
    el,
    setItem(d, onNext) {
      const poster = h('div', { class: 'tide-pz-poster' });
      poster.style.backgroundImage = `url("${imageUrl(d.posterId, 'Primary', 420)}")`;
      const logo = h('img', { class: 'tide-pz-logo', src: imageUrl(d.logoId, 'Logo', 600), alt: '' }) as HTMLImageElement;
      logo.onerror = () => logo.remove();
      const nx = d.next ? h('button', { class: 'tide-pz-next', type: 'button', 'data-pz-next': '', onclick: (e: Event) => { e.stopPropagation(); onNext(); } },
        Object.assign(h('i', { class: 'tide-pz-th' }), { style: `background-image:url("${imageUrl(d.next.id, 'Primary', 300)}")` }),
        h('span', {}, h('small', {}, 'UP NEXT'), h('b', {}, d.next.label), h('em', {}, d.next.runtime))) : null;
      el.replaceChildren(
        h('div', { class: 'tide-pz-block' }, poster,
          h('div', { class: 'tide-pz-text' }, h('span', { class: 'tide-pz-kick' }, 'YOU’RE WATCHING'), logo,
            h('div', { class: 'tide-pz-line' }, d.line), h('div', { class: 'tide-pz-meta' }, d.meta), h('p', { class: 'tide-pz-syn' }, d.overview))),
        h('div', { class: 'tide-pz-paused' }, icon('pause_circle'), 'Paused'),
        nx);
    },
    arm(paused, blocked) {
      clear();
      if (!paused) { set(false); return; }
      if (blocked || on) return;
      timer = setTimeout(() => { timer = undefined; set(true); }, PAUSE_MS);
    },
    dismiss() { clear(); set(false); },
    isOn: () => on,
    dispose() { clear(); host.classList.remove('tide-pz-on'); },
  };
}
```

`endCard.ts`:
```ts
import { imageUrl } from '../api/client';
import { h, icon } from '../ui/dom';

export const COUNTDOWN_S = 10;
export interface EndCard {
  el: HTMLElement;
  setNext(n: { id: string; title: string; runtime: string; stillId: string } | null, autoplay: boolean): void;
  update(position: number, creditsAt: number | null, playing: boolean, dt: number): void;
  isShowing(): boolean; dispose(): void;
}
const NS = 'http://www.w3.org/2000/svg';
const C = 2 * Math.PI * 20;

export function createEndCard(onPlayNext: () => void): EndCard {
  const el = h('div', { class: 'tide-end tide-pc-float' });
  let next: { id: string } | null = null;
  let autoplay = true;
  let left = COUNTDOWN_S;
  let dismissed = false;
  let fired = false;
  let showing = false;
  let cd: HTMLElement | null = null;
  let arc: SVGCircleElement | null = null;
  const go = () => { if (fired) return; fired = true; onPlayNext(); };
  return {
    el,
    setNext(n, auto) {
      next = n; autoplay = auto; left = COUNTDOWN_S; dismissed = false; fired = false;
      el.replaceChildren();
      cd = null; arc = null;
      if (!n) return;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 48 48');
      for (const cls of ['tide-end-tr', 'tide-end-ar']) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', '24'); c.setAttribute('cy', '24'); c.setAttribute('r', '20'); c.setAttribute('class', cls);
        svg.append(c);
        if (cls === 'tide-end-ar') arc = c;
      }
      const th = h('button', { class: 'tide-end-th', type: 'button', 'aria-label': `Play ${n.title}`, onclick: (e: Event) => { e.stopPropagation(); go(); } },
        h('span', { class: `tide-end-ring${auto ? '' : ' noring'}` }, svg as unknown as Node, icon('play_arrow')));
      th.style.backgroundImage = `url("${imageUrl(n.stillId, 'Primary', 400)}")`;
      cd = h('small', { class: 'tide-end-cd' });
      el.append(h('div', { class: 'tide-end-card' }, th,
        h('div', { class: 'tide-end-tx' }, cd, h('b', {}, n.title), h('small', {}, n.runtime),
          h('button', { class: 'tide-end-wc', type: 'button', onclick: (e: Event) => { e.stopPropagation(); dismissed = true; el.classList.remove('show'); showing = false; } }, 'Watch credits'))));
    },
    update(position, creditsAt, playing, dt) {
      const want = !!next && !dismissed && creditsAt !== null && position >= creditsAt;
      if (want !== showing) { showing = want; el.classList.toggle('show', want); document.querySelector('.tide-player')?.classList.toggle('tide-end-on', want); }
      if (!want || !cd) return;
      if (playing && autoplay) left = Math.max(0, left - dt);
      cd.textContent = autoplay ? `Next episode in ${Math.ceil(left)}s` : 'Up next';
      arc?.setAttribute('stroke-dasharray', `${C * (1 - left / COUNTDOWN_S)} ${C}`);
      if (autoplay && left <= 0) go();
    },
    isShowing: () => showing,
    dispose() { document.querySelector('.tide-player')?.classList.remove('tide-end-on'); },
  };
}
```

Append to `player.css`:
```css
/* Z4 paused screen */
body.tide .tide-pz { position: absolute; inset: 0; z-index: 7; opacity: 0; transition: opacity .8s var(--tide-sp); background: linear-gradient(90deg, rgba(0,0,0,.8), rgba(0,0,0,.4) 45%, transparent 70%), rgba(0,0,0,.45); }
body.tide .tide-pz, body.tide .tide-pz * { pointer-events: none !important; }
body.tide .tide-player.tide-pz-on .tide-pz { opacity: 1; }
body.tide .tide-player.tide-pz-on .tide-pz [data-pz-next] { pointer-events: auto !important; }
body.tide .tide-player.tide-pz-on .tide-pc-ui { opacity: 0 !important; pointer-events: none !important; }
body.tide .tide-pz-block { position: absolute; left: 112px; top: 50%; display: flex; gap: 36px; align-items: center; transform: translateY(-46%); transition: transform 1s var(--tide-sp); }
body.tide .tide-player.tide-pz-on .tide-pz-block { transform: translateY(-50%); }
body.tide .tide-pz-poster { flex: 0 0 210px; aspect-ratio: 2/3; border-radius: 18px; background: center / cover #1d1d20; box-shadow: 0 30px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.06); }
body.tide .tide-pz-text { width: 540px; display: flex; flex-direction: column; gap: 14px; }
body.tide .tide-pz-kick { font-size: 13px; font-weight: 800; letter-spacing: .14em; color: #a1a1a6; }
body.tide .tide-pz-logo { height: 64px; width: auto; align-self: flex-start; filter: drop-shadow(0 2px 12px rgba(0,0,0,.6)); }
body.tide .tide-pz-line { font-size: 22px; font-weight: 700; }
body.tide .tide-pz-meta { font-size: 15px; color: #d1d1d6; font-weight: 500; }
body.tide .tide-pz-syn { margin: 0; font-size: 17px; line-height: 1.55; color: #e5e5ea; }
body.tide .tide-pz-paused { position: absolute; right: var(--tide-pg); top: 40px; display: flex; gap: 8px; align-items: center; font-size: 15px; font-weight: 600; color: #a1a1a6; }
body.tide .tide-pz-paused .tide-ms { font-size: 28px; }
body.tide .tide-pz-next { position: absolute; right: var(--tide-pg); bottom: var(--tide-pb); width: 330px; display: flex; gap: 12px; align-items: center; padding: 12px; border: 0; border-radius: 20px; background: #141416; color: #fff; text-align: left; font: inherit; cursor: pointer; opacity: 0; transform: translateY(12px); transition: opacity .8s var(--tide-sp) .3s, transform .8s var(--tide-sp) .3s, background-color .2s; }
body.tide .tide-player.tide-pz-on .tide-pz-next { opacity: 1; transform: none; }
body.tide .tide-pz-next:hover { background: #1d1d20; }
body.tide .tide-player.tide-end-on .tide-pz-next { display: none; }
body.tide .tide-pz-th { flex: 0 0 120px; aspect-ratio: 16/9; border-radius: 10px; background: center / cover #2a2a2e; }
body.tide .tide-pz-next small { display: block; font-size: 11px; font-weight: 800; letter-spacing: .14em; color: #a1a1a6; }
body.tide .tide-pz-next b { display: block; font-size: 15px; margin-top: 3px; }
body.tide .tide-pz-next em { font-style: normal; font-size: 12px; color: #a1a1a6; }
/* N2 countdown card */
body.tide .tide-end-card { width: 380px; display: flex; gap: 14px; align-items: center; padding: 14px; background: #141416; border-radius: 22px; box-shadow: 0 30px 60px rgba(0,0,0,.7); }
body.tide .tide-end-th { flex: 0 0 140px; aspect-ratio: 16/9; border: 0; border-radius: 12px; background: center / cover #2a2a2e; display: flex; align-items: center; justify-content: center; cursor: pointer; }
body.tide .tide-end-ring { position: relative; width: 48px; height: 48px; border-radius: 50%; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; color: #fff; }
body.tide .tide-end-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
body.tide .tide-end-ring circle { fill: none; stroke-width: 3; }
body.tide .tide-end-tr { stroke: rgba(255,255,255,.25); }
body.tide .tide-end-ar { stroke: #fff; stroke-linecap: round; }
body.tide .tide-end-ring.noring svg { display: none; }
body.tide .tide-end-tx { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
body.tide .tide-end-tx small { color: #a1a1a6; font-size: 12px; }
body.tide .tide-end-tx b { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
body.tide .tide-end-wc { margin-top: 6px; padding: 0; border: 0; background: none; color: #a1a1a6; font: 600 12px var(--tide-font); cursor: pointer; text-align: left; }
body.tide .tide-end-wc:hover { color: #fff; }
body.tide .tide-player.tide-end-on .tide-pc-skip { opacity: 0 !important; pointer-events: none !important; }
```

- [ ] **Step 4: Run.** `npx vitest run test/playerOverlays.test.ts && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/player/paused.ts web/src/player/endCard.ts web/src/player/player.css web/test/playerOverlays.test.ts
git commit -m "feat(player): paused screen (Z4) and countdown card (N2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Loading (K1) and buffering

**Files:**
- Create: `web/src/player/loading.ts`; append CSS
- Modify: `web/src/api/actions.ts` (`play()` dispatches `tide:play`)
- Test: `web/test/playerLoading.test.ts`

**Interfaces:**
```ts
export interface LoadStep { icon: string; text: string }
export function loadingSteps(transcode: NowPlaying['transcode'], sourceLabel: string | null): LoadStep[];   // 3 steps
export function loadingPercent(phase: 0 | 1 | 2, completion: number | null, bufferedAhead: number | null): number | null; // null = indeterminate
export interface Loading { el: HTMLElement; show(itemId: string): void; update(phase: 0 | 1 | 2, pct: number | null, steps: LoadStep[]): void; hide(): void; isOn(): boolean }
export function createLoading(): Loading;                // fixed, body-level overlay (z-index 2000)
export interface Buffering { el: HTMLElement; set(waiting: boolean, pct: number | null): void }
export function createBuffering(): Buffering;            // shows only after 400 ms of waiting
export const BUFFER_DELAY_MS = 400;
```

**Percent per phase:**
- **phase 0** (connecting): fixed 8.
- **phase 1** (preparing): `10 + 0.6 × completion` when `completion` is known; else `null`.
- **phase 2** (buffering): `70 + 30 × min(1, bufferedAhead / 10)` when known; else `null`.

**Step 2 text:**
- Transcoding: `Preparing stream · {source} → {height}p {VIDEOCODEC}`.
- Otherwise: `Starting stream`.

`show(itemId)`:
- Builds the screen once per item: blurred backdrop, poster, logo, episode line.
- The episode line comes from `getItem(itemId)`, so it is filled asynchronously.

`play()` in `actions.ts` dispatches `window.dispatchEvent(new CustomEvent('tide:play', { detail: { id } }))` before sending PlayNow.

- [ ] **Step 1: Failing tests** `web/test/playerLoading.test.ts`:

```ts
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
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** `web/src/player/loading.ts`:

```ts
import { getItem } from '../api/item';
import { imageUrl } from '../api/client';
import { h, icon } from '../ui/dom';
import type { NowPlaying } from './session';

export interface LoadStep { icon: string; text: string }
export const BUFFER_DELAY_MS = 400;
const NS = 'http://www.w3.org/2000/svg';

export function loadingSteps(t: NowPlaying['transcode'], sourceLabel: string | null): LoadStep[] {
  const prep = t?.height && t.videoCodec
    ? `Preparing stream · ${sourceLabel ? `${sourceLabel} → ` : ''}${t.height}p ${t.videoCodec.toUpperCase()}`
    : 'Starting stream';
  return [{ icon: 'dns', text: 'Connecting to server' }, { icon: 'movie_edit', text: prep }, { icon: 'downloading', text: 'Buffering' }];
}

export function loadingPercent(phase: 0 | 1 | 2, completion: number | null, ahead: number | null): number | null {
  if (phase === 0) return 8;
  if (phase === 1) return completion === null ? null : Math.round(10 + 0.6 * completion);
  return ahead === null ? null : Math.round(70 + 30 * Math.min(1, ahead / 10));
}

function ring(r: number, w: number): { el: HTMLElement; set(p: number | null): void } {
  const C = 2 * Math.PI * r;
  const box = r * 2 + w * 2;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`);
  const mk = (cls: string) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', String(r + w)); c.setAttribute('cy', String(r + w)); c.setAttribute('r', String(r)); c.setAttribute('class', cls); svg.append(c); return c; };
  mk('tr');
  const ar = mk('ar');
  const pct = h('span', { class: 'tide-ld-pct' });
  const el = h('div', { class: 'tide-ld-ring' }, svg as unknown as Node, pct);
  return {
    el,
    set(p) {
      el.classList.toggle('indet', p === null);
      ar.setAttribute('stroke-dasharray', p === null ? `${C * 0.25} ${C}` : `${(C * p) / 100} ${C}`);
      pct.textContent = p === null ? '' : `${p}%`;
    },
  };
}

export interface Loading { el: HTMLElement; show(itemId: string): void; update(phase: 0 | 1 | 2, pct: number | null, steps: LoadStep[]): void; hide(): void; isOn(): boolean }

export function createLoading(): Loading {
  const el = h('div', { class: 'tide-ld', 'aria-live': 'polite' });
  let on = false;
  let built = '';
  let r: ReturnType<typeof ring> | null = null;
  let stepsBox: HTMLElement | null = null;
  return {
    el,
    show(itemId) {
      on = true;
      el.classList.add('show');
      if (built === itemId) return;
      built = itemId;
      r = ring(42, 4);
      stepsBox = h('div', { class: 'tide-ld-steps' });
      const bg = h('div', { class: 'tide-ld-bg' });
      const poster = h('div', { class: 'tide-ld-poster' });
      const logo = h('img', { class: 'tide-ld-logo', alt: '' }) as HTMLImageElement;
      logo.onerror = () => logo.remove();
      const line = h('b', { class: 'tide-ld-line' });
      el.replaceChildren(bg, h('div', { class: 'tide-ld-in' }, poster, h('div', { class: 'tide-ld-tx' }, logo, line, h('div', { class: 'tide-ld-row' }, r.el, stepsBox))));
      void getItem(itemId).then((it) => {
        if (built !== itemId) return;
        const sid = it.SeriesId ?? it.Id;
        bg.style.backgroundImage = `url("${imageUrl(sid, 'Backdrop/0', 300)}")`;
        poster.style.backgroundImage = `url("${imageUrl(sid, 'Primary', 400)}")`;
        logo.src = imageUrl(sid, 'Logo', 600);
        line.textContent = it.Type === 'Episode' ? `S${it.ParentIndexNumber ?? 0} · E${it.IndexNumber ?? 0} · ${it.Name}` : it.Name;
      }).catch(() => {});
    },
    update(phase, pct, steps) {
      r?.set(pct);
      if (!stepsBox) return;
      if (stepsBox.children.length !== steps.length) stepsBox.replaceChildren(...steps.map(() => h('div', { class: 'tide-ld-step' }, icon('check'), h('span', {}))));
      [...stepsBox.children].forEach((d, i) => {
        d.className = `tide-ld-step${i < phase ? ' done' : i === phase ? ' on' : ''}`;
        const ic = d.querySelector('.tide-ms')!;
        const want = i < phase ? 'check' : steps[i]!.icon;
        if (ic.textContent !== want && !ic.classList.contains('tide-svg')) ic.textContent = want;
        d.querySelector('span:last-child')!.textContent = steps[i]!.text;
      });
    },
    hide() { on = false; el.classList.remove('show'); },
    isOn: () => on,
  };
}

export interface Buffering { el: HTMLElement; set(waiting: boolean, pct: number | null): void }

export function createBuffering(): Buffering {
  const r = ring(28, 4);
  const el = h('div', { class: 'tide-buf' }, r.el, h('small', {}, 'Buffering'));
  r.el.querySelector('.tide-ld-pct')!.classList.add('tide-buf-pct');
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    el,
    set(waiting, pct) {
      r.set(pct);
      if (!waiting) { if (timer) clearTimeout(timer); timer = undefined; el.classList.remove('show'); return; }
      if (el.classList.contains('show') || timer) return;
      timer = setTimeout(() => { timer = undefined; el.classList.add('show'); }, BUFFER_DELAY_MS);
    },
  };
}
```

Note: the step `check` icon from `icon()` is an inline SVG (Task 4 of 0.3.0), so its glyph cannot be swapped by text. The code above leaves SVG icons alone. Done steps show ✓, because the step markup starts from `icon('check')` and the CSS hides it unless the step is `.done`. Implement that CSS rule:
`body.tide .tide-ld-step:not(.done) .tide-svg { display: none; }`. The other glyphs come from a separate font span. Keep it simple: render `h('span', { class: 'tide-ms tide-ld-gl' }, step.icon)` next to the check, and show either the check or the glyph via CSS.

Then simplify `update()`. Replace the icon-swap lines with:
```ts
        d.querySelector('.tide-ld-gl')!.textContent = steps[i]!.icon;
```
and build each step as `h('div', { class: 'tide-ld-step' }, icon('check'), h('span', { class: 'tide-ms tide-ld-gl' }), h('span', {}))`.

Append to `player.css`:
```css
/* K1 loading */
body.tide .tide-ld { position: fixed; inset: 0; z-index: 2000; background: #000; opacity: 0; pointer-events: none; transition: opacity .6s var(--tide-sp); color: #fff; }
body.tide .tide-ld.show { opacity: 1; pointer-events: auto; }
body.tide .tide-ld-bg { position: absolute; inset: -40px; background: center / cover; filter: blur(24px) brightness(.35) saturate(1.3); }
body.tide .tide-ld-in { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 56px; }
body.tide .tide-ld-poster { width: 190px; aspect-ratio: 2/3; border-radius: 16px; background: center / cover #1d1d20; box-shadow: 0 30px 60px rgba(0,0,0,.7); }
body.tide .tide-ld-tx { display: flex; flex-direction: column; gap: 18px; }
body.tide .tide-ld-logo { height: 46px; align-self: flex-start; }
body.tide .tide-ld-line { font-size: 20px; }
body.tide .tide-ld-row { display: flex; align-items: center; gap: 22px; }
body.tide .tide-ld-ring { position: relative; width: 92px; height: 92px; flex: 0 0 auto; }
body.tide .tide-ld-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
body.tide .tide-ld-ring circle { fill: none; stroke-width: 4; }
body.tide .tide-ld-ring .tr { stroke: rgba(255,255,255,.16); }
body.tide .tide-ld-ring .ar { stroke: #fff; stroke-linecap: round; transition: stroke-dasharray .4s var(--tide-sp); }
body.tide .tide-ld-ring.indet svg { animation: tide-ld-spin 1.1s linear infinite; }
@keyframes tide-ld-spin { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }
body.tide .tide-ld-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; font-variant-numeric: tabular-nums; }
body.tide .tide-ld-steps { display: flex; flex-direction: column; gap: 8px; font-size: 14px; font-weight: 600; color: #6e6e73; }
body.tide .tide-ld-step { display: flex; align-items: center; gap: 10px; transition: color .3s; }
body.tide .tide-ld-step.on { color: #fff; }
body.tide .tide-ld-step.done { color: #a1a1a6; }
body.tide .tide-ld-step .tide-ms { font-size: 18px; width: 18px; }
body.tide .tide-ld-step:not(.done) .tide-svg, body.tide .tide-ld-step.done .tide-ld-gl { display: none; }
/* Buffering (control-style) */
body.tide .tide-buf { position: absolute; left: 50%; top: 50%; z-index: 6; display: flex; flex-direction: column; align-items: center; gap: 12px; opacity: 0; pointer-events: none; transform: translate(-50%, -50%) scale(.9); transition: opacity .3s, transform .4s var(--tide-sp); }
body.tide .tide-buf.show { opacity: 1; transform: translate(-50%, -50%); }
body.tide .tide-buf .tide-ld-ring { width: 76px; height: 76px; border-radius: 50%; background: #2a2a2e; box-shadow: 0 8px 20px rgba(0,0,0,.6); }
body.tide .tide-buf .tide-ld-ring svg { inset: 8px; width: auto; height: auto; }
body.tide .tide-buf .tide-ld-ring circle { stroke-width: 3; }
body.tide .tide-buf .tide-ld-ring .tr { stroke: #48484a; }
body.tide .tide-buf .tide-ld-pct { font-size: 15px; }
body.tide .tide-buf small { height: 32px; display: inline-flex; align-items: center; padding: 0 14px; border-radius: 16px; background: #2a2a2e; font-size: 13px; font-weight: 700; box-shadow: 0 8px 20px rgba(0,0,0,.5); }
@media (prefers-reduced-motion: reduce) { body.tide .tide-ld-ring.indet svg { animation: none; } }
```

In `web/src/api/actions.ts` `play()`, add as the first line inside `try`:
```ts
    window.dispatchEvent(new CustomEvent('tide:play', { detail: { id } }));
```

- [ ] **Step 4: Run.** `npm test && npm run typecheck`. Expected: PASS. Existing action tests stay green, since the extra event is harmless.

- [ ] **Step 5: Commit.**
```bash
git add web/src/player/loading.ts web/src/player/player.css web/src/api/actions.ts web/test/playerLoading.test.ts
git commit -m "feat(player): K1 loading screen with steps/progress and control-style buffering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Phone + touch gestures

**Files:**
- Create: `web/src/player/touch.ts`; append phone CSS
- Test: `web/test/playerTouch.test.ts`

**Interfaces:**
```ts
export interface TouchDeps { toggleControls(): void; togglePlay(): void; seekBy(d: number): void; openShelf(): void; ripple(side: -1 | 1): void }
export function attachTouch(layer: HTMLElement, deps: TouchDeps, now?: () => number): () => void;
export const DOUBLE_TAP_MS = 300;
```

**Gestures:**
- A tap (pointerup with `pointerType === 'touch'`, under 10px movement) waits 300 ms and then calls `toggleControls`.
- A second tap within 300 ms cancels that, and uses the tap's x position:
  - x < 38% of the width → `seekBy(-10)` + `ripple(-1)`.
  - x > 62% → `seekBy(10)` + `ripple(1)`.
  - Anything in between → `togglePlay`.
- An upward swipe of more than 60px → `openShelf`.
- Taps on `.tide-pc-b, .tide-pc-p, .tide-pc-scr, .tide-pset, .tide-pshelf, .tide-end, .tide-pz-next` are ignored.

- [ ] **Step 1: Failing tests** `web/test/playerTouch.test.ts`:

```ts
import { attachTouch, DOUBLE_TAP_MS } from '../src/player/touch';

function layer() {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 } as DOMRect);
  document.body.append(el);
  return el;
}
const tp = (el: Element, type: string, x: number, y = 250) => el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerType: 'touch', clientX: x, clientY: y, pointerId: 1 }));
const tap = (el: Element, x: number) => { tp(el, 'pointerdown', x); tp(el, 'pointerup', x); };

test('tap toggles controls after the double-tap window; double-tap zones seek or play', () => {
  vi.useFakeTimers();
  const el = layer();
  const d = { toggleControls: vi.fn(), togglePlay: vi.fn(), seekBy: vi.fn(), openShelf: vi.fn(), ripple: vi.fn() };
  const stop = attachTouch(el, d);
  tap(el, 500);
  expect(d.toggleControls).not.toHaveBeenCalled();
  vi.advanceTimersByTime(DOUBLE_TAP_MS + 10);
  expect(d.toggleControls).toHaveBeenCalledTimes(1);
  tap(el, 100); tap(el, 100);
  expect(d.seekBy).toHaveBeenLastCalledWith(-10);
  expect(d.ripple).toHaveBeenLastCalledWith(-1);
  tap(el, 900); tap(el, 900);
  expect(d.seekBy).toHaveBeenLastCalledWith(10);
  tap(el, 500); tap(el, 500);
  expect(d.togglePlay).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(DOUBLE_TAP_MS * 2);
  expect(d.toggleControls).toHaveBeenCalledTimes(1);
  stop();
  vi.useRealTimers();
});

test('swipe up opens the shelf; taps on controls are ignored', () => {
  vi.useFakeTimers();
  const el = layer();
  const btn = document.createElement('button');
  btn.className = 'tide-pc-b';
  el.append(btn);
  const d = { toggleControls: vi.fn(), togglePlay: vi.fn(), seekBy: vi.fn(), openShelf: vi.fn(), ripple: vi.fn() };
  attachTouch(el, d);
  tp(el, 'pointerdown', 500, 400); tp(el, 'pointermove', 500, 300); tp(el, 'pointerup', 500, 300);
  expect(d.openShelf).toHaveBeenCalled();
  tap(btn, 500);
  vi.advanceTimersByTime(DOUBLE_TAP_MS + 10);
  expect(d.toggleControls).not.toHaveBeenCalled();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** `web/src/player/touch.ts`:

```ts
export interface TouchDeps { toggleControls(): void; togglePlay(): void; seekBy(d: number): void; openShelf(): void; ripple(side: -1 | 1): void }
export const DOUBLE_TAP_MS = 300;
const IGNORE = '.tide-pc-b, .tide-pc-p, .tide-pc-scr, .tide-pset, .tide-pshelf, .tide-end, .tide-pz-next';

export function attachTouch(layer: HTMLElement, deps: TouchDeps, now: () => number = () => Date.now()): () => void {
  let startX = 0, startY = 0, moved = false, swiped = false, lastTap = 0;
  let single: ReturnType<typeof setTimeout> | undefined;
  const ignored = (e: Event) => !!(e.target as Element | null)?.closest?.(IGNORE);
  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || ignored(e)) return;
    startX = e.clientX; startY = e.clientY; moved = false; swiped = false;
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) moved = true;
    if (!swiped && startY - e.clientY > 60) { swiped = true; deps.openShelf(); }
  };
  const up = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || ignored(e) || moved || swiped) return;
    const t = now();
    if (t - lastTap < DOUBLE_TAP_MS) {
      lastTap = 0;
      if (single) { clearTimeout(single); single = undefined; }
      const r = layer.getBoundingClientRect();
      const x = (e.clientX - r.left) / (r.width || 1);
      if (x < 0.38) { deps.seekBy(-10); deps.ripple(-1); } else if (x > 0.62) { deps.seekBy(10); deps.ripple(1); } else deps.togglePlay();
      return;
    }
    lastTap = t;
    single = setTimeout(() => { single = undefined; deps.toggleControls(); }, DOUBLE_TAP_MS);
  };
  layer.addEventListener('pointerdown', down);
  layer.addEventListener('pointermove', move);
  layer.addEventListener('pointerup', up);
  return () => {
    if (single) clearTimeout(single);
    layer.removeEventListener('pointerdown', down);
    layer.removeEventListener('pointermove', move);
    layer.removeEventListener('pointerup', up);
  };
}
```

The fake-timer test uses `Date.now()` (faked by vitest), so the default `now` works.

Append to `player.css`:
```css
/* Phone (≤ 699px or coarse pointer) */
@media (max-width: 699px), (pointer: coarse) {
  body.tide .tide-player { --tide-lift: -84px; --tide-pb: 16px; --tide-pg: 22px; }
  body.tide .tide-pc-hd { top: 16px; } body.tide .tide-pc-logo { height: 26px; } body.tide .tide-pc-ep { font-size: 13px; margin-top: 4px; }
  body.tide .tide-pc-bt { bottom: 12px; } body.tide .tide-pc-row { margin-top: 8px; gap: 8px; } body.tide .tide-pc-times { margin-top: 4px; font-size: 12px; }
  body.tide .tide-pc-b { width: 44px; height: 44px; } body.tide .tide-pc-b .tide-ms { font-size: 22px; }
  body.tide .tide-pc-p { height: 40px; padding: 0 14px; font-size: 13px; }
  body.tide :is(.tide-pc-rw, .tide-pc-fw, .tide-pc-volw, .tide-pc-row > .tide-pc-play) { display: none; }
  body.tide .tide-pc-ctr { display: flex; }
  body.tide .tide-pc-ctr .tide-pc-b { background: rgba(0,0,0,.45); }
  body.tide .tide-pc-ctr .tide-pc-big { width: 72px; height: 72px; background: rgba(0,0,0,.55); }
  body.tide .tide-pc-ctr .tide-pc-big .tide-ms { font-size: 44px; }
  body.tide .tide-player:is(.tide-ps-open, .tide-pset-open, .tide-end-on) .tide-pc-ctr { opacity: 0 !important; pointer-events: none; }
  body.tide .tide-pshelf { bottom: 92px; } body.tide .tide-pshelf .tide-row-track > * { flex-basis: 220px; }
  body.tide .tide-pset { left: 0; right: 0; bottom: 0; border-radius: 24px 24px 0 0; grid-template-columns: 1fr 1fr; max-height: 78%; overflow: auto; scrollbar-width: none; }
  body.tide .tide-pset-col:nth-child(3) { grid-column: 1 / -1; border-left: 0; padding-left: 0; border-top: 1px solid #222; }
  body.tide .tide-pz-block { left: 40px; gap: 22px; } body.tide .tide-pz-poster { flex-basis: 110px; } body.tide .tide-pz-text { width: 420px; gap: 8px; }
  body.tide .tide-pz-logo { height: 34px; } body.tide .tide-pz-line { font-size: 16px; } body.tide .tide-pz-syn { font-size: 13px; }
  body.tide .tide-pz-paused { top: 16px; font-size: 13px; } body.tide .tide-pz-next { width: 260px; }
  body.tide .tide-end-card { width: 320px; } body.tide .tide-end-th { flex-basis: 110px; }
  body.tide .tide-ld-poster { width: 110px; } body.tide .tide-ld-in { gap: 28px; } body.tide .tide-ld-logo { height: 28px; } body.tide .tide-ld-line { font-size: 15px; } body.tide .tide-ld-steps { font-size: 12px; }
}
/* Double-tap ripple */
body.tide .tide-rip { position: absolute; top: 0; bottom: 0; width: 38%; z-index: 4; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-weight: 700; font-size: 14px; opacity: 0; pointer-events: none; }
body.tide .tide-rip.l { left: 0; background: radial-gradient(circle at 30% 50%, rgba(255,255,255,.18), transparent 70%); }
body.tide .tide-rip.r { right: 0; background: radial-gradient(circle at 70% 50%, rgba(255,255,255,.18), transparent 70%); }
body.tide .tide-rip .tide-ms { font-size: 34px; }
body.tide .tide-rip.go { animation: tide-rip .7s var(--tide-sp); }
@keyframes tide-rip { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 0; } }
```

- [ ] **Step 4: Run.** `npx vitest run test/playerTouch.test.ts && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add web/src/player/touch.ts web/src/player/player.css web/test/playerTouch.test.ts
git commit -m "feat(player): phone layout and touch gestures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Mount the player (wiring + takeover)

**Files:**
- Create: `web/src/player/player.ts`
- Modify: `web/src/main.ts` (register the takeover + loading listener), `web/src/router/selectors.ts` (`SELECTORS.playerHost`, `ROUTES.isPlayer`)
- Test: `web/test/player.test.ts`

**Interfaces:**
- `SELECTORS.playerHost = '#videoOsdPage:not(.hide)'`
- `ROUTES.isPlayer(loc) => /^#\/video(\?|$)/.test(loc.hash)`
- `export const PLAYER_TAKEOVER: Takeover`
- `export async function mountPlayer(host: HTMLElement, cfg: ClientConfig): Promise<() => void>`
- `export function initPlayLoading(cfg: ClientConfig): () => void` listens for `tide:play` and shows the K1 overlay. It hides it when a web `<video>` fires `playing`, when the route leaves without playback, or after a 90 s safety timeout.

**Wiring (in `mountPlayer`):**
1. Add `host.classList.add('tide-taken')`, create the `.tide-player` root, and attach it to `document.body`. The player root is fixed and full-screen; the stock page's z-index stacking stays underneath.
2. Create the bridge: `createBridge(host)`.
3. Create the controls (deps: shelf open, settings open, next, `hasNext` from the session item's series episode list, `isSeries`), shelf, sheet, paused, end card, buffering, and ripples.
4. Start `pollSession`. On each `NowPlaying`, when the item id changes (rebuild per item):
   - `bridge.setDuration(runtime)`.
   - `controls.setItem` with logo, line and trickplay. Trickplay comes from `item.Trickplay?.[mediaSourceId]` (first width), via `getItem(id)` with `Fields=Trickplay,MediaSources`.
   - `loadSegments` → `controls.setSegments`.
   - `shelf.setEpisode` for episodes.
   - Next episode via `getEpisodes` of the same season, plus the first episode of the next season when this is the last.
   - `paused.setItem`.
   - `endCard.setNext(next, autoplay)`, where autoplay is `ApiClient.getCurrentUser().Configuration.EnableNextEpisodeAutoPlay !== false`.
   - Settings data: `streamsToSheet` + `qualityChoices(source height)`.
5. On every poll, refresh the sheet's current audio and subtitle (`setData`).
6. `bridge.onState(s)`:
   - `controls.update(s)`
   - `paused.arm(s.paused, shelf.isOpen() || sheet.isOpen() || endCard.isShowing())`
   - `endCard.update(s.position, segments.credits, !s.paused, dt)`
   - Buffering: `video` `waiting`/`stalled`/`playing` events toggle `buffering.set` with `pct = min(100, buffered / 5 × 100)`.
   - Hide the K1 overlay when not paused and `position > 0`.
7. **Pinning:** opening the shelf or sheet pins the controls and sets host classes `tide-ps-open` / `tide-pset-open`. The shelf and the sheet are mutually exclusive.
8. **Esc:** closes the sheet, then the shelf, then the paused screen.
9. **Pointer:**
   - `pointermove` on the root wakes the controls and dismisses the paused screen, unless the target is inside `[data-pz-next]`.
   - A click on bare video (not on any control) toggles play on desktop.
10. **Touch:** `attachTouch` on the root with deps (toggle controls via `controls.isIdle() ? wake : force idle`).
11. **Unmount:** dispose everything, remove the root, and remove the `tide-taken` class.

- [ ] **Step 1: Failing tests** `web/test/player.test.ts`:

```ts
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
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.**

In `selectors.ts`:
- Add `playerHost: '#videoOsdPage:not(.hide)',` to `SELECTORS`.
- Add `isPlayer: (loc: Location = location) => /^#\/video(\?|$)/.test(loc.hash),` to `ROUTES`.

`web/src/player/player.ts`:
```ts
import './player.css';
import { jfApiClient } from '../api/client';
import { play } from '../api/actions';
import { getEpisodes, getItem } from '../api/item';
import { fmtRuntime, h, icon } from '../ui/dom';
import { ROUTES, SELECTORS } from '../router/selectors';
import type { Takeover } from '../router/hook';
import { createBridge, type PlayerState } from './bridge';
import { createControls } from './controls';
import { createShelf } from './shelf';
import { createSettingsSheet, streamsToSheet } from './settingsSheet';
import { createPausedScreen } from './paused';
import { createEndCard } from './endCard';
import { createBuffering, createLoading, loadingPercent, loadingSteps } from './loading';
import { attachTouch } from './touch';
import { pollSession, type NowPlaying } from './session';
import { applySetting, qualityChoices } from './commands';
import { loadSegments, type Segments } from './segments';
import type { TrickplayInfo } from './format';
import type { ClientConfig, JfItem } from '../types';

const loading = createLoading();

export async function mountPlayer(host: HTMLElement, cfg: ClientConfig): Promise<() => void> {
  host.classList.add('tide-taken');
  const root = h('div', { class: 'tide-player' });
  document.body.append(root);
  const bridge = createBridge(host);
  let np: NowPlaying | null = null;
  let itemKey = '';
  let next: JfItem | null = null;
  let segments: Segments = { intro: null, credits: null };
  let subSize: 'S' | 'M' | 'L' | 'XL' = 'M';
  let speed = 1;
  let quality = 'Auto';
  let sourceHeight = 0;

  const shelf = createShelf((open) => { root.classList.toggle('tide-ps-open', open); controls.setPinned(open || sheet.isOpen()); });
  const sheet = createSettingsSheet(async (kind, value) => {
    if (!np) return;
    if (kind === 'subSize') { subSize = value as typeof subSize; document.documentElement.dataset.tideSubsize = value; return; }
    if (kind === 'speed') speed = Number(value);
    if (kind === 'quality') quality = value;
    const want = Number(value);
    await applySetting(kind, value, {
      sessionId: np.sessionId, bridge,
      confirm: () => kind === 'audio' ? np?.audioIndex === want : kind === 'subtitles' ? (want < 0 ? np?.subtitleIndex === null : np?.subtitleIndex === want) : true,
    });
  }, (open) => { root.classList.toggle('tide-pset-open', open); controls.setPinned(open || shelf.isOpen()); });
  const openShelf = () => { if (!np || np.item.Type !== 'Episode') return; sheet.close(); shelf.isOpen() ? shelf.close() : shelf.open(); };
  const openSheet = () => { shelf.close(); sheet.isOpen() ? sheet.close() : sheet.open(); };
  const playNext = () => { if (next) void play(next.Id); };
  const controls = createControls({ bridge, onEpisodes: openShelf, onSettings: openSheet, onNext: playNext, hasNext: () => !!next, isSeries: () => np?.item.Type === 'Episode' });
  const paused = createPausedScreen(root);
  const endCard = createEndCard(playNext);
  const buffering = createBuffering();
  const ripL = h('div', { class: 'tide-rip l' }, icon('fast_rewind'), h('span', {}, '−10 s'));
  const ripR = h('div', { class: 'tide-rip r' }, icon('fast_forward'), h('span', {}, '+10 s'));
  root.append(controls.el, paused.el, endCard.el, buffering.el, ripL, ripR, shelf.el, sheet.el);

  const autoplay = await (jfApiClient() as unknown as { getCurrentUser?(): Promise<{ Configuration?: { EnableNextEpisodeAutoPlay?: boolean } }> } | null)
    ?.getCurrentUser?.().then((u) => u?.Configuration?.EnableNextEpisodeAutoPlay !== false).catch(() => true) ?? true;

  const sheetData = () => np && sheet.setData({
    ...streamsToSheet(np.item), audioIndex: np.audioIndex, subtitleIndex: np.subtitleIndex,
    quality: qualityChoices(sourceHeight), qualityCur: quality, speed, subSize,
  });

  const onItem = async (n: NowPlaying) => {
    const it = n.item;
    const full = await getItem(it.Id).catch(() => it);
    const runtime = (it.RunTimeTicks ?? full.RunTimeTicks ?? 0) / 1e7;
    bridge.setDuration(runtime);
    const isEp = it.Type === 'Episode';
    const sid = isEp ? (it.SeriesId ?? it.Id) : it.Id;
    const line = isEp ? `S${it.ParentIndexNumber ?? 0} · E${it.IndexNumber ?? 0} · ${it.Name}` : it.Name;
    const src = (full as { MediaSources?: { Id: string; MediaStreams?: { Type: string; Height?: number }[] }[] }).MediaSources?.[0];
    sourceHeight = src?.MediaStreams?.find((s) => s.Type === 'Video')?.Height ?? 0;
    const tp = (full as { Trickplay?: Record<string, Record<string, TrickplayInfo>> }).Trickplay?.[src?.Id ?? ''];
    const tpInfo = tp ? Object.values(tp)[0] : undefined;
    next = null;
    if (isEp && it.SeriesId && it.SeasonId) {
      const eps = await getEpisodes(it.SeriesId, it.SeasonId).catch(() => [] as JfItem[]);
      next = eps[eps.findIndex((e) => e.Id === it.Id) + 1] ?? null;
      void shelf.setEpisode(it.SeriesId, it.Id);
    }
    // After `next` is known: setItem decides whether the Episodes / Next episode pills are shown.
    controls.setItem({ logoId: sid, title: isEp ? it.SeriesName ?? it.Name : it.Name, line, stillId: it.Id, trickplay: tpInfo && src ? { id: it.Id, mediaSourceId: src.Id, info: tpInfo } : null });
    segments = await loadSegments(it.Id, runtime, cfg);
    controls.setSegments(segments);
    const left = (n2: number) => `${Math.max(0, Math.round(n2))}m left`;
    paused.setItem({
      posterId: sid, logoId: sid, line, overview: full.Overview ?? '',
      meta: [full.ProductionYear, fmtRuntime(it.RunTimeTicks), left((runtime - bridge.read().position) / 60), full.OfficialRating].filter(Boolean).join(' · '),
      next: next ? { id: next.Id, label: `${next.IndexNumber ?? ''}. ${next.Name}`, runtime: fmtRuntime(next.RunTimeTicks) ?? '' } : null,
    }, playNext);
    endCard.setNext(next ? { id: next.Id, title: `${next.IndexNumber ?? ''}. ${next.Name}`, runtime: fmtRuntime(next.RunTimeTicks) ?? '', stillId: next.Id } : null, autoplay);
    sheetData();
  };

  const stopPoll = pollSession((n) => {
    if (!n) return;
    np = n;
    if (n.item.Id !== itemKey) { itemKey = n.item.Id; void onItem(n); }
    else sheetData();
    if (loading.isOn()) loading.update(1, loadingPercent(1, n.transcode?.completion ?? null, null), loadingSteps(n.transcode, null));
  });

  let lastT = performance.now();
  const stopState = bridge.onState((s: PlayerState) => {
    const t = performance.now();
    const dt = (t - lastT) / 1000;
    lastT = t;
    controls.update(s);
    paused.arm(s.paused, shelf.isOpen() || sheet.isOpen() || endCard.isShowing());
    endCard.update(s.position, segments.credits, !s.paused, dt);
    if (loading.isOn()) {
      if (!s.paused && s.position > 0) loading.hide();
      else loading.update(2, loadingPercent(2, null, s.buffered), loadingSteps(np?.transcode ?? null, null));
    }
  });

  const v = bridge.video();
  const onWait = () => buffering.set(true, (() => { const b = bridge.read().buffered; return b === null ? null : Math.min(100, Math.round((b / 5) * 100)); })());
  const onPlaying = () => buffering.set(false, null);
  v?.addEventListener('waiting', onWait);
  v?.addEventListener('stalled', onWait);
  v?.addEventListener('playing', onPlaying);

  const ripple = (side: -1 | 1) => { const r = side < 0 ? ripL : ripR; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); };
  const stopTouch = attachTouch(root, {
    toggleControls: () => (controls.isIdle() ? controls.wake() : root.classList.add('tide-pc-idle')),
    togglePlay: () => bridge.togglePlay(), seekBy: (d) => bridge.seekBy(d), openShelf: openShelf, ripple,
  });
  root.addEventListener('pointermove', (e) => {
    if (paused.isOn() && (e.target as Element).closest('[data-pz-next]')) return;
    if (paused.isOn()) paused.dismiss();
    controls.wake();
  });
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (paused.isOn()) { paused.dismiss(); controls.wake(); return; }
    if (sheet.isOpen() && !t.closest('.tide-pset')) { sheet.close(); return; }
    if (shelf.isOpen() && !t.closest('.tide-pshelf')) { shelf.close(); return; }
    if (t.closest('.tide-pc-b, .tide-pc-p, .tide-pc-scr, .tide-pshelf, .tide-pset, .tide-end, .tide-pz-next')) return;
    if ((e as PointerEvent).pointerType === 'touch') return;
    bridge.togglePlay();
  });
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (sheet.isOpen()) sheet.close(); else if (shelf.isOpen()) shelf.close(); else if (paused.isOn()) paused.dismiss(); else return;
    e.preventDefault(); e.stopPropagation();
  };
  document.addEventListener('keydown', onEsc, true);

  return () => {
    stopPoll(); stopState(); stopTouch();
    v?.removeEventListener('waiting', onWait); v?.removeEventListener('stalled', onWait); v?.removeEventListener('playing', onPlaying);
    document.removeEventListener('keydown', onEsc, true);
    controls.dispose(); shelf.dispose(); sheet.dispose(); paused.dispose(); endCard.dispose();
    loading.hide();
    root.remove();
    host.classList.remove('tide-taken');
  };
}

export const PLAYER_TAKEOVER: Takeover = {
  id: 'player',
  rootClass: 'tide-player-anchor',
  matches: (cfg, loc) => cfg.enablePlayer !== false && ROUTES.isPlayer(loc),
  key: () => 'player',
  findHost: () => document.querySelector<HTMLElement>(SELECTORS.playerHost),
  mount: async (host, cfg) => {
    const un = await mountPlayer(host, cfg);
    // The router checks `:scope > .rootClass` on the host to know we are still mounted: leave an anchor.
    const anchor = h('i', { class: 'tide-player-anchor', hidden: true });
    host.prepend(anchor);
    return () => { anchor.remove(); un(); };
  },
};

/** K1 starts the moment Tide asks to play (the route change can take seconds). */
export function initPlayLoading(cfg: ClientConfig): () => void {
  if (cfg.enablePlayer === false) return () => {};
  if (!loading.el.isConnected) document.body.append(loading.el);
  let safety: ReturnType<typeof setTimeout> | undefined;
  const onPlay = (e: Event) => {
    const id = (e as CustomEvent<{ id: string }>).detail?.id;
    if (!id) return;
    loading.show(id);
    loading.update(0, loadingPercent(0, null, null), loadingSteps(null, null));
    if (safety) clearTimeout(safety);
    safety = setTimeout(() => loading.hide(), 90_000);
  };
  const onRoute = () => { if (!ROUTES.isPlayer() && loading.isOn() && !document.querySelector('.videoPlayerContainer video')) setTimeout(() => { if (!ROUTES.isPlayer()) loading.hide(); }, 15_000); };
  window.addEventListener('tide:play', onPlay);
  window.addEventListener('hashchange', onRoute);
  return () => { window.removeEventListener('tide:play', onPlay); window.removeEventListener('hashchange', onRoute); if (safety) clearTimeout(safety); };
}
```

In `web/src/main.ts`, next to the `DETAILS_TAKEOVER` registration:
```ts
import { initPlayLoading, PLAYER_TAKEOVER } from './player/player';
registerTakeover(PLAYER_TAKEOVER);
registerFeature((cfg) => void initPlayLoading(cfg));
```

Note: `SeasonId` must exist on `JfDetail`. It is already declared there; `NowPlayingItem` includes it.

- [ ] **Step 4: Run.** `npm test && npm run typecheck && npm run build`. Expected: PASS and the build is produced.

- [ ] **Step 5: Commit.**
```bash
git add web/src/player/player.ts web/src/router/selectors.ts web/src/main.ts web/test/player.test.ts
git commit -m "feat(player): mount Tide's control layer over the stock player

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Episode detail page

**Files:**
- Modify: `web/src/details/details.ts` (accept `Episode`), `web/src/details/header.ts` (episode variant), `web/src/details/details.css`, `web/src/details/logic.ts` (`aboutFacts` episode set, `endsAt`)
- Test: `web/test/detailsEpisodePage.test.ts`

**Interfaces:**
- `logic.ts`:
  - `aboutFacts(item)` returns for `Type === 'Episode'`: `Directed by` (Director), `Written by` (Writer), `Aired` (month year of `PremiereDate`), `Rating`, `Season` (`ParentIndexNumber`), `Runtime`.
  - `export function endsAt(runtimeTicks: number | undefined, positionTicks: number | undefined, now?: Date): string | null` returns `HH:MM` in local time.
- `header.ts`:
  - `renderHeader(item)` for `Episode` renders:
    - the still (`.tide-dh-still`, 16:9, with a `.tide-dh-pb` progress line when partly watched) instead of the poster
    - the series logo (`imageUrl(item.SeriesId, 'Logo', 900)`)
    - the kicker `SEASON N · EPISODE M`
    - the title `h1.tide-dh-eptitle`
    - meta including `ends at HH:MM`
    - no Trailer button
    - a back link `a.tide-dh-back` (`← {SeriesName} · all seasons`) to `ROUTES.details(SeriesId)`
- `Header` gains `setNextEpisode(ep: JfItem | null): void`. For an episode page it appends the next-episode strip (kicker `NEXT EPISODE · S3 E2`) using `renderNextUp` with a `kicker` param.
  - `renderNextUp(ep, kicker = 'NEXT UP')`: change the signature and use `${kicker} · ${epLabel(ep)}`.

**Mount flow for `Episode`:**
1. The header goes in first.
2. Fetch `getEpisodes(SeriesId, SeasonId)`; next = the following episode → `header.setNextEpisode(next)`.
3. Seasons = `sortSeasons(getSeasons(SeriesId))`; `startIdx` = this season.
4. `renderEpisodes(…, { current: { id: item.Id, tag: 'NOW VIEWING' } })` with the section heading "More from Season N". Implement it by passing the heading through `renderEpisodes`: add `opts.heading?: string`. When set, it renders an `h2` with that text before the dropdown.
5. Then `renderCast(item.People)`, then `renderAbout(item, { src: item.MediaSources?.[0], label: 'Your file' }, q)`.
6. No similar row.
7. The background uses the series backdrop: `bgImg.src = imageUrl(item.SeriesId ?? item.Id, 'Backdrop/0', 1920)`.

- [ ] **Step 1: Failing tests** `web/test/detailsEpisodePage.test.ts`:

```ts
import { mountDetails } from '../src/details/details';
import { aboutFacts, endsAt } from '../src/details/logic';

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u', getCurrentUser: async () => ({ Policy: {} }) };
  document.body.innerHTML = '<div id="itemDetailPage" class="page itemDetailPage"><div class="detailPageWrapperContainer">stock</div></div>';
});
afterEach(() => vi.restoreAllMocks());

test('episode facts and ends-at', () => {
  expect(aboutFacts({ Id: 'e', Name: 'E', Type: 'Episode', ParentIndexNumber: 3, PremiereDate: '2026-05-01T00:00:00Z', OfficialRating: 'TV-MA', RunTimeTicks: 51 * 6e8,
    People: [{ Id: 'd', Name: 'Michael Dinner', Type: 'Director' }, { Id: 'w', Name: 'Graham Yost', Type: 'Writer' }] }))
    .toEqual([['Directed by', 'Michael Dinner'], ['Written by', 'Graham Yost'], ['Aired', 'May 2026'], ['Rating', 'TV-MA'], ['Season', '3'], ['Runtime', '51m']]);
  const now = new Date(2026, 10, 8, 22, 22);
  expect(endsAt(51 * 6e8, 13 * 6e8, now)).toBe('23:00');
  expect(endsAt(undefined, undefined, now)).toBeNull();
});

test('episode page: still, kicker, back link, next strip, NOW VIEWING row, no similar', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/Items/e1?')) return new Response(JSON.stringify({ Id: 'e1', Name: 'Who Are You?', Type: 'Episode', SeriesId: 'ser', SeriesName: 'Silo', SeasonId: 'se3', ParentIndexNumber: 3, IndexNumber: 1, RunTimeTicks: 3.06e10, Overview: 'x', UserData: { PlaybackPositionTicks: 7e9 } }));
    if (u.includes('/Shows/ser/Seasons')) return new Response(JSON.stringify({ Items: [{ Id: 'se3', Name: 'Season 3', Type: 'Season', IndexNumber: 3, ChildCount: 2 }] }));
    if (u.includes('/Shows/ser/Episodes')) return new Response(JSON.stringify({ Items: [
      { Id: 'e1', Name: 'Who Are You?', Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 3, IndexNumber: 1 },
      { Id: 'e2', Name: "It's All Good", Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 3, IndexNumber: 2, RunTimeTicks: 3.06e10 }] }));
    return new Response('{"Items":[]}');
  });
  const host = document.querySelector<HTMLElement>('#itemDetailPage')!;
  const un = await mountDetails(host, {} as any, { hash: '#/details?id=e1' } as Location);
  expect(un).toBeTypeOf('function');
  expect(host.querySelector('.tide-dh-still')).not.toBeNull();
  expect(host.querySelector('.tide-dh-poster')).toBeNull();
  expect(host.querySelector('.tide-dh-kick')?.textContent).toBe('SEASON 3 · EPISODE 1');
  expect(host.querySelector('.tide-dh-eptitle')?.textContent).toBe('Who Are You?');
  expect(host.querySelector('.tide-dh-back')?.getAttribute('href')).toBe('#/details?id=ser');
  expect(host.querySelector('.tide-dh-trailer')).toBeNull();
  await vi.waitFor(() => expect(host.querySelector('.tide-nu-k')?.textContent).toBe('NEXT EPISODE · S3 E2'));
  await vi.waitFor(() => expect(host.querySelector('[data-id="e1"] .tide-wide-tag')?.textContent).toBe('NOW VIEWING'));
  expect(host.querySelector('.tide-eps h2')?.textContent).toBe('More from Season 3');
  expect(host.querySelector('.tide-similar')).toBeNull();
  un!();
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.**

`logic.ts`:
- Add the `Episode` branch to `aboutFacts` before the series/movie branches:
```ts
  if (item.Type === 'Episode') {
    return ([['Directed by', people(item.People, 'Director')], ['Written by', people(item.People, 'Writer')], ['Aired', monthYear(item.PremiereDate)],
      ['Rating', item.OfficialRating ?? ''], ['Season', item.ParentIndexNumber !== undefined ? String(item.ParentIndexNumber) : ''],
      ['Runtime', fmtRuntime(item.RunTimeTicks)?.replace(/ 0(\d)m$/, ' $1m') ?? '']] as [string, string][]).filter(([, v]) => !!v);
  }
```
- Add:
```ts
export function endsAt(runtime?: number, position?: number, now: Date = new Date()): string | null {
  if (!runtime) return null;
  const end = new Date(now.getTime() + (runtime - (position ?? 0)) / 1e4);
  return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
}
```

`nextUp.ts`: change the signature to `renderNextUp(ep: JfItem, kicker = 'NEXT UP')` and the kicker text to `` `${kicker} · ${epLabel(ep)}` ``.

`episodes.ts`: add `heading?: string` to `opts`. Build the heading row as:
```ts
    h('div', { class: 'tide-dsec-h' }, opts?.heading ? h('h2', {}, opts.heading) : null, ddWrap, count)
```

`header.ts`: inside `renderHeader`, compute `const isEp = item.Type === 'Episode'`.
- **Left column:** for episodes, build
```ts
  const still = h('div', { class: 'tide-dh-still' });
  still.style.backgroundImage = `url("${imageUrl(item.Id, 'Primary', 900)}")`;
  const pos = item.UserData?.PlaybackPositionTicks ?? 0;
  if (pos && item.RunTimeTicks) still.append(h('span', { class: 'tide-dh-pb' }, h('i', { style: `transform:scaleX(${pos / item.RunTimeTicks})` })));
```
  and use `still` in place of `poster`.
- **Logo:** use `imageUrl(isEp ? item.SeriesId! : item.Id, 'Logo', 900)`.
- **Episode column contents**, after the logo:
  - `h('div', { class: 'tide-dh-kick' }, `SEASON ${item.ParentIndexNumber ?? 0} · EPISODE ${item.IndexNumber ?? 0}`)`
  - `h('h1', { class: 'tide-dh-eptitle' }, item.Name)`
- **Meta:** append `h('span', { class: 'tide-dh-ends' }, `ends at ${endsAt(...)}`)` when available.
- **Trailer:** skipped for episodes (`trailer = null`).
- **Primary label:** for an episode, `primaryLabel` treats `item` like a movie (`t = item`) and labels `Resume` or `Play`. This needs no change, because `item.Type !== 'Series'` already selects that path.
- **Back link:** `h('a', { class: 'tide-dh-back', href: ROUTES.details(item.SeriesId!) }, icon('arrow_back'), ` ${item.SeriesName ?? ''} · all seasons`)` at the end of `col`.
- **Header class:** add `tide-dh-ep` to the header element for episodes.
- **New method on the returned object:** `setNextEpisode(ep) { col.querySelector('.tide-nu')?.remove(); if (ep) col.insertBefore(renderNextUp(ep, 'NEXT EPISODE'), col.querySelector('.tide-dh-back')); }`
- **Interface:** add `setNextEpisode(ep: JfItem | null): void` to `Header`.

`details.ts`:
- Allow `item.Type === 'Episode'`: `if (item.Type !== 'Movie' && item.Type !== 'Series' && item.Type !== 'Episode') return null;`.
- **Backdrop source:** `imageUrl(item.Type === 'Episode' ? item.SeriesId ?? item.Id : item.Id, 'Backdrop/0', 1920)`.
- **Similar row:** create it only when `item.Type !== 'Episode'`.
- **Episode branch** (alongside the Series/Movie branches):
```ts
  } else if (item.Type === 'Episode' && item.SeriesId && item.SeasonId) {
    void (async () => {
      try {
        const [eps, seasons] = await Promise.all([getEpisodes(item.SeriesId!, item.SeasonId!), getSeasons(item.SeriesId!)]);
        if (disposed) return;
        header.setNextEpisode(eps[eps.findIndex((e) => e.Id === item.Id) + 1] ?? null);
        const sorted = sortSeasons(seasons);
        const idx = Math.max(0, sorted.findIndex((s) => s.Id === item.SeasonId));
        const row = renderEpisodes(item.SeriesId!, sorted, idx, null, eps, { current: { id: item.Id, tag: 'NOW VIEWING' }, heading: `More from Season ${item.ParentIndexNumber ?? ''}` });
        disposers.push(row.dispose);
        header.el.after(row.el);
      } catch (e) { console.warn('[Tide] episode sections failed', e); }
    })();
    void qualityP.then(() => placeAbout({ src: item.MediaSources?.[0], label: 'Your file' }));
  }
```

Append to `details.css`:
```css
/* Episode page */
body.tide .tide-dh.tide-dh-ep { grid-template-columns: 520px minmax(0, 1fr); }
body.tide .tide-dh-still { position: relative; aspect-ratio: 16/9; border-radius: 22px; overflow: hidden; background: center / cover #1d1d20; box-shadow: 0 50px 100px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.06); }
body.tide .tide-dh-pb { position: absolute; left: 0; right: 0; bottom: 0; height: 5px; background: rgba(255,255,255,.25); }
body.tide .tide-dh-pb i { display: block; height: 100%; background: #fff; transform-origin: left center; }
body.tide .tide-dh-ep .tide-dh-logo { max-height: 70px; margin-bottom: 14px; }
body.tide .tide-dh-kick { font-size: 13px; font-weight: 800; letter-spacing: .12em; color: #a1a1a6; margin-bottom: 8px; }
body.tide .tide-dh-eptitle { margin: 0 0 10px; font-size: 40px; font-weight: 800; letter-spacing: -.03em; line-height: 1.05; }
body.tide .tide-dh-ends { color: #8e8e93; }
body.tide .tide-dh-back { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; color: #a1a1a6; font-weight: 600; font-size: 14px; text-decoration: none; }
body.tide .tide-dh-back:hover { color: #fff; }
@media (max-width: 899px) { body.tide .tide-dh.tide-dh-ep { grid-template-columns: 1fr; } }
@media (max-width: 699px) { body.tide .tide-dh-still { display: none; } body.tide .tide-dh-eptitle { font-size: 28px; } }
```

- [ ] **Step 4: Run.** `npm test && npm run typecheck`. Expected: PASS. The existing detail tests still pass; the episode `aboutFacts` branch doesn't affect movies or series.

- [ ] **Step 5: Commit.**
```bash
git add web/src/details web/test/detailsEpisodePage.test.ts
git commit -m "feat: episode detail page (still header, next-episode strip, More from Season row)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: E2E, version 0.4.0, docs

**Files:**
- Create: `e2e/tests/player.spec.ts`
- Modify: `web/package.json`, `web/src/main.ts`, csproj, `e2e/docker-compose.yml` (`Tide_0.4.0.0`), `docs/notes/web-12.4-player.md` (final verified selectors), `README.md` (feature list: player, episode page)

- [ ] **Step 1: Version.** Set the version to `0.4.0` in all four places listed in the Global Constraints. Deploy (see Commands). Confirm `GET /Plugins` shows `Tide 0.4.0.0 Active`.

- [ ] **Step 2: Write** `e2e/tests/player.spec.ts`:

```ts
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const CLIENT = 'MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1"';
const PLUGIN_ID = '7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c';
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

async function login(page: Page) {
  await page.goto('/web/');
  await page.waitForSelector('input[type=password]');
  await page.fill('input[type=text], #txtManualName', 'tide');
  await page.fill('input[type=password]', 'tide');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
}
async function auth(request: APIRequestContext) {
  const r = await request.post('/Users/AuthenticateByName', { headers: { Authorization: CLIENT }, data: { Username: 'tide', Pw: 'tide' } });
  const j = await r.json();
  return { headers: { Authorization: `${CLIENT}, Token="${j.AccessToken}"` }, userId: j.User.Id as string };
}
async function firstEpisode(request: APIRequestContext) {
  const a = await auth(request);
  const r = await request.get(`/Items?userId=${a.userId}&Recursive=true&IncludeItemTypes=Episode&SortBy=ParentIndexNumber,IndexNumber`, { headers: a.headers });
  return (await r.json()).Items[0].Id as string;
}
async function startPlayback(page: Page, id: string) {
  await page.goto(`/web/#/details?id=${id}`);
  await page.locator('#itemDetailPage:not(.hide) .tide-dh-primary').click();
  await page.waitForSelector('.tide-player .tide-pc', { timeout: 60_000 });
  await page.waitForFunction(() => { const v = document.querySelector('video'); return !!v && v.currentTime > 0.5; }, null, { timeout: 60_000 });
}

test('loading screen appears on play and fades when the video plays', async ({ page, request }) => {
  const id = await firstEpisode(request);
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await page.locator('#itemDetailPage:not(.hide) .tide-dh-primary').click();
  await expect(page.locator('.tide-ld.show')).toBeVisible();
  await expect(page.locator('.tide-ld-line')).toContainText('S1 · E1');
  await page.waitForFunction(() => { const v = document.querySelector('video'); return !!v && v.currentTime > 0.5; }, null, { timeout: 60_000 });
  await expect(page.locator('.tide-ld.show')).toHaveCount(0);
});

test('Tide controls replace the stock OSD and drive playback', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop controls');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  await expect(page.locator('#videoOsdPage.tide-taken .videoOsdBottom')).toHaveCSS('opacity', '0');
  await page.mouse.move(700, 450);
  await expect(page.locator('.tide-pc-ep')).toContainText('S1 · E1');
  await page.locator('.tide-pc-play').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.paused)).toBe(true);
  const t0 = await page.evaluate(() => document.querySelector('video')!.currentTime);
  await page.locator('.tide-pc-fw').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.currentTime)).toBeGreaterThan(t0 + 5);
  const track = await page.locator('.tide-pc-track').boundingBox();
  await page.mouse.click(track!.x + track!.width * 0.5, track!.y + track!.height / 2);
  await expect.poll(async () => page.evaluate(() => { const v = document.querySelector('video')!; return v.currentTime / v.duration; })).toBeGreaterThan(0.4);
});

test('controls hide after 3 s and come back on mouse move; paused screen after 4 s', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'mouse idle');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  await page.mouse.move(700, 450);
  await page.waitForTimeout(3600);
  await expect(page.locator('.tide-player.tide-pc-idle')).toHaveCount(1);
  await page.mouse.move(710, 460);
  await expect(page.locator('.tide-player.tide-pc-idle')).toHaveCount(0);
  await page.keyboard.press('k');
  await page.waitForTimeout(4400);
  await expect(page.locator('.tide-player.tide-pz-on')).toHaveCount(1);
  await expect(page.locator('.tide-pz-line')).toContainText('S1 · E1');
});

test('episodes shelf plays another episode; settings lists real streams', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  await page.mouse.move(700, 450);
  await page.keyboard.press('s');
  await expect(page.locator('.tide-pset.open')).toBeVisible();
  await expect(page.locator('.tide-pset [data-kind="audio"]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  await expect(page.locator('.tide-pshelf.open [data-id]').nth(1)).toBeVisible();
  await page.locator('.tide-pshelf.open .tide-wide').nth(1).click();
  await expect(page.locator('.tide-pc-ep')).toContainText('E2', { timeout: 60_000 });
});

test('countdown card appears at the credits and starts the next episode', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop');
  const a = await auth(request);
  const cfgUrl = `/Plugins/${PLUGIN_ID}/Configuration`;
  const original = await (await request.get(cfgUrl, { headers: a.headers })).json();
  await request.post(cfgUrl, { headers: a.headers, data: { ...original, CreditsFallbackSeconds: 10 } });
  try {
    const id = await firstEpisode(request);
    await login(page);
    await startPlayback(page, id);
    await page.evaluate(() => { const v = document.querySelector('video')!; v.currentTime = v.duration - 8; });
    await expect(page.locator('.tide-end.show')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.tide-end-cd')).toContainText('Next episode in');
    await expect(page.locator('.tide-pc-ep')).toContainText('E2', { timeout: 60_000 });
  } finally {
    await request.post(cfgUrl, { headers: (await auth(request)).headers, data: { ...original, CreditsFallbackSeconds: original.CreditsFallbackSeconds ?? 35 } });
  }
});

test('phone: double-tap right seeks forward', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  const t0 = await page.evaluate(() => document.querySelector('video')!.currentTime);
  const vp = page.viewportSize()!;
  await page.touchscreen.tap(vp.width * 0.85, vp.height / 2);
  await page.touchscreen.tap(vp.width * 0.85, vp.height / 2);
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.currentTime)).toBeGreaterThan(t0 + 5);
});

test('enablePlayer=false keeps the stock OSD', async ({ page, request }) => {
  const a = await auth(request);
  const cfgUrl = `/Plugins/${PLUGIN_ID}/Configuration`;
  const original = await (await request.get(cfgUrl, { headers: a.headers })).json();
  await request.post(cfgUrl, { headers: a.headers, data: { ...original, EnablePlayer: false } });
  try {
    const id = await firstEpisode(request);
    await login(page);
    await page.goto(`/web/#/details?id=${id}`);
    await page.locator('#itemDetailPage:not(.hide) .tide-dh-primary').click();
    await page.waitForSelector('#videoOsdPage:not(.hide)', { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await expect(page.locator('.tide-player')).toHaveCount(0);
  } finally {
    await request.post(cfgUrl, { headers: (await auth(request)).headers, data: { ...original, EnablePlayer: true } });
  }
});

test('episode detail page renders for an Episode id', async ({ page, request }) => {
  const id = await firstEpisode(request);
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('#itemDetailPage:not(.hide) .tide-dh-kick')).toContainText('SEASON 1 · EPISODE 1');
  await expect(page.locator('.tide-dh-back')).toBeVisible();
  await expect(page.locator('[data-id] .tide-wide-tag', { hasText: 'NOW VIEWING' })).toBeVisible();
});
```

- [ ] **Step 3: Run.** `cd e2e && npx playwright test`. Expected: every old test and every new test passes on both projects.
  - The `startPlayback` helper clicks `.tide-dh-primary`, which now exists on the episode page (Task 12).
  - If the countdown test's `currentTime` jump lands in an untranscoded region and stalls, raise its wait to 60 s rather than changing the behaviour.
  - Fix selector mismatches against the real 12.4 DOM (record any change in `docs/notes/web-12.4-player.md`); don't change the specified behaviour.

- [ ] **Step 4: Visual check.**
  - Take screenshots of the playing / paused / settings / shelf / end-card / loading states (a quick `page.screenshot` script like `v2-shots.mjs`). Compare them with the prototype.
  - Fix spacing and colour mismatches in `player.css`.
  - Confirm the stock OSD never shows on mouse move. If the stock OSD re-shows itself (12.4 toggles `videoOsdBottom-hidden`), extend the hide rule to `#videoOsdPage.tide-taken .videoOsdBottom:not(.tide-x)` with `visibility: hidden` as well.

- [ ] **Step 5: Full verification.** `./scripts/dotnet test Tide.slnx && (cd web && npm run typecheck && npm test && npm run build) && (cd e2e && npx playwright test)`. Expected: all green.

- [ ] **Step 6: Commit.**
```bash
git add e2e web server docs README.md
git commit -m "test: player + episode page e2e; bump to 0.4.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Manual checks before release

- **Jellyfin Desktop (mpv):**
  - Controls drive playback.
  - Loading shows the indeterminate ring.
  - Buffering shows the indeterminate circle.
  - The heart is solid red.
- **User's server with Intro Skipper:**
  - Skip intro appears during the intro and skips it.
  - Credits marks show on the bar.
  - The countdown starts at the detected outro.
- **Fast scrolling** on home is smooth (0.3.1 fix).
- **Play icons** inside rings point right (0.3.1 fix).
- **Android app** with the Web player setting: gestures work.
