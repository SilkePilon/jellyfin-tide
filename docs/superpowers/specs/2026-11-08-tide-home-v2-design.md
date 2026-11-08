# Tide 0.2.0 — Home v2 (Apple TV direction)

**Date:** 2026-11-08
**Status:** Design approved in session; pending written-spec review
**Builds on:** `2026-11-08-tide-foundation-home-design.md` (0.1.0). Everything not changed here stays as in 0.1.0.

## 1. Goal

The 0.1.0 home looked like "endless lists of small cards with text under them". Home v2 moves it toward the Apple TV look:
- a taller, bigger and calmer hero
- large landscape cards with no text under them, whose details show on hover
- custom sections that aren't plain rows
- an ambient background
- smooth, restrained motion

The layout must adapt to window size, and the 0.1.0 bugs are fixed:
- hovered cards were clipped by their rows
- the top bar looks wrong in Jellyfin Desktop
- the phone hero had problems (partly fixed already)

## 2. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Cards | All rows use **landscape 16:9** artwork cards (backdrop + logo), about 3.4 across on desktop |
| 2 | Under-card text | **None.** Title, subtitle, actions show on hover only |
| 3 | Hero height | Tall, **86vh** (min 640px). Synopsis and More info are kept |
| 4 | Hero text block | **X1 "Big & calm"**: big logo, one quiet meta line, 2-line synopsis, 56px buttons, no badge strip |
| 5 | Resume button | **R3**: progress ring around ▶ inside the white button, then "Resume" and dim "52m left" |
| 6 | Card progress | **Ring badge** bottom-right (40px grey circle, white arc, ▶). On hover it becomes the white Play button with a black arc |
| 7 | Custom sections | **New this week** (bento grid) and **Discover** (poster constellation) |
| 8 | Discover placement | Mid-page, as a break between rows |
| 9 | Page background | **Ambient glow**: dark blurred hero image fixed behind the page |
| 10 | Badges / pills / chips | Flat `#2a2a2e`, **no border or ring**. Accent segments (white res/NEW, gold HDR) keep their colour and also lose the ring |
| 11 | Favourite ♥ | Button stays grey. Only the heart turns `#ff375f` when favourited, with a short pop |
| 12 | Motion | Smooth, not over the top. Animate only transform and opacity. No floating animation in Discover |
| 13 | Row scrolling | Edge chevrons on hover, trackpad/shift+wheel, drag-to-scroll, keyboard, snap; swipe on phone |
| 14 | Sizing | Cards-per-row adapts to window width. Hero text scales with `clamp()` |
| 15 | Top bar | Restyle the stock bar (keep plugin buttons): consistent buttons, pills, top padding, logo mark only |

Mockups (local only; they contain private library images): `.superpowers/brainstorm/.../v2-fullpage-6.html` plus `v2-progress`, `v2-herotext`, `v2-resume` and `v2-discover-3`.

## 3. Page

Order (default; users can still reorder or hide every section in Edit home):

1. Hero
2. Continue Watching
3. Next Up
4. **New this week** (bento)
5. Recently Added Movies / Top Rated Movies
6. **Discover**
7. Top Rated Shows
8. Because you watched
9. Genre rows
10. Favourites
11. Something different
12. Collections
13. Music

New row IDs: `newThisWeek`, `discover`. They are added to `RowIds.All` on the server and `ROW_IDS` on the web. Saved prefs that lack them get them appended (existing normalisation).

### 3.1 Ambient background
- A fixed layer behind all home content shows the **current hero item's backdrop** as a small image (`maxWidth=160`). It is scaled to cover, with `filter: blur(14px) brightness(.32) saturate(1.3)`.
- A fixed veil sits above it: `linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.65))`.
- When the hero slide changes, the layer crossfades (1s) to the new item's backdrop. Two layers alternate, and only opacity animates.
- It shows on home only and is removed on unmount.
- Hero shade gradients become partially translucent so the glow shows through. Use the `body:not(.m-black)` values from the mockup.
- With `prefers-reduced-motion`, there is no crossfade; the image swaps directly.

### 3.2 Hero (X1)
- **Height:** `86vh`, min 640px.
- **Shade:** long, smooth multi-stop bottom fade, from `#000 0%` through `.92 10%`, `.7 22%`, `.38 36%`, `.12 50%` to `0 62%`. Left fade from `.78 22%` through `.35 42%` to `0 62%`. On ambient this is the translucent variant.
- **Text block:** `left: 64px; bottom: 110px; width: min(640px, 48vw)`, top to bottom:
  - **Logo:** `max-width: min(600px, 42vw)`, `max-height: min(240px, 22vw)`. Text fallback: Inter 900, `clamp(40px, 5vw, 72px)`.
  - **Meta:** 18px/500 `#e5e5ea`, "2022 · Action · 2h 10m · ★ 8.2". There is no quality badge (quality moves to More info / the detail page). The W2 chips stay: `NEW` before the meta, `NEW EPISODE` before the episode line.
  - **Synopsis:** `clamp(14px, 1.2vw, 17px)`, 2 lines, `#d1d1d6`.
  - **Buttons** (gap 12, 30px above), all 56px tall with radius 16:
    - **Resume / Play:** white. For resume it is the R3 ring + "Resume" + dim "Nm left" (`#6e6e73`, 500). The ring is 30px; the track is `#d1d1d6`, the arc `#000`, stroke 3, with an 18px ▶ inside. A non-resume item shows a plain ▶ "Play".
    - **More info:** `#2a2a2e`.
    - **♥:** a 56px round button (see 3.7).
- **T3 strip:** `right: 64px; bottom: 110px`. Hidden below 1100px width.
- Trailer, rotation and W2 behaviour are unchanged from 0.1.0.

### 3.3 Landscape card (all rows)
- The card is the item's Backdrop (Episode: its Primary still) with the series/movie logo bottom-left at 22px/28px (max 46% × 32%). Radius 18, shadow `0 12px 30px rgba(0,0,0,.6)`.
- **Resting:** a soft bottom scrim (`.75 → .35 @30% → 0 @55%`) and the logo. There is **no text under the card**.
- **Progress** (items with a resume position): the **ring badge**.
  - A 40px `#2a2a2e` circle, 16px from the bottom-right.
  - SVG ring, r 14, stroke 3. Track `#48484a`, arc `#fff`, dasharray 87.96 with an offset for the percent.
  - An 18px white ▶ inside.
- **Hover / focus-within / long-press:**
  - The card scales 1.05 with shadow `0 30px 60px rgba(0,0,0,.85)` and a 3px white ring.
  - The resting scrim fades out. A dark scrim fades in: `.95 0% → .82 32% → .35 62% → .1 100%`.
  - The logo fades out (moving up 12px).
  - Info slides in (from translateY 10px): a 19px/700 title with a text shadow, and a 14px/500 `#e5e5ea` subtitle, single line with ellipsis:
    - movie: "★ 8.2 · 2022 · Action · 2h 10m"
    - episode: "S1 · E6 · Name · 30m left"
    - resume items: "· Nm left" appended
  - **Actions** bottom-right:
    - with progress, the ring badge animates (`transform: translate(-60px,-10px) scale(1.1)`, background white, track `#d1d1d6`, arc `#000`, ▶ black) into the Play button, followed by a 44px ♥
    - without progress, a 44px white ▶ button plus a 44px ♥
  - Clicking the card opens details. Clicking ▶ plays. ♥ toggles favourite.
- The quality badge (res | codec) is not shown on cards in v2; quality appears on the detail page.

### 3.4 Rows and sizing
- **Card width** via a CSS variable `--cw`, with gap 22 and a peek fraction so the next card always shows partly:

  | Window width | Cards across |
  |---|---|
  | ≥1800px | 4.4 |
  | 1400–1799px | 3.4 |
  | 1000–1399px | 2.6 |
  | 700–999px | 1.6 |
  | <700px (phone) | 1.2 |

  Formula: `calc((100vw - 2*gutter - gap*(n-1)) / (n+0.4))`. Recompute on resize via CSS media queries only, with no JS.
- **Clipping fix:** the row track has `padding: 22px var(--tide-gutter) 34px` and `scroll-padding-inline: var(--tide-gutter)`. Overflow is visible vertically; the vertical padding gives room so hovered cards (scale 1.05 plus a 3px ring) are never clipped.
- **Row title:** 22px/700, tracking −2%, no chevron link text.
- **Horizontal scrolling:**
  - **Edge chevrons:** a 48px solid `#2a2a2e` circle with a white chevron, vertically centred on the cards, 12px inside the row edge. It shows only while the row is hovered *and* can scroll in that direction, and fades in over 200ms. Click scrolls by `track.clientWidth * 0.85` with smooth behaviour.
  - **Wheel:** native trackpad horizontal scroll and shift+wheel. A plain vertical wheel keeps scrolling the page, never the row.
  - **Drag-to-scroll** with the mouse: pointerdown plus a move of more than 6px starts a drag. While dragging, the card's click is suppressed and `cursor: grabbing` shows.
  - **Keyboard:** when a card has focus, ←/→ move focus to the previous/next card and scroll it into view (`block: nearest, inline: nearest`).
  - **Snap:** `scroll-snap-type: x proximity` with `scroll-snap-align: start` on cards.
  - **Phone:** native swipe with snap; no chevrons.
- **Lazy loading:** unchanged (IntersectionObserver, 600px).

### 3.5 New this week (bento)
- **Data:** movies and series with `DateCreated` (series: `DateLastContentAdded`) within the last 7 days, newest first, max 5. With fewer than 3 items the section is hidden.
- **Layout:** a grid `2fr 1fr 1fr`, rows 230px/230px, gap 18. Tile 0 spans 2 rows. Radius 20.
- **Each tile:** backdrop, bottom scrim, logo bottom-left, and a `NEW` chip top-left (white, no ring).
- **Hover:** scale 1.03 with a white ring. Click opens details.
- **Phone:** 1 big tile (16:9) plus a 2×2 grid below it.

### 3.6 Discover (constellation)
- **Heading:** "Discover" only, with no subtitle.
- **Stage:** full width, 640px tall, own background layer. The background is a blurred small backdrop of the focused item (`maxWidth=160`, blur 10px, brightness .42, saturate 1.25), crossfaded with two layers.
- **Edge fades:** long and smooth, top and bottom: `#000 0%`, `.9 6%`, `.6 16%`, `.25 28%`, `0 40%` … `0 62%`, `.3 74%`, `.7 86%`, `#000 100%`.
- **Ten posters** (2:3, radius 16) in fixed slots, each `[x%, y%, width px, depth]`:

  | Slot | x % | y % | Width (px) | Depth |
  |---|---|---|---|---|
  | 0 | 50 | 44 | 250 | center |
  | 1 | 18 | 54 | 175 | front |
  | 2 | 28 | 30 | 140 | mid |
  | 3 | 8 | 26 | 105 | far |
  | 4 | 82 | 30 | 160 | front |
  | 5 | 72 | 62 | 170 | front |
  | 6 | 93 | 64 | 120 | mid |
  | 7 | 64 | 16 | 100 | far |
  | 8 | 31 | 80 | 100 | far |
  | 9 | 6 | 76 | 110 | mid |

  - Depth filters: far `brightness(.45) saturate(.8)`, mid `brightness(.72)`.
  - Poster hover: full brightness plus a 3px white ring.
- **Positioning:** every poster is a fixed 250px element placed with `transform: translate(x,y) scale(w/250)`. Only `transform` and `filter` animate (.8s, `cubic-bezier(.2,.8,.2,1)`), with `will-change: transform`. **No floating animation.**
- **Click a poster:** it swaps into the centre slot, and the previous centre takes its slot.
- **Mood pills** sit on slots 1, 4 and 5: flat `#2a2a2e`, no border, 13px/600. Text comes from the item's first genre via a fixed map:

  | Genre | Pill text |
  |---|---|
  | Science Fiction / Sci-Fi & Fantasy | "Mind-bending sci-fi" |
  | Documentary | "Nature, up close" |
  | Crime | "Crime with a twist" |
  | Animation | "Animated & fun" |
  | Action / Action & Adventure | "Pure adrenaline" |
  | Comedy | "Laugh out loud" |
  | Drama | "Gripping drama" |
  | anything else | "Hidden gems" |

  Pills fade out and in (opacity) when their slot's item changes.
- **Under the centre poster:**
  - the reason line: 14px/600, **text only, no icon**
  - meta: 13px `#a1a1a6`, "Name · Year · Genre · ★ R"
  - buttons: hero-size Play, More info, ♥
- **Data:** `GET /Tide/Discover` returns up to 10 items `{ id, name, year, genre, mood, rating, type, reason }`. The server picks them:
  - 3 "Because you watched {last watched title}" from `/Similar`
  - 4 top-rated unwatched
  - 3 random unwatched
  - de-duplicated, with posters required

  Reasons: `"Because you watched X"`, `"Top rated · you haven't watched it yet"`, `"Something different"`.
- **Phone:** a horizontal centre-focus carousel. The centre poster is 62vw; neighbours are 70% scale and dimmed. Swipe with snap, with the reason line and buttons under the centre.
- **Reduced motion:** posters swap without transition.
- **Pause:** no running animations exist, so nothing needs pausing.

### 3.7 Favourite button (site-wide)
- Round, `#2a2a2e` in **both** states, with a white heart.
- **Favourited:** the heart is `#ff375f` with a pop (`scale 1 → 1.25 → 1`, 350ms). The background does not change.
- State comes from `UserData.IsFavorite`. Hero: the DTO `isFavorite` (added in 0.1.0's fidelity pass).

### 3.8 Badges, pills, chips (site-wide)
- Neutral: `background: #2a2a2e; border: 0; box-shadow: none`.
- The quality badge loses its ring. Segments: res `#fff` / codec `#2a2a2e` / HDR gold gradient / audio `#2a2a2e`.
- The rating box (age rating) is flat `#2a2a2e` without a border.

### 3.9 Top bar (all pages, restyled)
- **Spacing:** `padding-top: 16px` (on top of any safe-area/titlebar inset), height 64px, gutter `var(--tide-gutter)`. It never touches the Jellyfin Desktop window title bar.
- **Logo:** the Jellyfin mark only. The server name text is hidden.
- **Library links:** pills (`padding: 8px 16px`, radius 20, 15px/500, `#e5e5ea`). The current one is white with black 600 text.
- **Every icon button in the bar**, including unknown buttons injected by other plugins (generic `button`/`[role=button]` inside the bar, excluding library pills): a 44px circle, transparent, icon 24px `#fff`, hover/focus background `#2a2a2e`, 8px gap.
- **Avatar:** 34px circle, `object-fit: cover`.
- **Over the hero:** transparent until scrolled more than 80px, then solid `#000` (unchanged behaviour).
- **Verification:** live in Jellyfin Desktop's layout with at least one third-party bar button present. The local test can inject a dummy `<button>` with an icon into the bar.

### 3.10 Motion rules (site-wide)
- Animate only `transform` and `opacity`. `filter` is allowed only on Discover posters and background layers, never on large live images.
- Never animate `left`, `top`, `width`, `height`, `margin` or `box-shadow` on many elements at once. The card hover shadow uses an extra pseudo-element whose opacity is animated.
- Easing `cubic-bezier(.2,.8,.2,1)`. Durations: hover 450ms, fades 300ms, crossfades 0.8–1.1s.
- `will-change: transform` only on elements that are currently animating, or on the 10 Discover posters.
- Blur only on small images (≤160px wide, upscaled), never on a full-resolution image.
- `prefers-reduced-motion`: no scale on hover (ring only), no crossfades (instant), no Discover glide.

## 4. Server changes

- `RowIds.All` gains `newThisWeek` and `discover`. Default order follows §3.
- `GET /Tide/Discover` (as described in §3.6) for the current user, with items checked by `IsVisible(user)`.
- `GET /Tide/NewThisWeek`: Movies with DateCreated, and Series with DateLastContentAdded, within 7 days. Max 5, visible items only.
- Both endpoints use the 10s client timeout and camelCase DTOs, with unit tests for the selection rules.

## 5. Out of scope
- Detail page, player, library, search, login and admin redesigns. They get the restyled top bar and badges only.
- Changes to Discover's recommendation quality beyond the three sources above.

## 6. Testing
- **Web unit tests:**
  - card hover/ring state
  - row chevron visibility (can-scroll logic)
  - drag suppressing click
  - keyboard ←/→ focus
  - Discover slot swap (transform values)
  - mood map
  - bento hides with fewer than 3 items
  - ambient layer swap on hero change
  - top-bar button normalisation, including an unknown plugin button
- **Server unit tests:** Discover selection (sources, de-duplication, reasons) and NewThisWeek window.
- **E2E (Playwright, local Jellyfin 12.4):**
  - hero height is about 86% of the viewport
  - no text under cards
  - hover shows the info, and the card is not clipped (bounding box inside the row's visible area including the ring)
  - chevrons scroll the row
  - drag scroll does not open details
  - cards-per-row at 1920, 1440, 1200 and 900 widths
  - Discover click swaps the centre
  - bento shows when items exist
  - favourite toggle keeps a grey background with a red heart
  - top bar: top padding of 16px or more, all bar buttons the same size, including the injected dummy
  - phone 390px: swipe rows, Discover carousel
- **Performance check:** in Playwright's trace, hover and Discover swap trigger no layout (only composite/paint). Record a Chromium performance trace once and confirm there are no Layout events during those animations.
