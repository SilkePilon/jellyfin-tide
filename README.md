# Tide

A streaming-app theme for Jellyfin 12.4+ (Modern web layout). Works in the browser, Jellyfin Desktop and the Android app.

- **Home:** a hero with trailers, large landscape cards, custom sections and rows each user can reorder or hide.
- **Detail pages** for movies, series and episodes: floating poster/still, next-up strip, season dropdown, cast, more like this, and your file's quality.
- **Player:** Tide's own controls over Jellyfin's player.
  - an episodes shelf
  - a settings sheet (audio, subtitles, quality, speed)
  - a "You're watching" pause screen
  - a next-episode countdown
  - a loading screen with progress
  - phone gestures (double-tap to seek, swipe up for episodes)
- **Skip intro and credits:** shown when the [Intro Skipper](https://github.com/intro-skipper/intro-skipper) plugin is installed.
  - On Android, the player applies when the app's video player is set to *Web player*.

## Install
1. Dashboard → Plugins → Repositories → **+** → URL: `https://raw.githubusercontent.com/SilkePilon/jellyfin-tide/main/manifest.json`
2. Catalog → **Tide** → Install → restart Jellyfin.
3. Optional but recommended: also install **File Transformation**. Without it, Tide patches `jellyfin-web/index.html` directly, so the web folder must be writable by Jellyfin.

## Configure
Dashboard → Plugins → Tide: turn the theme, icons, home, trailers, detail pages, smooth scrolling and the player on or off; set hero length, the NEW window, the default row order and when credits start without Intro Skipper.
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
