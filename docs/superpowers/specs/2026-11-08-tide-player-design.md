# Tide 0.4.0: Player and episode page

**Date:** 2026-11-08
**Status:** Design approved in session. Pending written-spec review.
**Builds on:** `2026-11-08-tide-detail-page-design.md` (0.3.0).

**Site-wide rules that still apply:**
- Solid surfaces.
- Flat `#2a2a2e` badges.
- Favourite heart.
- Transform/opacity-only motion.
- Hero background system.
- No hover while scrolling.

**Interactive prototype:** `.superpowers/brainstorm/1768206-1794175749/content/player-proto.html`. It is local only and contains private library images. Every behaviour below can be tried there. Default switchers: E2, S3, Z4, N2, K1.

## 1. Goal

Replace the stock video player controls with a Tide control layer that matches the rest of the theme. Jellyfin's own player keeps doing the actual playback underneath, so codecs, transcoding, casting, Jellyfin Desktop (mpv) and keyboard shortcuts keep working.

The release also ships:
- **Episode detail page:** a single-episode version of the series page (§9).
- **Held 0.3.1 fixes:** the play-icon rotation and the scroll-jank fix, already committed on this branch (§10).

## 2. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Approach | **B**: Tide's own control layer over the hidden stock player |
| 2 | Layout | **L1** (Apple TV): logo + episode top-left; full-width scrubber with times; one row of buttons (details §4.2) |
| 3 | Episodes button | **E2**: shelf of detail-page episode cards rising above the scrubber; hover shows title + time, **no synopsis** |
| 4 | Settings button | **S3**: two-column bottom sheet: Audio \| Subtitles columns; Quality, Speed, Subtitle size as chips |
| 5 | Paused screen | **Z4**: after 4 s paused, poster + "You're watching" block (left), "Paused" (top-right), Up next card (bottom-right) |
| 6 | End of episode | **N2**: countdown card bottom-right; next episode after 10 s; "Watch credits" cancels |
| 7 | Skip intro | No own detection. Support the **Intro Skipper** plugin's media segments, only when that plugin is installed and active |
| 8 | Loading | **K1**: blurred backdrop, poster, logo, episode title, progress ring + 3 steps. No second spinner |
| 9 | Buffering | Control-style: solid `#2a2a2e` 76px circle, ring (track `#48484a`, white arc), % inside, solid "Buffering" pill below |
| 10 | Phone | **B**: compact L1 + touch gestures (§4.9) |
| 11 | Floating pills | Skip intro + countdown card stay visible when controls hide (low, bottom-right) and glide up above the controls when they show |
| 12 | Motion | Controls and pills: one curve `cubic-bezier(.22,1,.36,1)`; show .6s, hide .45s; transform + opacity only |

## 3. How it works (architecture)

Verified on the local 12.4 server (`jellyfin/jellyfin:12.4.20261026-211555`):

- **Player route and page:**
  - The route is `#/video`. The page is the legacy view `#videoOsdPage.page`.
  - The web player renders `<video>` inside `.videoPlayerContainer`.
  - Starting a transcoded stream took about 8 s before `#/video` appeared.
- **Stock OSD buttons (all clickable programmatically):**
  - `.btnPause`, `.btnRewind`, `.btnFastForward`
  - `.btnPreviousTrack`, `.btnNextTrack`
  - `.btnSubtitles`, `.btnAudio`
  - `.btnVideoOsdSettings`, `.btnFullscreen`, `.btnPip`, `.btnUserRating`
  - A mute button with no class (title "Mute (M)")
  - `.osdVolumeSlider`
- **Stock position slider:** `.osdPositionSlider` (`is="emby-slider"`, 0–100, step .01).
  - Setting `value` and dispatching `change` seeks. Confirmed: 60 → 31.3 s of 52.2 s.
- **Updates while hidden:** the slider and `.osdPositionText` keep updating while the stock OSD is hidden (opacity 0).

### 3.1 Units

| Unit | Responsibility |
|---|---|
| `web/src/player/bridge.ts` | The only code that touches the stock player. **Reads** position %, duration, paused, volume/muted, whether the web `<video>` exists. **Commands:** play/pause, seek(seconds), seekBy(±s), next/previous, mute/volume, fullscreen, pip, favourite. Emits a `state` event every animation frame while visible, and only when values change |
| `web/src/player/session.ts` | Polls `GET /Sessions?deviceId=<own>` every 2 s while the player is open. Provides: `NowPlayingItem` (id, type, series, season, index, runtime), `PlayState` (AudioStreamIndex, SubtitleStreamIndex, PlayMethod), `TranscodingInfo` (codecs, resolution, CompletionPercentage, TranscodeReasons) |
| `web/src/player/commands.ts` | Track and quality changes through `POST /Sessions/{own}/Command`: `SetAudioStreamIndex`, `SetSubtitleStreamIndex`, `SetMaxStreamingBitrate`, and playback rate when supported. **Fallback per setting:** open the stock dialog (`.btnAudio`, `.btnSubtitles`, `.btnVideoOsdSettings`), already themed. Plan task 1 probes which commands 12.4 honours; the result is recorded in `docs/notes/web-12.4-dom.md` |
| `web/src/player/segments.ts` | When `cfg.introSkipper`: `GET /MediaSegments/{itemId}`, giving Intro and Outro ranges. Otherwise Intro is none, and credits start = `duration − cfg.creditsFallbackSeconds` |
| `web/src/player/controls.ts` | L1 layout, scrubber (with trickplay thumbnail when the item has trickplay, else the episode still), button row, idle/show state, keyboard |
| `web/src/player/shelf.ts` | E2 episode shelf. Reuses `wideCard` episode mode with a new `{ synopsis: false }` option and `createScroller` |
| `web/src/player/settingsSheet.ts` | S3 sheet |
| `web/src/player/paused.ts` | Z4 paused screen |
| `web/src/player/endCard.ts` | N2 countdown card |
| `web/src/player/loading.ts` | K1 loading screen + buffering indicator |
| `web/src/player/touch.ts` | Phone gestures |
| `web/src/player/player.ts` + `player.css` | Mount/unmount and wiring; registers a `Takeover` (`id: 'player'`) |

### 3.2 Mount

- **When it applies:** the takeover matches `#/video` when `cfg.enablePlayer !== false`.
- **Host:** the visible `#videoOsdPage:not(.hide)`.
- **Mount:**
  - Adds `.tide-player` as the host's first child.
  - Adds `tide-taken` to the host.
  - CSS hides the stock OSD visually but keeps it in the DOM and running: `#videoOsdPage.tide-taken :is(.videoOsdBottom, .skinHeader, .upNextContainer, .osdLockButton) { opacity: 0 !important; pointer-events: none !important; }`.
- **Unmount** restores the host.

### 3.3 Rules

- **Never rebuild animated nodes per frame:** build once per item, then update text and attributes only. In the prototype, rebuilding killed the transitions.
- **Pointer events:**
  - Invisible pieces (paused screen, end card while hidden) get `pointer-events: none`.
  - Only visible interactive parts take clicks.
  - The prototype bug this prevents: an invisible Up next card swallowed the settings button.
- **Desktop app:** if no web `<video>` exists (Jellyfin Desktop/mpv), everything still works from the stock slider and buttons. The buffer % becomes indeterminate.

## 4. The control layer

### 4.1 Idle

- **Show the controls on:** pointer move, any key, or a tap (phone).
- **Hide after:** 3 s without input while playing.
- **Never hide while:** paused, a sheet is open, or the pointer is over the controls.
- `html` gets `tide-player-idle` while hidden; the cursor hides too.

### 4.2 Layout (L1)

**Top left:**
- Series (or movie) logo, 54px tall. Fallback: title text 34px/800.
- Line under it: `S3 · E1 · Who Are You?`, 17px/600.

**Shades:** top 26%, bottom 55%. Both are gradients over the video, and they fade with the controls.

**Bottom:**
- **Scrubber:** full width, 6px, grows to 8px on hover.
  - Buffered range: white .35.
  - Played: white.
  - Intro and credits segments: `#ffd60a` marks, drawn above the played fill.
  - Knob: 18px, appears on hover or drag.
  - Hover tooltip: time + thumbnail 160×90.
- **Times:** elapsed on the left, `−remaining` on the right.
- **Row, left:**
  - Play/pause: white 52px circle.
  - −10 s, +10 s.
  - Volume: hover reveals a 100px slider.
- **Row, right:**
  - `Episodes` pill (series only).
  - `Next episode` pill (when there is a next one).
  - Subtitles: quick toggle. Click cycles Off ↔ last-used language; long-press opens the S3 sheet.
  - Settings opens S3.
  - Cast: opens the stock cast picker, `.btnCast` from the app bar or `.btnAirPlay`. Hidden when unavailable.
  - Fullscreen.

**Buttons:** 52px solid `#2a2a2e` circles; hover `#3a3a3c` + scale 1.06; press scale .94.

### 4.3 Skip intro

- **What:** white pill `⏩ Skip intro`, 48px tall, bottom-right.
- **When:** shown while the position is inside the Intro segment. Click seeks to the segment end.
- **Position:**
  - With the controls hidden it sits at `bottom: 44px`.
  - With the controls shown it lifts by `--lift: -132px` (phone `-84px`) via `transform`, same curve.
  - When dropping back, it follows the controls with a .08 s delay.

### 4.4 Episodes shelf (E2)

**Opening and closing:**
- Opens with the `Episodes` pill, key `E`, or a swipe up on phone.
- It rises above the scrubber (opacity + translateY) and the bottom shade darkens.
- The video keeps playing.
- Closes with Esc, the pill again, or a click outside.

**Contents:**
- Season dropdown: the P1 menu from the detail page, plus an episode count.
- One row of 330px home-style episode cards (wideCard episode mode, `synopsis: false`):
  - Current episode: `NOW PLAYING` tag + progress ring.
  - Watched episodes: ✓.
  - Clicking a card plays it in place via `play(id)`. The player swaps to that episode.

### 4.5 Settings (S3)

**Sheet:** a solid `#141416` sheet over the bottom of the video (radius 24px), in three columns.

- **Audio:** list of the item's audio streams (DisplayTitle; second line codec/channels), ✓ on the current one.
- **Subtitles:** `Off` + subtitle streams (`(SDH)` / `Forced` noted), ✓ on the current one.
- **Right column:**
  - **Quality chips:**
    - `Auto`, `4K`, `1080p`, `720p`, `480p`; only those ≤ the source resolution.
    - `Auto` means max bitrate. The chips map to bitrates 120 / 20 / 8 / 3 Mbps.
  - **Speed chips:** 0.5× 0.75× 1× 1.25× 1.5× 2×.
  - **Subtitle size chips:** S M L XL, mapped to Jellyfin's subtitle appearance setting when available; otherwise the Tide CSS scale for rendered subs.

**Behaviour:**
- Picking an option applies it (§3.1 commands) and leaves the sheet open.
- Esc, the button or a click outside closes it.
- Opening the sheet dims the video to `brightness(.55)`.

### 4.6 Paused screen (Z4)

**Trigger:** after **4 s** paused, with no sheet open and the pointer still. The controls fade out and the video dims to `brightness(.45)`, with a left gradient.

**Content:**
- **Left block**, about 112px from the left, vertically centred:
  - Poster: 2:3, 210px, radius 18px. Series poster for episodes, item poster for movies.
  - "YOU'RE WATCHING" kicker.
  - Logo (64px tall).
  - `S3 · E1 · Title`, 22px/700.
  - Meta line: year · runtime · `Nm left` · rating chip.
  - Synopsis, 17px.
- **Top right:** pause icon + "Paused" (15px, `#a1a1a6`).
- **Bottom right:** Up next card.
  - Solid `#141416`, 330px: thumbnail, `UP NEXT`, `2. Title`, runtime.
  - Clicking it plays the next episode.
  - Hovering it does not dismiss the screen.
- **Hidden** when the countdown card (§4.7) is showing.

**Dismiss:** any key, tap or pointer move. Resuming playback also dismisses it.

### 4.7 End of episode (N2)

**Credits start:** the start of the Outro segment, or `duration − creditsFallbackSeconds` (default 35).

**When it shows:** only if there is a next episode and the user hasn't dismissed it.

**Countdown card** (bottom right, same lift rule as Skip intro):
- Solid `#141416`, 380px.
- 140px still with a ring countdown (`r=20`, 10 s) around ▶.
- `Next episode in Ns`.
- `2. Title`.
- Runtime.
- `Watch credits`.

**Behaviour:**
- **Countdown:** runs only while playing, and only when the user's Jellyfin setting `EnableNextEpisodeAutoPlay` is on. When it's off, the card shows `Up next` without a ring and doesn't autoplay.
- At 0 the next episode plays.
- `Watch credits` dismisses the card for this episode.
- The card is built once; only the number and the ring change.

### 4.8 Loading (K1) and buffering

**Loading screen (K1)** covers the player from the first frame until video is playing.

- **Start:**
  - It starts immediately when Tide's `play()` is called: a `body`-level overlay, because the route change can take seconds.
  - Otherwise it starts when `#/video` appears before playback starts.
- **Layout:**
  - Backdrop blurred (24px, brightness .35).
  - Poster 190px.
  - Logo.
  - `S3 · E1 · Title`.
  - Progress ring: 92px, stroke 4, track white .16, white arc.
  - Three steps (icon + text; done = `#a1a1a6` + ✓, current = white, upcoming = `#6e6e73`):
    1. `Connecting to server`
    2. `Preparing stream · {source} → {target}`: only when transcoding, from `TranscodingInfo`. Otherwise the step reads `Starting stream`.
    3. `Buffering`
- **Progress %:**
  - Steps 1–2: 0–70%, from elapsed requests and transcode `CompletionPercentage`.
  - Step 3: 70–100%, from `video.buffered` ahead of `currentTime` versus a 10 s target.
  - Without a web `<video>`: the arc rotates (indeterminate) and no % is shown.
- **End:** fades out (.6 s) when the video reports `playing`.

**Buffering during playback:**
- Starts on `waiting` or `stalled`, and only after 400 ms (avoids flicker).
- **Indicator:**
  - Centred 76px solid `#2a2a2e` circle.
  - 64px ring inside (track `#48484a`, white arc).
  - % = buffered-ahead versus 5 s.
  - "Buffering" pill below.
- Hides on `playing`.
- Without a web `<video>`: same circle with a rotating arc and no %.

### 4.9 Phone (≤ 699px wide or coarse pointer)

- **Layout:** compact L1.
  - Logo 26px, edges 22px.
  - Buttons 44px.
  - Volume, cast and ±10 buttons are hidden.
- **Centre controls:** −10, play/pause (72px), +10 on dark circles. Hidden while a sheet or the end card is open.
- **Gestures:**
  - Tap toggles the controls.
  - Double-tap the left or right 38% seeks ∓10 s, with a ripple ("−10 s"/"+10 s").
  - Double-tap the centre toggles play.
  - Swipe up (>60px) on the video opens the shelf.
- **Sheets:**
  - Shelf cards are 220px.
  - S3 becomes a full-width bottom sheet (two columns, the third below), with max height 78%.
- **Scaled down for phone:** paused screen poster 110px; end card 320px; loading poster 110px.

### 4.10 Keyboard

| Key | Action |
|---|---|
| Space / K | Play/pause |
| ← / J | −10 s |
| → / L | +10 s |
| E | Episodes |
| S | Settings |
| F | Fullscreen |
| M | Mute |
| N | Next episode |
| Esc | Close sheet / paused screen |

Stock shortcuts are not intercepted unless listed here.

## 5. Server

- **`PluginConfiguration` additions:**
  - `EnablePlayer` (default `true`).
  - `CreditsFallbackSeconds` (default `35`, clamp 0–300).
- **ClientConfig additions:**
  - `enablePlayer`, `creditsFallbackSeconds`.
  - `introSkipper`: `true` when a plugin named "Intro Skipper" (or the known id `c83d86bb-a1e0-4c35-a113-e2101cf4ee6b`) is installed with status Active, via `IPluginManager.Plugins`.
- **Config page:**
  - Checkbox "Tide player".
  - Number "Credits start (seconds before the end) when Intro Skipper is not installed".

## 6. Errors and fallbacks

- **Mount fails** (stock OSD not found within 5 s): leave the stock player and show the admin toast once (same latch as other takeovers).
- **A command is not honoured within 1.5 s** (state unchanged): use that setting's stock-dialog fallback.
- **Session poll fails:** keep controls working from the bridge; hide the shelf, settings lists and steps that need session data.
- **`/MediaSegments` fails:** no Skip intro; credits use the fallback.

## 7. Episode detail page

Approved mockup: `.superpowers/brainstorm/.../detail-episode.html`.

**Takeover:** `Episode` items now take over too. `mountDetails` handles `Type === 'Episode'`.

**Changes from the series page:**
- **Left column:** a 16:9 episode still (520px wide, radius 22px, deep shadow) with a progress line, instead of the 2:3 poster.
  - Header grid: `520px minmax(0,1fr)`.
- **Title block:**
  - Series logo (70px).
  - Kicker `SEASON 3 · EPISODE 1`.
  - Episode title (40px/800).
  - Meta: air date (month year) · runtime · ★ · rating chip · quality badge · `ends at HH:MM` (local time if started now, or remaining time if partly watched).
  - Synopsis.
- **Buttons:** Resume/Play (ring), ♥, ✓, ⋯. No Trailer.
- **Next episode strip:** same as the N2 strip style, kicker `NEXT EPISODE · S3 E2`. It plays the following episode, and is hidden for the last episode.
- **Back link:** `← {Series} · all seasons` (goes to the series page).
- **Sections:**
  - "More from Season N": P1 episode row with the dropdown, this season selected, this episode tagged `NOW VIEWING`, scrolled to it.
  - Cast & crew: the episode's People (guest stars included).
  - Details:
    - About: Directed by, Written by, Aired, Rating, Season, Runtime.
    - Your file: this episode's file.
  - **No More like this.**
- **Background:** hero background system from the episode's series backdrop.

## 8. Out of scope

- Own intro/credits detection.
- Chapter list UI.
- Picture-in-picture styling.
- Live TV / music player.
- Native Android player (Tide's player only applies when the Android app uses its Web player).

## 9. Bundled fixes (already on branch `feat/player`)

- **Play icon rotation:** the play icon inside progress rings was rotated. The ring rules are scoped to the ring's own `svg`.
- **Scroll jank:**
  - `html.tide-is-scrolling` disables pointer events on cards until 180 ms after the last scroll.
  - Cards no longer get `translateZ(0)`.
  - Measured: 132 → 0 hover transitions per fling; 90 → 42 layers on home.

## 10. Testing

- **vitest:**
  - Bridge: reads the slider/text/button state; seek sets slider + dispatches `change`; seekBy clamps.
  - Session parsing; command fallbacks (timeout → dialog).
  - Segments: Intro Skipper on/off, fallback credits.
  - Idle timer.
  - Lift classes for pills.
  - Paused screen: 4 s timer; hidden when the end card shows; Up next hover doesn't dismiss.
  - End card: countdown only while playing and with autoplay on; "Watch credits" dismisses; built once.
  - Loading: step/percent mapping; indeterminate without `<video>`.
  - Buffering: 400 ms delay.
  - Touch: tap, double-tap zones, swipe up.
  - Keyboard map.
  - Shelf: synopsis hidden; clicking plays.
  - Episode detail page rules.
- **xUnit:** `EnablePlayer`, `CreditsFallbackSeconds` clamp, `introSkipper` detection with a fake plugin manager.
- **Playwright (local 12.4):**
  - Playing an episode shows `.tide-player` and hides the stock OSD.
  - Play/pause and ±10 s change `<video>` time.
  - Scrubber click seeks.
  - Controls hide after 3 s and come back on mouse move.
  - Pause 4 s shows the paused screen.
  - Episodes shelf opens and plays another episode.
  - Settings sheet lists the real audio/subtitle streams.
  - Loading overlay appears on play and fades when playing.
  - With a fake Outro near the end (fallback seconds), the countdown card appears and starts the next episode.
  - Phone project: double-tap seeks.
  - `enablePlayer=false` keeps the stock OSD.
  - Episode detail page renders for an Episode id.
- **Manual:** Jellyfin Desktop (mpv) control + indeterminate loading; Intro Skipper installed on the user's server (Skip intro, credits).
