# Tide

A streaming-app theme and home screen for Jellyfin 12.4+ (Modern web layout): a hero with trailers, rich poster cards with file-quality badges, and home rows each user can configure. Works in the browser, Jellyfin Desktop and the Android app.

## Install
1. Dashboard → Plugins → Repositories → **+** → URL: `https://raw.githubusercontent.com/SilkePilon/jellyfin-tide/main/manifest.json`
2. Catalog → **Tide** → Install → restart Jellyfin.
3. Optional but recommended: also install **File Transformation**. Without it, Tide patches `jellyfin-web/index.html` directly, so the web folder must be writable by Jellyfin.

## Configure
Dashboard → Plugins → Tide: turn the theme, icons, home and trailers on or off; set hero length, the NEW window and the default row order.
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
