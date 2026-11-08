# Tide 0.3.0 — Detail page

**Date:** 2026-11-08
**Status:** Design approved in session; pending written-spec review
**Builds on:** `2026-11-08-tide-home-v2-design.md` (0.2.0). Site-wide rules from it still apply:
- flat badges
- the favourite heart
- motion: transform and opacity only
- the ambient background
- the top bar

## 1. Goal

Replace the stock detail page for **movies and series** with a Tide page that feels like the new home: the same cards, the same calm motion and the same solid surfaces. Episodes, cast, similar titles and file info should be easy to reach without the page turning into a long list.

Other item types keep the stock page: season, episode, person, collection, album, artist and the rest. A season link opens the Tide series page with that season selected (see §3.3).

The release also bundles the 0.2.x home bug fixes, animated row chevrons and app-wide smooth scrolling (§6).

## 2. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Header | **C2**: big floating poster left (340px, 2:3, radius 22px, deep shadow). Right side: logo (or title text), one meta line, synopsis, buttons |
| 2 | Buttons | White primary **Resume / Play** with the R3 progress ring, then **Trailer**, **♥**, **✓**, **⋯** (54px). Same components as the hero |
| 3 | Next up | **N2**: slim strip under the buttons (series only, only when a next episode exists) |
| 4 | Episode picker | **P1**: the section heading *is* the picker ("Season 3 ⌄" opens a menu). One row of episode cards below it |
| 5 | Episode cards | **The home landscape card** (16:9, hover reveal, ring badge, ✓ watched, CONTINUE / UP NEXT tag) |
| 6 | Cast | **K4**: pill chips (48px round photo, name, character) that wrap; "See all ›" expands |
| 7 | More like this | **The home landscape card row** (logo at rest; hover = title, year · genre · ★, Play, ♥), same scroller |
| 8 | Details | **M2**: two solid panels side by side: **About** (facts) and **Your file** (quality badge + streams) |
| 9 | Background | Ambient glow from the item's backdrop, same as home |
| 10 | Empty sections | Hidden, never shown empty (no Next up for movies or finished shows, no row without similar items, and so on) |
| 11 | Row chevrons (site-wide) | The ‹ › scroll buttons animate in and out and react to hover and press (§6f) |
| 12 | Smooth scrolling (whole app) | Mouse-wheel scrolling is eased on every page; trackpads and touch keep their native feel (§6g) |

Mockup (local only, contains private library images): `.superpowers/brainstorm/.../detail-final.html`. Option boards: `detail-picker.html` (P1), `detail-nextup.html` (N2), `detail-cast.html` (K4), `detail-full.html` (M2).

## 3. Page

Order, top to bottom:

1. Header
2. Next up strip (inside the header column)
3. Episodes
4. Cast & crew
5. More like this
6. Details

Movies skip 2 and 3. Side gutter `--tide-gutter` (48px desktop), section spacing 56px, section titles 22px/700.

### 3.1 Header (C2)

- Grid `340px minmax(0,1fr)`, gap 56px, items aligned to the bottom. Top padding clears the fixed top bar.
- **Poster**: Primary image (`maxWidth=700`), radius 22px, shadow `0 50px 100px rgba(0,0,0,.85)` plus a 1px `rgba(255,255,255,.06)` ring. If there is no image, show a solid `#1d1d20` box with the title.
- **Logo**: up to 440×150px, aligned left-bottom. If there is no logo, show the title text in 48px/800 with -0.03em letter spacing.
- **Meta line** (16px/500, `#e5e5ea`), separated by ` · `:
  - year (series: `2008–2015` when ended, the start year when continuing)
  - first genre
  - movie runtime `2h 10m`, or series `N seasons`
  - ★ community rating, 1 decimal
  - movie only: critic score (red dot + `96%`)
  - official rating chip
  - quality badge: the existing `quality.ts` resolution / HDR / codec / audio segments
- **Tagline** (movies, if present): 13px italic `#a1a1a6`.
- **Synopsis**: 15px, line-height 1.6, `#d1d1d6`, max 3 lines. If cut off, click it to expand in place.
- **Buttons** (54px tall, gap 12px):
  - **Primary** (white):
    - Movie with a resume position: ring + `Resume` + dim `52m left`.
    - Movie without one: `▶ Play`.
    - Series with a next-up episode: ring (if partly watched) + `Resume S3 E1` (or `Play S3 E1`) + dim time left.
    - Series not started: `▶ Play S1 E1`.
    - Series fully watched: `▶ Play S1 E1` (rewatch).
  - **Trailer**: grey, shown only when the item has a local trailer or a YouTube `RemoteTrailer`. Local trailers play with `play()`. YouTube opens a full-screen black modal with the embed (16:9, max 1280px wide, Esc or ✕ closes, autoplay with sound).
  - **♥**: shared `toggleButton`, the site-wide rule (button stays grey, heart solid `#ff375f`, pop on click).
  - **✓**: watched toggle (white when on). On a series it marks the whole series.
  - **⋯**: a small menu (solid `#1c1c1e`, radius 18px):
    - Play from start (when resumable)
    - Shuffle (series)
    - Copy link
    - Refresh metadata (admins only, `POST /Items/{id}/Refresh`)
    - Edit metadata (admins only, opens the stock editor)

### 3.2 Next up strip (N2)

Shown on a series when `GET /Shows/NextUp?seriesId=` returns an episode, or the series has a resumable episode, which wins.

- Solid `#141416` pill, radius 18px, padding `10px 20px 10px 10px`, max width 560px, 22px under the buttons. Hover `#1d1d20`.
- **Left**: 150px 16:9 episode still, radius 12px, white progress line (4px) when partly watched.
- **Middle**:
  - kicker `NEXT UP · S3 E1` (12px/800, 0.12em letter spacing, `#a1a1a6`)
  - title (16px/700)
  - `38m left`, or the runtime when unwatched (13px `#a1a1a6`)
- **Right**: 44px white circle with ▶.
- Clicking anywhere plays the episode (resumes if it has a position).

### 3.3 Episodes (P1)

- **Heading row**: dropdown button `Season 3 ⌄` (22px/700, chevron rotates 180° when open), then `N episodes` or `X of N watched` (14px `#8e8e93`).
- **Menu**: `#1c1c1e`, radius 18px, width 340px, max-height 420px (scrolls), shadow `0 30px 60px rgba(0,0,0,.8)`. It opens with opacity + scale from top-left.
  - Each row has a 38px poster, the season name, `year · status`, a 90px watch bar, and ✓ when the season is complete.
  - The current season is a white row with black text.
  - Esc, an outside click or picking a season closes it.
  - Arrow keys move between rows.
- **Default season**:
  - a `?season=` hint (set when coming from a season link)
  - else the next-up episode's season
  - else the first season with unwatched episodes
  - else season 1
  - Specials (season 0) are listed last in the menu and are never the default.
- **Row**: the home scroller (`createScroller`) with home cards in "episode mode" (§3.4). It opens scrolled so the card *before* the next-up episode is the first visible one (no smooth scroll on the first position). Switching season starts at its first unwatched episode.
- **Data**:
  - `GET /Shows/{id}/Seasons` (UserData, ImageTags)
  - `GET /Shows/{id}/Episodes?seasonId=` (Overview, RunTimeTicks, UserData, ImageTags), fetched per season when first opened and cached while the page is open.

### 3.4 Landscape card, episode mode

Reuse `wideCard` from `ui/cards.ts`. Add an option instead of a second component, so the two can't drift apart.

- **Art**: the episode Primary (still). If missing, fall back to the series backdrop.
- **At rest**: there is no logo. The title block sits bottom-left: `EPISODE 3` kicker (12px/800, 0.08em) and the episode name (18px/700, one line, ellipsis). For specials the kicker is `SPECIAL`.
- **Hover**: the same reveal as home.
  - title `3. A Dark Web`
  - sub `48m`, `48m · 12m left`, or `48m · Watched`
  - 2-line synopsis (12.5px `#c7c7cc`)
  - play (or ring) + ♥ buttons
- **Badges**:
  - ring badge when partly watched
  - white ✓ circle top-right when watched
  - top-left tag `CONTINUE` (has a position) or `UP NEXT` (next unwatched) on that one episode only
- Clicking the card (or its play button) plays the episode. There is no separate episode page in this release; the hover synopsis covers it.
- The ♥ favourites the episode, not the series.

### 3.5 Cast & crew (K4)

- **Heading**: `Cast & crew`, with `See all ›` on the right (14px/600 `#a1a1a6`). It is shown only when there are more people than fit.
- **Chips**:
  - Solid `#141416` pill, radius 40px, padding `6px 20px 6px 6px`, gap 12px between chips, wrapping. Hover `#2a2a2e`.
  - 48px round photo (`Primary?maxWidth=120`, position `center 18%`). Without a photo: a `#2a2a2e` circle with initials.
  - Name 14px/700; character (or crew job) 12px `#8e8e93`.
- **By default** the first 12 actors are shown. `See all` expands in place to every actor, then crew (Director, Writer, Producer, Creator, in that order). The link becomes `Show less`.
- Clicking a chip opens the stock person page (`#/details?id=` of the person, which is not taken over).

### 3.6 More like this

- `GET /Items/{id}/Similar?limit=12&fields=…` (the fields the home cards use).
- A normal home row: `createScroller` + `wideCard`, identical to Recently Added. It keeps the row's top padding so hovered cards are never clipped (a bug in the mockup).
- Hidden when empty.

### 3.7 Details (M2)

Two panels, grid `1.5fr 1fr`, gap 22px, each `#141416` radius 22px, padding 26px, with a 15px/700 panel title.

**About**: 2-column fact grid, label 13px `#8e8e93` over value 15px/600. Facts with no value are skipped.
- Movies:
  - Director
  - Studio
  - Released (month year)
  - Rating
  - Genres
  - Runtime
- Series:
  - Studio / network
  - Status (Continuing / Ended)
  - First aired
  - Rating
  - Genres
  - Seasons · episodes count
  - Creator (when present)

**Your file**: the title row shows the quality badge. Below it are label/value rows separated by 1px `#222` lines:
- Quality: resolution + HDR type
- Video: codec + profile
- Audio: the default track's DisplayTitle
- Subtitles: languages, shortened to `English, Dutch +4`
- Versions (only if more than one MediaSource)
- Size on disk

For series, this panel describes the next-up episode's file (or S1E1), and its title reads `Your file · S3 E1`.

Data: `MediaSources` / `MediaStreams` from the item (or episode) request.

### 3.8 Phone (< 700px)

- **Header**: no poster column. The logo is centred over the ambient glow, the meta wraps, and the synopsis is limited to 4 lines.
- **Buttons**: the primary button goes full width, with the round buttons in a row under it. Trailer becomes a round icon button.
- **Next up strip**: full width.
- **Episodes**: cards use the home phone width (`--tide-n` 1.2). Long-press reveals, as on home.
- **Cast**: chips scroll sideways in two rows instead of wrapping.
- **Details**: the panels stack.

### 3.9 Loading and errors

- **First paint**: the header renders from a single item request. Other sections show the home skeleton shapes and fill in as their requests return.
- **Failed section**: shows the home "Couldn't load · Retry" line.
- **Failed item request**: Tide unmounts and the stock page shows (it is still underneath). A failing host is not retried, the same latch as home.

## 4. Mounting (web)

- **Host**: jellyfin-web 12.4 renders the detail page as the legacy view `div#itemDetailPage.page.itemDetailPage`, inside `.mainAnimatedPages.skinBody`. Probed on the local 12.4 server.
  - Views are **cached**: every visit can add another `#itemDetailPage`, and inactive ones get `.hide`.
  - So the host is the **visible** one: `#itemDetailPage.itemDetailPage:not(.hide)`.
- **Router**: generalise `initRouter` into a small takeover table, `{ id, matches(loc, cfg), hostSelector, mount }`. Home and details share the existing logic:
  - re-query on route change
  - MutationObserver remount
  - per-host failure latch
  - stale-mount guard
- **Detail takeover**:
  - It matches `#/details?id=` when `cfg.enableDetails` is set.
  - Before mounting, Tide fetches the item and takes over only when the `Type` is `Movie` or `Series`.
  - For `Season`, it redirects to the series id with `&season=<index>`, using `replace` so Back still works.
  - Every other type is left to stock.
  - It remounts when the `id` in the hash changes, even if the host element is reused.
- **Hiding stock**: the host gets class `tide-taken`. CSS hides `#itemDetailPage.tide-taken > :not(.tide-details)` and the stock `.itemBackdrop`. Tide mounts `.tide-details` as a child. On unmount the class is removed.
- **Files**:
  - new `web/src/details/` (`details.ts` mount, `header.ts`, `nextUp.ts`, `episodes.ts`, `seasonMenu.ts`, `cast.ts`, `about.ts`, `details.css`)
  - `api/` gains `item.ts` (item, seasons, episodes, next-up, similar requests)
  - `ui/cards.ts` gains the episode mode
  - `ui/trailerModal.ts` is new and shared with the hero (fix §6a/§6b live in the hero)

## 5. Server

- `PluginConfiguration`: add `EnableDetails` (default `true`) and `EnableSmoothScroll` (default `true`, see §6g). Expose it in `/Tide/ClientConfig` as `enableDetails` and on the config page as a checkbox: "Tide detail page (movies & series)".
- No new endpoints. All data comes from stock Jellyfin APIs with the user's token.

## 6. Bundled fixes (from 0.2.0 field reports)

a. **Hero image showing under the trailer.**
   - The backdrop fades to opacity 0 once the YouTube player reports `PLAYING`.
   - It fades back when the trailer ends, errors or is paused.
   - The video layer has a solid `#000` base, so nothing shows through letterboxing.

b. **YouTube pause icon visible.**
   - Pause or buffering for more than 300ms fades the video out and the backdrop in.
   - The video fades back in after `PLAYING` resumes.
   - The player keeps `controls=0`, `disablekb=1`, `modestbranding=1`, `rel=0`, `iv_load_policy=3`, `playsinline=1`, `fs=0`.
   - The iframe has `pointer-events:none`.

c. **Yellow focus outline on the T3 strip.**
   - Reset the native outline on T3 items.
   - `:focus-visible` gets a 2px white ring (`box-shadow`) with radius 10px.

d. **T3 strip unreadable on bright backdrops.**
   - Add a bottom-right radial dark shade behind the strip, part of the hero shade layers and masked like them.
   - Inactive logos: `grayscale(1) brightness(1.35)`, opacity .7, `drop-shadow(0 1px 6px rgba(0,0,0,.8))`.
   - Progress track: solid `#48484a`.

e. **Icons render outlined in Jellyfin Desktop.**
   - The favourite heart becomes an inline SVG: white outline when off, **solid `#ff375f`** when on, plus the pop.
   - Play, check, star and info also become inline SVGs (shared `ui/svgIcons.ts`).
   - `icon()` keeps Material Symbols for the rest, but its CSS forces `font-variation-settings` again on `.tide-ms`, with `!important`, in the injected theme.

f. **Row chevrons animate.**
   - **Where:** every Tide scroller, through the shared `createScroller` CSS. That covers home rows, episode rows and More like this.
   - **Appearing** (row hovered and that direction can scroll):
     - opacity 0 → 1
     - `translateX(∓10px) scale(.85)` → `translateX(0) scale(1)`
     - .35s `--tide-ease`
   - **Disappearing:** the same in reverse, .25s. This also runs when the row reaches its end and `can-next` / `can-prev` drops, so the button glides away instead of vanishing.
   - **Hover:** scale 1.08, background `#3a3a3c`, and the arrow nudges 2px in its direction.
   - **Press:** scale .92, springing back on release (.2s).
   - Transform and opacity only, as everywhere else. With `prefers-reduced-motion`, opacity only.
   - **The cards glide when you click.** Paging no longer uses the browser's `scrollBy({behavior:'smooth'})`, which is short and abrupt and sometimes instant in Jellyfin Desktop.
     - A shared `animateScrollLeft(track, to)` in `ui/scrollAnim.ts` eases `scrollLeft` over **650ms** with an ease-out cubic. It runs on `requestAnimationFrame`, so only the scroll position changes and there is no layout work.
     - **Page target:** the first card that is only partly visible on that side becomes the new first (or last) card. A page always moves whole cards and lands exactly on a card edge, never mid-card.
     - Scroll snap is switched off on the track while the animation runs and back on when it ends, so snapping can't fight the glide.
     - Clicking again mid-glide re-targets from the current position to one more page, so double-clicking moves two pages smoothly.
     - The row cancels the glide when the user drags, wheels or touches it.
     - **Reused by:** ←/→ keyboard focus moves, the smooth-scroll wheel on rows (§6g) and the episode row's first position after a season switch.
     - With `prefers-reduced-motion`, scrolling jumps instantly.

g. **Smooth scrolling, whole app.**
   - **Where:** the new `web/src/theme/smoothScroll.ts`, started from `main.ts` when the theme is on. It applies on every page, stock or Tide.
   - **Mouse wheel** (discrete notches):
     - The wheel event is taken over, and the nearest scrollable ancestor of the event target eases toward an accumulated target. It uses a frame-based ease-out of about 450ms, with transforms untouched (the real scroll position moves).
     - Fast repeated notches add to the target instead of restarting the animation, so scrolling stays fluid.
     - Wheel with Shift, or a horizontal wheel over a Tide row, eases that row's `scrollLeft` the same way.
   - **Trackpads, touch and pens** keep native scrolling, since they are already smooth.
     - An event counts as a mouse notch when `deltaMode` is lines or pages, or when the pixel delta is ≥ 50 with no fractional part.
     - Everything else is passed through.
   - **Left alone:**
     - `Ctrl`/`⌘` + wheel (zoom)
     - the video player
     - sliders, range inputs, `<select>`, text areas
     - anything with `data-tide-native-scroll`
     - elements that are already at their scroll limit in that direction: the event passes on, so nested scroll areas don't trap the page
   - **Keyboard and programmatic scrolling** (Page Up/Down, Space, Home/End, anchor jumps): `html { scroll-behavior: smooth }` while the theme is on.
   - **Turning it off:**
     - `prefers-reduced-motion` turns the whole feature off.
     - New `PluginConfiguration.EnableSmoothScroll`, default `true`. It is exposed in ClientConfig as `enableSmoothScroll` and on the config page as "Smooth scrolling".

## 7. Out of scope

- Episode, season and person detail pages
- Collections and music detail pages: later sessions
- Editing cast or images
- Reviews, tags, external links, "available on" (stock-only extras)
- Multiple-version picker UI: plays the default version; the Versions fact only lists them

## 8. Testing

- **vitest**:
  - **takeover table**: home vs details matching, the hidden-host selector, the Season redirect
  - **default-season rules** (§3.3)
  - **next-up selection** (resume wins over NextUp)
  - **episode card**: tags, badges, hover text
  - **season menu**: keyboard, close behaviour
  - **cast**: the 12 limit, crew order, `See all`
  - **About** fact skipping
  - **Your file** formatting (subtitle shortening, versions)
  - **trailer modal**
  - **scroll animation**: page target lands on a card edge, eases over 650ms, re-targets on a second click, cancels on pointer/wheel, snap is restored after the glide
  - **fix (a)/(b) state machine**: the backdrop opacity follows player state
  - **smooth scroll**:
    - mouse-vs-trackpad detection
    - notch accumulation
    - nearest scrollable ancestor
    - passing through at scroll limits, with Ctrl, and on `data-tide-native-scroll`
    - off under reduced motion and when the setting is off
- **xUnit**: `EnableDetails` and `EnableSmoothScroll` defaults and their ClientConfig exposure.
- **Playwright** (local 12.4 with the open movies; add one small open series fixture with 2 seasons):
  - a movie detail renders the header, cast and details, and the stock page is hidden
  - a series shows Next up when a next episode exists and hides it after marking all watched
  - the season menu switches the row
  - hovered episode and similar cards are not clipped
  - a person chip opens the stock person page
  - a Season link redirects to the series page with that season selected
  - `enableDetails=false` keeps the stock page
  - navigating details → details (similar card) remounts with the new item
  - phone viewport layout
  - the heart is a solid red SVG when on
  - a chevron is fully visible after hovering a row and transparent once the row is scrolled to its end
  - clicking › moves the row over several frames and ends with a card exactly at the left edge
  - one mouse-wheel notch moves the page over several frames (not in one jump) and lands about one notch further
- **Manual**: Jellyfin Desktop check of icons (fix e), the trailer (fixes a/b), and that wheel scrolling feels smooth and a trackpad still feels native (fix g).
