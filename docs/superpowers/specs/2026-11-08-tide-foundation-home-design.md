# Tide — Foundation + Home (Spec 1)

**Date:** 2026-11-08
**Status:** Approved in design session, pending written-spec review
**Working name:** Tide (placeholder, can be renamed before first release)

## 1. Goal

A Jellyfin server plugin that gives the web interface a modern streaming-app look, inspired by
[Abyss](https://aumgupta.github.io/abyss-jellyfin/) but fully overhauled. The feel is Apple TV+: calm, premium,
solid surfaces. No frosted glass and no see-through UI.

Spec 1 covers the **foundation** (plugin shell, design system, global restyle, icons, nav) and the **Home screen**.
Every other screen gets its own design session and spec later (section 11).

### Target clients

| Client | Covered | Why |
|---|---|---|
| Jellyfin Desktop (main client) | Yes | Runs jellyfin-web |
| Browser | Yes | jellyfin-web |
| Android official app | Yes | Loads jellyfin-web from the server |
| Android TV / TV layout | No | Separate layout |
| Swiftfin (iOS native) | No | Native, cannot be themed |

### Platform constraints

- Jellyfin **12.4+** (user's server: 12.4.0). Plugins target **.NET 10**.
- Web **Modern layout only** (the 12.x default). Legacy layout is unsupported.
- Modern layout is **React + MUI** (bundles `@mui/material`, `@mui/icons-material`, `@tanstack/react-query`, `@jellyfin/sdk`).

## 2. Decisions log

| # | Topic | Decision |
|---|---|---|
| 1 | Clients | Desktop app (main), Android app, browser |
| 2 | Style | Apple TV+ calm and premium |
| 3 | Accent | Monochrome: white primary, black text on it |
| 4 | Delivery | Server plugin, not Custom CSS |
| 5 | Home layout | Hero spotlight (full-bleed featured title, rows below) |
| 6 | Scope | All screens incl. admin dashboard, designed one by one |
| 7 | Web layout | Modern only |
| 8 | Font | Inter (bundled) |
| 9 | Icons | Material Symbols Rounded, chunky filled (FILL 1, wght 600, GRAD 100) |
| 10 | Poster card | "Rich poster" (v4): quality + status badges on the poster, hover lift + actions |
| 11 | Under-card text | Title + one grey line only (year · genre · runtime/seasons) |
| 12 | Poster overlays | No title/logo overlay (posters already print titles). Ratings only on hover |
| 13 | Hero content | Smart mix: resume/next-up, newly added, top-rated unwatched |
| 14 | Hero behaviour | H3: rotation + muted trailer |
| 15 | "Why featured" | W2: woven into content (no label above logo) |
| 16 | Hero queue | T3: logo strip with progress line |
| 17 | Home rows | All 10 row types; users can reorder + hide per profile |
| 18 | Desktop nav | N1: top bar with pills |
| 19 | Architecture | Self-contained plugin (C# + TypeScript), File Transformation optional |
| 20 | Hosting | GitHub repo + Releases + plugin repository manifest |

Mockups of the chosen designs are kept outside the public repo (they embed images from a private library).

## 3. Architecture

```
┌──────────────────────── Jellyfin Server 12.4 ────────────────────────┐
│  Tide plugin (C#, .NET 10)                                           │
│   ├─ ScriptInjector     adds <script src="/Tide/client.js"> to web   │
│   ├─ AssetController    /Tide/client.js, /Tide/theme.css, fonts      │
│   ├─ HomeController     GET /Tide/Home (hero + prefs + config)       │
│   ├─ QualityController  POST /Tide/Quality (batched badges)          │
│   ├─ PrefsController    GET/PUT /Tide/UserPrefs                      │
│   └─ Config page        Dashboard › Plugins › Tide                   │
└──────────────────────────────────────────────────────────────────────┘
            ▲ same auth token as the logged-in web session
┌──────────────────────── jellyfin-web (Modern, React+MUI) ────────────┐
│  Tide client bundle (TypeScript, Vite, no UI framework)              │
│   ├─ theme/        tokens + global restyle (body.tide scope)         │
│   ├─ icons/        MUI SVG + material-icons font → Material Symbols  │
│   ├─ router-hook/  detect route changes, mount/unmount Tide screens  │
│   ├─ home/         hero, row engine, cards, Edit-home panel          │
│   └─ api/          thin client on the session's token                │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 Server plugin

- **ScriptInjector.** If the File Transformation plugin is installed, register a transformation for `index.html`.
  Otherwise patch `index.html` in the web directory on startup, using marker comments so the edit is idempotent.
  The patch is removed on plugin uninstall or disable. Inject exactly one `<script defer>` tag plus one
  `<link rel="stylesheet">` tag.
- **AssetController.** Serves the embedded web build (JS, CSS, Inter woff2, Material Symbols Rounded woff2)
  with long cache headers. URLs carry a content hash. No external CDNs at runtime.
- **HomeController.** `GET /Tide/Home` returns `{ hero: HeroItem[], prefs: UserPrefs, config: PublicConfig }`.
- **QualityController.** `POST /Tide/Quality { ids: string[] }` (max 100 IDs) returns `{ [id]: Quality }`.
- **PrefsController.** `GET/PUT /Tide/UserPrefs` for the current user only. Stored in plugin data per user ID.
- **Config page** (admin):
  - toggles: theme, icons, home takeover, trailers
  - hero slot length (default 30 s) and hero size (default 6)
  - default row order and visibility
  - NEW window (default 14 days)
- All endpoints require an authenticated user (`[Authorize]`). Config writes require admin.

### 3.2 Web bundle

- Boots after jellyfin-web's `ApiClient` exists (poll ≤ 10 s, then give up silently).
- Adds `body.tide`. Every Tide CSS rule is scoped under it, so turning Tide off is instant.
- `router-hook` listens to history changes. On `/home` it hides stock home content and mounts Tide Home into the
  page container. On leave it unmounts and cleans up timers and iframes.
- Uses no React. Tide renders plain DOM into its own containers so it never fights jellyfin-web's React tree.

## 4. Design system

### 4.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--tide-bg` | `#000` | Page |
| `--tide-s1` | `#141416` | Panels, cards |
| `--tide-s2` | `#1d1d20` | Inputs, chips |
| `--tide-s3` | `#2a2a2e` | Secondary buttons |
| `--tide-line` | `#2c2c2e` | Borders |
| `--tide-tx` | `#f5f5f7` | Text |
| `--tide-mu` | `#a1a1a6` | Secondary text |
| `--tide-di` | `#6e6e73` | Dim text |
| `--tide-ac` | `#fff` | Primary button / active pill (text `#000`) |
| `--tide-star` | `#ffd60a` | Community rating |
| `--tide-critic` | `#ff6b5a` | Critic rating |
| `--tide-hdr` | `linear-gradient(90deg,#ffd60a,#ff9f0a)` | HDR segment of quality badge |
| `--tide-fav` | `#ff375f` | Favourite heart |

The only gradients are the shades over images (hero, posters). No `backdrop-filter`, and no translucent panels or
surfaces.

### 4.2 Type, shape, spacing, motion

- **Font:** Inter 400–900, bundled.
- **Type scale:**
  - row title 20/700, tracking −1.5%
  - card title 14/600
  - sub-line 12/400 in `--tide-mu`
  - hero meta 14/500
  - hero fallback title Inter 900
- **Radius:** cards 14, buttons 14, chips 7, pills/round buttons full.
- **Grid:** 8 px spacing. Gutter 56 px desktop, 16 px phone.
- **Easing:** `cubic-bezier(.2,.8,.2,1)`.
- **Hover lift:** 350 ms, `translateY(-6px) scale(1.04)`, 3 px white ring.
- **Crossfade:** 1.1 s.
- **`prefers-reduced-motion`:** no Ken Burns, no trailer autoplay, no lift; crossfades only.

### 4.3 Icons

- Material Symbols Rounded, `'FILL' 1, 'wght' 600, 'GRAD' 100, 'opsz' 24`.
- **MUI SVG icons:** match on `data-testid` (e.g. `HomeIcon`) and replace them with a ligature span. The mapping
  table lives in `icons/map.ts`.
- **Legacy `material-icons` font spans:** switch the font family and remap names that differ.
- A `MutationObserver` handles icons added later. Unmapped icons keep their stock look.

### 4.4 Components

- **Buttons:** primary (white), secondary (`--tide-s3`), round icon button 38–48 px.
- **Chip:** e.g. `NEW`, `NEW EPISODE`; white or `--tide-s2` variant.
- **Quality badge:** one joined pill: `res` (white) | `codec` (dark) | `HDR` (gold, omitted for SDR) | `audio` (dark).
  On posters only `res | codec` is shown.
- **Progress bar:** 4 px, white on 25% white track.
- **Rich poster card (v4):**
  - resting state:
    - top-left: `NEW` (added ≤ N days) and the `res | codec` badge
    - top-right: unwatched count / watched ✓ / ♥ favourite
    - bottom: progress bar if partially watched
  - hover/focus: lift + ring; ★ + critic chips and actions (Play, Watched, Favourite, More) slide in
  - under the card: title plus one grey line
- **Landscape continue card:** 16:9 episode/backdrop image, series logo bottom-left, progress bar, hover play button.
  Under it: title, `S1 · E6 · Name · 32m left`.
- **Square card:** albums. **Round card:** artists.
- **Row header:** title + chevron (links to the library view). Arrow buttons on desktop.
- **Top nav (N1):**
  - logo, library pills (active = white pill), search, cast, settings, avatar
  - transparent over the hero, solid `#000` once scrolled past 80 px (a solid colour, not translucent)

### 4.5 Phone (< 700 px, Android app)

- **Bottom tab bar:** Home, Movies, Shows, Search. Solid `--tide-s1`, active item gets a white pill behind its icon.
- **Hero:** full-width backdrop at 3:4 crop, logo, Play + Watchlist. The T3 strip shrinks to dots. Trailers are
  disabled when `navigator.connection.saveData` is true or `effectiveType` is below `4g`.
- **Rows:** horizontal swipe, no arrows.
- **Hover actions:** move to long-press (500 ms).
- **Touch targets:** ≥ 44 px.

## 5. Home screen

### 5.1 Hero

**Selection (server).** Up to `heroSize` (default 6) items:

- 2 × resume/next-up for the current user (`Resume` then `NextUp`, series de-duplicated)
- 2 × newest `Movie`/`Series` by `DateCreated` that are not fully played
- 2 × highest `CommunityRating` with zero plays (items with a logo rank before items without)

Rules:
- De-duplicate by series ID.
- A source with too few items is topped up from the next source.
- Items without a backdrop are skipped.

**HeroItem shape:**

```ts
type HeroItem = {
  id: string; type: 'Movie' | 'Series';
  reason: 'resume' | 'nextEpisode' | 'newEpisode' | 'new' | 'topRated';
  name: string; year: number; genres: string[]; officialRating?: string;
  communityRating?: number; criticRating?: number;
  runtimeMinutes?: number; seasonCount?: number;
  overview: string;
  episode?: { id: string; season: number; number: number; name: string };
  progress?: { percent: number; minutesLeft: number };
  quality?: Quality;            // from playable item (movie or target episode)
  images: { backdrop: string; logo?: string };
  trailers: { kind: 'local'; itemId: string }[] | { kind: 'youtube'; videoId: string }[];
  playTargetId: string;         // movie id or episode id
};
```

**Rendering ("why" woven in, W2):**

| Reason | Shown as |
|---|---|
| `resume` | Button "Resume" + progress bar + "52m left" |
| `nextEpisode` | Episode line `S1 · E6 "Name"` + button "Play S1 E6" |
| `newEpisode` | `NEW EPISODE` chip before the episode line |
| `new` | `NEW` chip at the start of the meta line |
| `topRated` | Nothing extra (★ in the meta line) |

There is no label above the logo.

**Slide layout:**
- logo (≤ 440×170, else the name in Inter 900)
- meta line: ★, critic, year, genres, runtime or seasons, rating box, full quality badge
- episode line, if any
- synopsis, 3 lines
- buttons: Play/Resume (white), More info, Watchlist (+), Favourite (♥)

**Behaviour (H3):**
- 3 s after a slide shows, the trailer starts: the first local trailer, else
  `youtube-nocookie.com/embed/{id}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&enablejsapi=1`.
- Fade in over 1.4 s once the video has loaded. Then the logo scales to 0.72 and the synopsis collapses.
- Trailer fails to load (error event or no playback within 6 s): try the next trailer ID. With none left, keep the
  backdrop with Ken Burns (scale 1.0 → 1.1 over 30 s).
- Mute toggle top-right, global for the session.
- Next slide when the clip ends or after `heroSlotSeconds` (default 30).
- Rotation pauses when the tab is hidden and when the hero is out of view.

**Queue (T3):**
- logo strip bottom-right
- inactive logos greyscale at brightness .45; the active one is full colour and larger
- 3 px progress line under each, filling over the slot length
- click jumps to that slide
- falls back to name text when a title has no logo

### 5.2 Rows

| # | Row | Source | Card |
|---|---|---|---|
| 1 | Continue Watching | `/UserItems/Resume` (Video) | Landscape |
| 2 | Next Up | `/Shows/NextUp` | Landscape |
| 3 | Recently Added Movies | `/Items?IncludeItemTypes=Movie&SortBy=DateCreated` | Poster |
| 4 | Recently Added Shows | `/Items?IncludeItemTypes=Series&SortBy=DateLastContentAdded` | Poster |
| 5 | Because you watched X | `/Items/{lastPlayed}/Similar` | Poster |
| 6 | Top rated, not watched yet | `/Items?IsPlayed=false&SortBy=CommunityRating` | Poster |
| 7 | Genre rows (×3) | `/Items?Genres=…` (fixed or random per visit) | Poster |
| 8 | Watchlist / Favourites | `/Items?IsFavorite=true` | Poster |
| 9 | Something different | `/Items?IsPlayed=false&SortBy=Random` | Poster |
| 10 | Collections | `/Items?IncludeItemTypes=BoxSet` | Poster |
| 11 | Music: recent albums / artists | `/Items?IncludeItemTypes=MusicAlbum&SortBy=DateCreated`, `/Artists` | Square / round |

(Music counts as one "row type" with two rows.)

- Rows load lazily: an `IntersectionObserver` triggers 600 px before a row enters the viewport.
- 20 items per row.
- After each row loads, one `POST /Tide/Quality` call fetches badges for its items.
- An empty result hides the row.
- A row that errors shows "Couldn't load · Retry" in place.

### 5.3 Edit home

- An "Edit home" button at the bottom of Home opens a solid side panel (`--tide-s1`). It contains:
  - a list of all rows with a drag handle and a visibility toggle
  - for genre rows, a genre picker or "Random"
  - "Reset to default"
- Saves to `PUT /Tide/UserPrefs` and re-renders Home without a reload.
- Defaults come from the admin config. A user who has never edited follows admin changes.

### 5.4 Quality mapping (server)

| Field | Rule |
|---|---|
| `res` | width ≥ 3800 → `4K`; ≥ 1900 → `1080p`; ≥ 1260 → `720p`; else `SD` |
| `codec` | `hevc`→`HEVC`, `av1`→`AV1`, `h264`→`H.264`, `vc1`→`VC-1`, `mpeg2video`→`MPEG-2`, else uppercase |
| `range` | `VideoRangeType` starting `DOVI` → `DV`; `HDR10`, `HDR10Plus`→`HDR10+`, `HLG`; `SDR` → omitted |
| `audio` | first default audio stream: profile contains `Atmos` → `Atmos`; else channels 8→`7.1`, 6→`5.1`, 2→`Stereo` |
| Series | use the next-up episode; else the latest episode |
| Multiple versions | use the highest resolution source |

Cached per item ID and invalidated on the library `ItemUpdated` event.

## 6. Data flow and auth

- **Requests:** the client reads the server address and token from jellyfin-web's `ApiClient` and sends
  `Authorization: MediaBrowser Token="…"` (the `api_key` query parameter is rejected by 12.x).
- **Images:** load via `/Items/{id}/Images/{type}` with `maxWidth` sized to the card (posters 500, backdrops
  1920/400, logos 800/260).
- **Actions:** Play, Watched, Favourite and Watchlist use stock endpoints. Play calls jellyfin-web's own playback
  manager, so the stock player opens.

## 7. Error handling and compatibility

| Failure | Behaviour |
|---|---|
| Row request fails | Inline "Couldn't load · Retry"; other rows unaffected |
| `/Tide/Home` fails | Hero uses the first Continue Watching item's backdrop; rows use admin defaults |
| Trailer blocked or missing | Next trailer, then still backdrop with Ken Burns |
| Missing logo | Name in Inter 900 |
| Missing backdrop | Blurred poster image (image treatment, not UI transparency) |
| Selector not found / unknown web version | Disable home takeover and icon swap, keep colour theme; one-time admin toast "Tide not verified for web X.Y" |
| `ApiClient` not found in 10 s | Tide does nothing; stock UI untouched |

- All network calls time out after 10 s.
- Tide never blocks stock UI boot.
- The plugin manifest sets `targetAbi` to 12.4, so older servers don't offer it.

## 8. Testing

- **Server (xUnit):**
  - hero selection: mix, de-duplication, topping up, cap, missing backdrop skipped
  - quality mapping table, including DOVI variants, Atmos, series → next-up
  - prefs save/load
  - injector is idempotent and removes cleanly
- **Web (Vitest + jsdom):**
  - row ordering/hiding
  - card state matrix (NEW/unwatched/watched/fav/progress)
  - icon map coverage
  - hero timer, trailer fallback chain, reduced-motion path
- **E2E (Playwright, Docker Jellyfin 12.4 with open-source sample films):**
  - log in → Home shows hero + rows
  - hover shows actions
  - Edit home reorder persists after reload
  - 390 px phone layout
  - disabling Tide restores stock home
- **Release check:** read-only screenshots (desktop + 390 px) against the user's server for sign-off.

## 9. Repository and delivery

```
tide/
├─ server/        Jellyfin.Plugin.Tide (C#, .NET 10) + tests
├─ web/           TypeScript + Vite bundle + tests (built into server/ as embedded resources)
├─ e2e/           Playwright + docker-compose (Jellyfin 12.4 + sample media)
├─ docs/          specs, plans, design mockups
└─ .github/workflows/  build, test, release zip, update manifest.json
```

- Hosted on GitHub under the user's account. Releases publish the plugin zip. `manifest.json` (on GitHub Pages or a
  raw URL) works as a Jellyfin plugin repository.
- **Install:** Dashboard → Plugins → Repositories → add the URL → Catalog → Tide → restart.
- **Dev loop:** `docker compose up` with the plugin folder mounted, plus `vite build --watch`.

## 10. Out of scope (Spec 1)

- Redesigns of detail page, player, library browse, search, login/profiles and admin dashboard. These screens only
  get the global theme (tokens, font, icons, nav).
- TV layout, Legacy layout, Swiftfin/native apps.
- Trailer audio defaulting to on.

## 11. Follow-up specs (each with its own design session)

1. Detail page (movie/series/season/episode)
2. Video player controls (skip intro/credits, next-episode card)
3. Library browse (grids, filters, genre chips)
4. Search
5. Login / "Who's watching?"
6. Admin dashboard
7. Extras: expandable hover previews, watchlist page
