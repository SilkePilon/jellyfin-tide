# jellyfin-web 12.4: stock video player facts (probed)

Probed on `jellyfin/jellyfin:12.4.20261026-211555` with `e2e/probe-player.mjs`. Fixture: `Blender Shorts S01E01.mkv`, which has two audio tracks (eng, dut) and `.en.srt`.

## DOM

**Route and page**
- Route: `#/video`.
- Page: legacy view `#videoOsdPage.page`. Inactive cached views get `.hide`.

**Video**
- The web player renders `<video>` inside `.videoPlayerContainer`.
- Jellyfin Desktop (mpv) has no `<video>`.

**Stock OSD buttons** (all `.click()`-able):
- `.btnPause`, `.btnRewind`, `.btnFastForward`
- `.btnPreviousTrack`, `.btnNextTrack`
- `.btnSubtitles`, `.btnAudio`, `.btnVideoOsdSettings`
- `.btnFullscreen`, `.btnPip`, `.btnUserRating`, `.btnAirPlay`
- A mute button with `title="Mute (M)"`.
- `.btnAudio` and `.btnSubtitles` are hidden when there is only one choice.

**Sliders and text**
- `.osdPositionSlider`: `emby-slider`, 0–100 %, step .01.
  - Setting `value` and dispatching `change` seeks (60 → 31.3 s of 52.2 s).
  - It keeps updating while the OSD is hidden (opacity 0).
- `.osdVolumeSlider`, `.osdPositionText`, `.osdDurationText`.

**Bottom bar state:** `.videoOsdBottom` gets `videoOsdBottom-hidden` when idle.

**Startup time:** a transcoded stream took about 8 s from pressing play to `#/video`.

## Session commands (`POST /Sessions/{own}/Command`)

| Command | HTTP | Honoured | Notes |
|---|---|---|---|
| `SetAudioStreamIndex` `{Index}` | 204 | **yes** | Session `PlayState.AudioStreamIndex` updates only with the next progress report (up to ~10 s later) |
| `SetSubtitleStreamIndex` `{Index}` | 204 | **yes** | Same delay |
| `SetMaxStreamingBitrate` `{MaxBitrate}` | 204 | yes | |
| `SetPlaybackRate` | **400** | no | Not a general command in 12.4. Set `video.playbackRate` directly (web), or open the stock settings dialog (desktop) |

**Consequence for `player/commands.ts`:**
- **No confirm timeout.** The session reflects a change too late (up to ~10 s), so a 1.5 s confirm would always fall back.
- **Apply optimistically.** POST the command and show the new choice as current right away.
- **Fall back** to the stock dialog only when the POST fails.

## Session fields

- `PlayState`: PositionTicks, CanSeek, IsPaused, IsMuted, VolumeLevel, AudioStreamIndex, SubtitleStreamIndex (−1 = off), MediaSourceId, PlayMethod, RepeatMode, PlaybackOrder.
- `TranscodingInfo`: AudioCodec, VideoCodec, Container, IsVideoDirect, IsAudioDirect, Bitrate, Framerate, CompletionPercentage, Width, Height, AudioChannels, HardwareAccelerationType, TranscodeReasons.
- `NowPlayingItem` includes `MediaStreams`.

## Media segments

`GET /MediaSegments/{itemId}` returns 200 (empty `Items` without a segment provider). Intro Skipper fills it with `Intro` / `Outro` segments.

## Stock settings sheet (probed for 0.5.0)

**Opening and reading**
- `.btnVideoOsdSettings` opens `.dialogContainer .actionSheet.opened`, with items `[data-id]` (`.actionSheetItemText`, `.actionSheetItemAsideText`).
- Main rows on web: `aspectratio` (Auto), `playbackrate` (1x), `quality` ("Auto 420 kbps"), `repeatmode` (None), `suboffset`, `stats`.
- A submenu marks the current option with a visible `.actionsheetMenuItemIcon`; the others have `visibility:hidden`.
- Web speeds are 0.5–4x. Jellyfin Desktop builds its aspect ratios from `jmpInfo.settingsDescriptions.video.aspect`, so it has more than web's Auto / Cover / Fill.

**Closing**
- Opening a sheet adds `dialogs` to `history.state.usr`.
- **Escape, backdrop clicks and outside clicks do not close it.** `history.back()` closes the newest sheet and stays on `#/video`.
- Clicking an item closes its sheet (a submenu replaces the main sheet).

**Subtitle offset**
- `suboffset` shows `.subtitleSync`, containing `.subtitleSyncSlider` (`emby-slider`, min -30, max 30, step 0.1) and `.subtitleSyncTextField` ("1.5s").
- Setting `value` and dispatching `input` and `change` applies the offset, also while the panel is hidden.
- `.subtitleSync-closeButton` hides the panel; the value stays.
