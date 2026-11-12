# Tide

A streaming-app theme for Jellyfin 12.4+ (Modern web layout). Works in the browser, Jellyfin Desktop and the Android app.

- **Sign-in:** a poster-wall sign-in screen with a "Who's watching?" profile picker, Quick Connect and password reset; switch profile from the avatar menu.
- **Top bar:** two floating islands (libraries as icons, the current one as a pill; actions and profile), see-through over a hero.
- **Home:** a hero with trailers, large landscape cards, custom sections and rows each user can reorder or hide.
- **Detail pages** for movies, series and episodes: floating poster/still, next-up strip, season dropdown, cast, more like this, and your file's quality.
- **Player:** Tide's own controls over Jellyfin's player.
  - an episodes shelf
  - a settings menu with every option the default player offers on that device (audio, quality, speed, aspect ratio, repeat, playback info)
  - a subtitles menu with search, size, timing and, with a subtitle provider such as OpenSubtitles, online download
  - a "You're watching" pause screen
  - a next-episode countdown
  - a loading screen with progress
  - phone gestures (double-tap to seek, swipe up for episodes)
- **Search:** a quick search dialog (top-bar button, `/` or Ctrl+K) across movies, shows, episodes, people, music, collections and playlists.
- **Skip intro and credits:** shown when the [Intro Skipper](https://github.com/intro-skipper/intro-skipper) plugin is installed.
  - On Android, the player applies when the app's video player is set to *Web player*.

## Install
1. Dashboard → Plugins → Repositories → **+** → URL: `https://raw.githubusercontent.com/SilkePilon/jellyfin-tide/main/manifest.json`
2. Catalog → **Tide** → Install → restart Jellyfin.
3. Optional but recommended: also install **File Transformation**. Without it, Tide patches `jellyfin-web/index.html` directly, so the web folder must be writable by Jellyfin.

## Configure
Dashboard → Plugins → Tide: turn the theme, icons, home, trailers, detail pages, smooth scrolling, the player, the search dialog and the login screen on or off; set hero length, the NEW window, the default row order and when credits start without Intro Skipper.
Each user can reorder or hide rows with **Edit home** at the bottom of Home.

## Develop
Local Jellyfin runs from the image `jellyfin/jellyfin:12.4.20261026-211555` (see `e2e/docker-compose.yml`). The e2e tests need Playwright's browser: `cd e2e && npm i && npx playwright install chromium`.

```sh
mkdir -p e2e/plugins/Tide
e2e/fetch-media.sh && (cd e2e && docker compose up -d && npm i && npx playwright install chromium && npm run setup)
(cd web && npm i && npm run watch)          # rebuilds web/dist
./scripts/dotnet publish server/Jellyfin.Plugin.Tide -c Release -o e2e/plugins/Tide && (cd e2e && docker compose restart)
./scripts/dotnet test Tide.slnx && (cd web && npm test) && (cd e2e && npx playwright test)
```

Build the web bundle (`cd web && npm run build`) before `dotnet build`/`publish`: `web/dist` is embedded into the DLL.

## Release
Push a tag `vX.Y.Z`. The release workflow builds, tests, packages `tide_X.Y.Z.zip` (DLL + `meta.json`), publishes a GitHub Release and updates `manifest.json` on `main`.
