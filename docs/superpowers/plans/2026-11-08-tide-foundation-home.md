# Tide Foundation + Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Tide Jellyfin plugin. It ships a global streaming-app theme (tokens, Inter, Material Symbols, N1 nav) and a custom Home screen: an H3/W2/T3 hero, 14 configurable rows, rich poster cards and per-user row editing.

**Architecture:**
- A C# Jellyfin 12.4 plugin (.NET 10) serves an embedded TypeScript/Vite bundle and injects it into `index.html`. It does this through File Transformation when that plugin is present; otherwise it patches the file directly.
- The plugin exposes `/Tide/*` endpoints for client config, the hero smart mix, batched file-quality badges and per-user prefs.
- The web bundle restyles the React+MUI "Modern" layout and replaces the `/home` route content with plain-DOM Tide components.

**Tech Stack:**
- C# / .NET 10, ASP.NET Core controllers, xUnit
- Jellyfin.Controller 12.4.0
- TypeScript 5.8, Vite 6 (IIFE lib build), Vitest + jsdom
- `@fontsource-variable/inter`, `material-symbols`
- Playwright, Docker (`jellyfin/jellyfin:12.4.0`)
- GitHub Actions

**Spec:** `docs/superpowers/specs/2026-11-08-tide-foundation-home-design.md`

## Global Constraints

- Jellyfin **12.4.0+**, plugin `targetAbi` **12.4.0.0**, `TargetFramework` **net10.0**.
- Web: Modern layout only. No React in Tide code; Tide renders plain DOM into its own containers.
- Auth header format: `Authorization: MediaBrowser Token="<token>"`. For URLs that can't carry headers (video/iframe), the query parameter is **`ApiKey=`**. (`api_key` is rejected by 12.x; verified against 12.4.)
- Every Tide CSS rule is scoped under `body.tide`.
- No `backdrop-filter` and no translucent UI surfaces. The only gradients allowed are shades over images.
- No external CDNs at runtime. Fonts are bundled and served from `/Tide/assets/`. The YouTube no-cookie embed for trailers is the single allowed external origin.
- Network timeout: **10 s** for every Tide request.
- Server JSON DTOs use explicit `[JsonPropertyName("camelCase")]`, because Jellyfin's default JSON is PascalCase. Stock Jellyfin responses stay PascalCase.
- Row IDs (identical on server and web, in this default order): `continue, nextUp, latestMovies, latestShows, becauseYouWatched, topRated, genre1, genre2, genre3, favourites, random, collections, musicAlbums, musicArtists`.
- Defaults:
  - `heroSize` 6
  - `heroSlotSeconds` 30
  - `newDays` 14
  - trailer start delay 3 s, trailer load timeout 6 s
  - row page size 20
  - lazy-load margin 600 px
  - phone breakpoint `< 700px`
- Design tokens are given verbatim in Task 10. Icons use Material Symbols Rounded with `'FILL' 1, 'wght' 600, 'GRAD' 100, 'opsz' 24`.
- .NET has no local install. Always use `./scripts/dotnet …` (Docker wrapper, Task 1) from the repo root.
- Commits end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

```
scripts/dotnet                         Docker wrapper for the .NET 10 SDK
Tide.slnx
server/Jellyfin.Plugin.Tide/
  Jellyfin.Plugin.Tide.csproj          plugin project, embeds web/dist + configPage.html
  Plugin.cs                            BasePlugin<PluginConfiguration>, IHasWebPages, uninstall cleanup
  PluginServiceRegistrator.cs          DI registration
  Configuration/PluginConfiguration.cs admin config
  Configuration/configPage.html        Dashboard config page
  Models/Dtos.cs                       QualityDto, HeroItemDto, UserPrefs, ClientConfig, RowIds
  Quality/QualityMapper.cs             pure: media streams -> QualityDto
  Quality/QualityService.cs            Jellyfin adapter + cache
  Hero/HeroSelector.cs                 pure: smart-mix selection
  Hero/HeroService.cs                  Jellyfin adapter -> HeroItemDto[]
  Prefs/UserPrefsStore.cs              JSON-file prefs per user + normalisation
  Injection/IndexPatcher.cs            pure: add/remove script block in index.html
  Injection/FileTransformationBridge.cs reflection bridge to File Transformation plugin
  Injection/ScriptInjector.cs          IHostedService: FT first, else direct patch
  Api/AssetController.cs               anonymous /Tide/client.js, /Tide/client.css, /Tide/assets/*
  Api/TideController.cs                /Tide/ClientConfig, /Tide/Home, /Tide/Quality, /Tide/UserPrefs
server/Jellyfin.Plugin.Tide.Tests/
  Jellyfin.Plugin.Tide.Tests.csproj
  QualityMapperTests.cs  HeroSelectorTests.cs  UserPrefsStoreTests.cs  IndexPatcherTests.cs
web/
  package.json  tsconfig.json  vite.config.ts
  src/main.ts                          boot
  src/types.ts                         shared types (mirror of server DTOs + JfItem)
  src/api/client.ts                    session, fetch wrapper, image/stream URLs
  src/api/tide.ts                      Tide endpoints
  src/api/actions.ts                   play / watched / favourite / navigate
  src/router/selectors.ts              ALL jellyfin-web DOM selectors + routes (single source of truth)
  src/router/hook.ts                   route detection, mount/unmount
  src/theme/tokens.css  src/theme/global.css  src/theme/index.ts
  src/icons/map.ts  src/icons/swap.ts
  src/ui/dom.ts  src/ui/quality.ts  src/ui/cards.ts  src/ui/cards.css
  src/home/rows.ts  src/home/rowView.ts  src/home/hero.ts  src/home/hero.css
  src/home/editPanel.ts  src/home/home.ts  src/home/home.css
  src/mobile/tabbar.ts
  test/*.test.ts
e2e/
  docker-compose.yml  fetch-media.sh  setup.mjs  playwright.config.ts  tests/home.spec.ts  discover.mjs
.github/workflows/ci.yml  .github/workflows/release.yml
manifest.json                          Jellyfin plugin repository manifest
docs/notes/web-12.4-dom.md             DOM discovery results
```

---

### Task 1: Repository scaffold and toolchain

**Files:**
- Create: `web/test/setup.ts`, `scripts/dotnet`, `Tide.slnx`, `server/Jellyfin.Plugin.Tide/Jellyfin.Plugin.Tide.csproj`, `server/Jellyfin.Plugin.Tide/Plugin.cs`, `server/Jellyfin.Plugin.Tide/Configuration/PluginConfiguration.cs`, `server/Jellyfin.Plugin.Tide/Configuration/configPage.html`, `server/Jellyfin.Plugin.Tide.Tests/Jellyfin.Plugin.Tide.Tests.csproj`, `server/Jellyfin.Plugin.Tide.Tests/SmokeTests.cs`, `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/src/main.ts`, `web/test/smoke.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces:
  - `Jellyfin.Plugin.Tide.Plugin` (static `Plugin.Instance`, `Plugin.Instance.Configuration`)
  - `PluginConfiguration` properties: `EnableTheme`, `EnableIcons`, `EnableHome`, `EnableTrailers` (bool); `HeroSize`, `HeroSlotSeconds`, `NewDays` (int); `DefaultRowOrder`, `DefaultHiddenRows` (string[])
  - the `./scripts/dotnet` wrapper
  - `npm run build` → `web/dist/client.js` + `web/dist/client.css`

- [ ] **Step 1: Create the .NET Docker wrapper**

`scripts/dotnet`:
```sh
#!/usr/bin/env sh
# Runs the .NET 10 SDK in Docker. Always call from the repo root.
set -e
exec docker run --rm -i \
  -v "$PWD":/src -w /src \
  -v tide-nuget:/root/.nuget/packages \
  -e DOTNET_CLI_TELEMETRY_OPTOUT=1 \
  mcr.microsoft.com/dotnet/sdk:10.0 dotnet "$@"
```
Run: `chmod +x scripts/dotnet && ./scripts/dotnet --version`
Expected: a `10.0.x` version string.

- [ ] **Step 2: Plugin project**

`server/Jellyfin.Plugin.Tide/Jellyfin.Plugin.Tide.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <RootNamespace>Jellyfin.Plugin.Tide</RootNamespace>
    <AssemblyVersion>0.1.0.0</AssemblyVersion>
    <FileVersion>0.1.0.0</FileVersion>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <GenerateDocumentationFile>false</GenerateDocumentationFile>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Jellyfin.Controller" Version="12.4.0" ExcludeAssets="runtime" />
    <PackageReference Include="Jellyfin.Model" Version="12.4.0" ExcludeAssets="runtime" />
  </ItemGroup>
  <ItemGroup>
    <None Remove="Configuration\configPage.html" />
    <EmbeddedResource Include="Configuration\configPage.html" />
    <EmbeddedResource Include="..\..\web\dist\**\*" LogicalName="Tide.Web/%(RecursiveDir)%(Filename)%(Extension)" />
  </ItemGroup>
  <ItemGroup>
    <InternalsVisibleTo Include="Jellyfin.Plugin.Tide.Tests" />
  </ItemGroup>
</Project>
```

`server/Jellyfin.Plugin.Tide/Configuration/PluginConfiguration.cs`:
```csharp
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Tide.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public bool EnableTheme { get; set; } = true;
    public bool EnableIcons { get; set; } = true;
    public bool EnableHome { get; set; } = true;
    public bool EnableTrailers { get; set; } = true;
    public int HeroSize { get; set; } = 6;
    public int HeroSlotSeconds { get; set; } = 30;
    public int NewDays { get; set; } = 14;
    public string[] DefaultRowOrder { get; set; } = Models.RowIds.All.ToArray();
    public string[] DefaultHiddenRows { get; set; } = Array.Empty<string>();
}
```

`server/Jellyfin.Plugin.Tide/Plugin.cs` (the `RowIds` it references is created in this task as a minimal stub and completed in Task 3):
```csharp
using Jellyfin.Plugin.Tide.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Tide;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public static readonly Guid PluginId = Guid.Parse("7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c");

    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Tide";

    public override Guid Id => PluginId;

    public override string Description => "Streaming-app theme and home screen for Jellyfin.";

    public IEnumerable<PluginPageInfo> GetPages() => new[]
    {
        new PluginPageInfo
        {
            Name = "Tide",
            EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html",
        },
    };
}
```

`server/Jellyfin.Plugin.Tide/Models/Dtos.cs` (stub for this task; Task 3 replaces it with the full file):
```csharp
namespace Jellyfin.Plugin.Tide.Models;

public static class RowIds
{
    public static readonly IReadOnlyList<string> All = new[]
    {
        "continue", "nextUp", "latestMovies", "latestShows", "becauseYouWatched", "topRated",
        "genre1", "genre2", "genre3", "favourites", "random", "collections", "musicAlbums", "musicArtists",
    };
}
```

`server/Jellyfin.Plugin.Tide/Configuration/configPage.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Tide</title></head>
<body>
<div id="TideConfigPage" data-role="page" class="page type-interior pluginConfigurationPage" data-require="emby-input,emby-button,emby-checkbox">
  <div data-role="content"><div class="content-primary">
    <form id="TideConfigForm">
      <h2>Tide</h2>
      <label class="checkboxContainer"><input is="emby-checkbox" type="checkbox" id="EnableTheme"><span>Theme (colours, font)</span></label>
      <label class="checkboxContainer"><input is="emby-checkbox" type="checkbox" id="EnableIcons"><span>Material Symbols icons</span></label>
      <label class="checkboxContainer"><input is="emby-checkbox" type="checkbox" id="EnableHome"><span>Tide home screen</span></label>
      <label class="checkboxContainer"><input is="emby-checkbox" type="checkbox" id="EnableTrailers"><span>Hero trailers</span></label>
      <div class="inputContainer"><input is="emby-input" type="number" id="HeroSize" min="1" max="12" label="Hero titles"></div>
      <div class="inputContainer"><input is="emby-input" type="number" id="HeroSlotSeconds" min="8" max="120" label="Seconds per hero title"></div>
      <div class="inputContainer"><input is="emby-input" type="number" id="NewDays" min="1" max="90" label="'NEW' badge window (days)"></div>
      <div class="inputContainer"><input is="emby-input" type="text" id="DefaultRowOrder" label="Default row order (comma separated)"></div>
      <div class="inputContainer"><input is="emby-input" type="text" id="DefaultHiddenRows" label="Rows hidden by default (comma separated)"></div>
      <button is="emby-button" type="submit" class="raised button-submit block"><span>Save</span></button>
    </form>
  </div></div>
  <script type="text/javascript">
    (function () {
      var id = '7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c';
      var page = document.querySelector('#TideConfigPage');
      var bools = ['EnableTheme', 'EnableIcons', 'EnableHome', 'EnableTrailers'];
      var nums = ['HeroSize', 'HeroSlotSeconds', 'NewDays'];
      var lists = ['DefaultRowOrder', 'DefaultHiddenRows'];
      page.addEventListener('pageshow', function () {
        Dashboard.showLoadingMsg();
        ApiClient.getPluginConfiguration(id).then(function (c) {
          bools.forEach(function (k) { page.querySelector('#' + k).checked = c[k]; });
          nums.forEach(function (k) { page.querySelector('#' + k).value = c[k]; });
          lists.forEach(function (k) { page.querySelector('#' + k).value = (c[k] || []).join(', '); });
          Dashboard.hideLoadingMsg();
        });
      });
      page.querySelector('#TideConfigForm').addEventListener('submit', function (e) {
        e.preventDefault();
        Dashboard.showLoadingMsg();
        ApiClient.getPluginConfiguration(id).then(function (c) {
          bools.forEach(function (k) { c[k] = page.querySelector('#' + k).checked; });
          nums.forEach(function (k) { c[k] = parseInt(page.querySelector('#' + k).value, 10); });
          lists.forEach(function (k) {
            c[k] = page.querySelector('#' + k).value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          });
          ApiClient.updatePluginConfiguration(id, c).then(Dashboard.processPluginConfigurationUpdateResult);
        });
        return false;
      });
    })();
  </script>
</div>
</body>
</html>
```

- [ ] **Step 3: Test project with a smoke test**

`server/Jellyfin.Plugin.Tide.Tests/Jellyfin.Plugin.Tide.Tests.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.13.0" />
    <PackageReference Include="xunit" Version="2.9.3" />
    <PackageReference Include="xunit.runner.visualstudio" Version="3.0.2" />
    <PackageReference Include="Jellyfin.Controller" Version="12.4.0" />
    <PackageReference Include="Jellyfin.Model" Version="12.4.0" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\Jellyfin.Plugin.Tide\Jellyfin.Plugin.Tide.csproj" />
  </ItemGroup>
</Project>
```

`server/Jellyfin.Plugin.Tide.Tests/SmokeTests.cs`:
```csharp
using Jellyfin.Plugin.Tide.Configuration;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class SmokeTests
{
    [Fact]
    public void DefaultConfigHasAllRows()
    {
        var c = new PluginConfiguration();
        Assert.Equal(14, c.DefaultRowOrder.Length);
        Assert.Equal(6, c.HeroSize);
    }
}
```

Run: `./scripts/dotnet new sln -n Tide && ./scripts/dotnet sln Tide.slnx add server/Jellyfin.Plugin.Tide/Jellyfin.Plugin.Tide.csproj server/Jellyfin.Plugin.Tide.Tests/Jellyfin.Plugin.Tide.Tests.csproj`
Expected: two "Project … added to the solution" lines.

- [ ] **Step 4: Web project**

`web/package.json`:
```json
{
  "name": "tide-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "vite build",
    "watch": "vite build --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@fontsource-variable/inter": "5.2.5",
    "jsdom": "26.1.0",
    "material-symbols": "0.31.3",
    "typescript": "5.8.3",
    "vite": "6.3.5",
    "vitest": "3.1.4"
  }
}
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

`web/vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Tide/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.ts',
      name: 'Tide',
      formats: ['iife'],
      fileName: () => 'client.js',
      cssFileName: 'client',
    },
    rollupOptions: { output: { assetFileNames: 'assets/[name][extname]' } },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['test/setup.ts'] },
});
```

`web/src/main.ts`:
```ts
export const TIDE_VERSION = '0.1.0';
console.info(`[Tide] ${TIDE_VERSION} loaded`);
```

`web/test/setup.ts` (runs before every test file; stops `main.ts` from auto-booting under test):
```ts
(window as unknown as { __TIDE_TEST__: boolean }).__TIDE_TEST__ = true;
```

`web/test/smoke.test.ts`:
```ts
import { TIDE_VERSION } from '../src/main';

test('version is set', () => {
  expect(TIDE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
```

Run: `cd web && npm install && npm test && npm run build && ls dist`
Expected: 1 test passes; `dist/` lists `client.js`.

- [ ] **Step 5: Build the server with the web bundle embedded and run the smoke test**

Run: `./scripts/dotnet test Tide.slnx`
Expected: `Passed!  - Failed: 0, Passed: 1`.

- [ ] **Step 6: Commit**

Append to `.gitignore`:
```
web/node_modules/
web/dist/
e2e/node_modules/
e2e/media/
e2e/config/
e2e/test-results/
```
```bash
git add -A
git commit -m "chore: scaffold Tide plugin, web bundle and test toolchain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Local Jellyfin 12.4 dev environment and DOM discovery

**Files:**
- Create: `e2e/docker-compose.yml`, `e2e/fetch-media.sh`, `e2e/setup.mjs`, `e2e/package.json`, `e2e/discover.mjs`, `docs/notes/web-12.4-dom.md`, `web/src/router/selectors.ts`

**Interfaces:**
- Produces:
  - a running Jellyfin at `http://localhost:8096`, admin `tide` / `tide`, with libraries Movies + Shows, and the plugin loaded from `e2e/plugins/Tide`
  - `web/src/router/selectors.ts` exporting `SELECTORS` and `ROUTES` (exact shape below); every later web task imports DOM selectors and routes only from here
  - `e2e/setup.mjs` exporting `getToken(): Promise<string>`

- [ ] **Step 1: Docker compose and media**

`e2e/docker-compose.yml`:
```yaml
services:
  jellyfin:
    image: jellyfin/jellyfin:12.4.0
    container_name: tide-jellyfin
    ports: ["8096:8096"]
    volumes:
      - ./config:/config
      - ./media:/media:ro
      - ./plugins/Tide:/config/plugins/Tide_0.1.0.0
    restart: "no"
```

`e2e/fetch-media.sh`:
```sh
#!/usr/bin/env sh
# Small open-licence films (Blender Foundation, CC-BY) for local testing.
set -e
cd "$(dirname "$0")"
mkdir -p "media/Movies/Big Buck Bunny (2008)" "media/Movies/Sintel (2010)" "media/Shows/Blender Shorts/Season 01"
dl() { [ -f "$2" ] || curl -L --fail -o "$2" "$1"; }
dl https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4 "media/Movies/Big Buck Bunny (2008)/Big Buck Bunny (2008).mp4"
dl https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4 "media/Movies/Sintel (2010)/Sintel (2010).mp4"
dl https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4 "media/Shows/Blender Shorts/Season 01/Blender Shorts S01E01.mp4"
dl https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4 "media/Shows/Blender Shorts/Season 01/Blender Shorts S01E02.mp4"
```

`e2e/package.json`:
```json
{
  "name": "tide-e2e",
  "private": true,
  "type": "module",
  "scripts": { "setup": "node setup.mjs", "discover": "node discover.mjs", "test": "playwright test" },
  "devDependencies": { "@playwright/test": "1.52.0" }
}
```

- [ ] **Step 2: Headless startup wizard + libraries**

`e2e/setup.mjs`:
```js
// Completes the Jellyfin startup wizard and creates Movies + Shows libraries. Idempotent.
const BASE = process.env.JF_URL ?? 'http://localhost:8096';
const AUTH = 'MediaBrowser Client="tide-e2e", Device="e2e", DeviceId="tide-e2e", Version="0.1.0"';

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json', Authorization: token ? `${AUTH}, Token="${token}"` : AUTH };
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok && r.status !== 204) throw new Error(`${method} ${path} -> ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function waitUp() {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(BASE + '/System/Info/Public'); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Jellyfin did not start');
}

export async function getToken() {
  const r = await req('/Users/AuthenticateByName', { method: 'POST', body: { Username: 'tide', Pw: 'tide' } });
  return r.AccessToken;
}

export async function setup() {
  await waitUp();
  const info = await (await fetch(BASE + '/System/Info/Public')).json();
  if (!info.StartupWizardCompleted) {
    await req('/Startup/Configuration', { method: 'POST', body: { UICulture: 'en-US', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' } });
    await req('/Startup/User');
    await req('/Startup/User', { method: 'POST', body: { Name: 'tide', Password: 'tide' } });
    await req('/Startup/RemoteAccess', { method: 'POST', body: { EnableRemoteAccess: true, EnableAutomaticPortMapping: false } });
    await req('/Startup/Complete', { method: 'POST' });
  }
  const token = await getToken();
  const folders = await req('/Library/VirtualFolders', { token });
  const have = new Set(folders.map((f) => f.Name));
  for (const [name, type, path] of [['Movies', 'movies', '/media/Movies'], ['Shows', 'tvshows', '/media/Shows']]) {
    if (!have.has(name)) {
      await req(`/Library/VirtualFolders?name=${name}&collectionType=${type}&refreshLibrary=true`, {
        method: 'POST', token, body: { LibraryOptions: { PathInfos: [{ Path: path }] } },
      });
    }
  }
  console.log('setup ok');
}

if (import.meta.url === `file://${process.argv[1]}`) await setup();
```

Run:
```bash
chmod +x e2e/fetch-media.sh && e2e/fetch-media.sh
mkdir -p e2e/plugins/Tide && (cd e2e && docker compose up -d && npm install && npx playwright install chromium && npm run setup)
```
Expected: `setup ok`; `http://localhost:8096` shows a login page.

- [ ] **Step 3: DOM discovery script**

`e2e/discover.mjs`:
```js
// Logs in and records the Modern-layout DOM facts Tide depends on. Output -> docs/notes/web-12.4-dom.md (paste).
import { chromium } from '@playwright/test';
const BASE = process.env.JF_URL ?? 'http://localhost:8096';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(BASE + '/web/');
await p.waitForSelector('input[type=password]', { timeout: 30000 });
await p.fill('input[type=text], input[name=username], #txtManualName', 'tide');
await p.fill('input[type=password]', 'tide');
await p.keyboard.press('Enter');
await p.waitForTimeout(6000);
const facts = await p.evaluate(() => {
  const q = (s) => !!document.querySelector(s);
  const cls = (el) => el ? `${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join('.')}` : null;
  const main = document.querySelector('main') || document.querySelector('[role=main]');
  return {
    url: location.href,
    hasApiClient: typeof window.ApiClient,
    apiClientFns: window.ApiClient ? ['serverAddress', 'accessToken', 'getCurrentUserId', 'serverId'].map((f) => `${f}:${typeof window.ApiClient[f]}`) : [],
    globals: ['playbackManager', 'Emby', 'appRouter', 'Dashboard'].map((g) => `${g}:${typeof window[g]}`),
    appBar: cls(document.querySelector('.MuiAppBar-root')),
    skinHeader: q('.skinHeader'),
    main: cls(main),
    homeCandidates: ['#indexPage', '.homePage', '[data-testid=home]', '.homeSectionsContainer', '.sections'].map((s) => `${s}:${q(s)}`),
    mainChildren: main ? [...main.children].map(cls) : [],
    muiIconTestIds: [...new Set([...document.querySelectorAll('svg[data-testid]')].map((s) => s.getAttribute('data-testid')))],
    fontIcons: [...new Set([...document.querySelectorAll('.material-icons, span.material-icons')].map((s) => s.textContent.trim() || [...s.classList].join('.')))],
  };
});
console.log(JSON.stringify(facts, null, 2));
await p.screenshot({ path: 'discover-home.png', fullPage: true });
await b.close();
```
Run: `cd e2e && npm run discover > ../docs/notes/web-12.4-dom.json && cat ../docs/notes/web-12.4-dom.json`
Expected: JSON with `"hasApiClient": "object"` and a URL that contains `#/home` or `/home`.

- [ ] **Step 4: Record selectors from discovery**

Write `docs/notes/web-12.4-dom.md` containing the JSON from Step 3 and one line per selector below, saying which discovered element it matches.

`web/src/router/selectors.ts`:
- Use the discovered values. The defaults below are already confirmed facts: `ApiClient`, `#/` hash routes and MUI class names.
- If discovery shows the home content lives in a different element, change only `homeHost`.
- If the URL is not hash-based, set `hashRouting` to false.
```ts
/** Single source of truth for jellyfin-web 12.4 Modern-layout DOM hooks. Update from docs/notes/web-12.4-dom.md. */
export const WEB_VERIFIED_VERSION = '12.4';

export const SELECTORS = {
  /** Element whose children are the stock home page; Tide hides children and mounts beside them. */
  homeHost: 'main, [role="main"], .mainAnimatedPages',
  /** Top app bar (N1 nav restyle target). */
  appBar: '.MuiAppBar-root',
  /** Legacy header (still present on some pages). */
  legacyHeader: '.skinHeader',
} as const;

export const ROUTING = { hashRouting: true } as const;

const r = (path: string) => (ROUTING.hashRouting ? `#/${path}` : `/web/${path}`);

export const ROUTES = {
  home: r('home'),
  movies: r('movies'),
  shows: r('tv'),
  music: r('music'),
  search: r('search'),
  details: (id: string) => r(`details?id=${encodeURIComponent(id)}`),
  isHome: (loc: Location = location) =>
    ROUTING.hashRouting ? /^#\/(home)?(\?|$)/.test(loc.hash) : /\/web\/home\/?$/.test(loc.pathname),
};
```

- [ ] **Step 5: Commit**

```bash
git add e2e docs/notes web/src/router/selectors.ts
git commit -m "chore: add local Jellyfin 12.4 env and record Modern-layout DOM facts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server DTOs and QualityMapper

**Files:**
- Modify: `server/Jellyfin.Plugin.Tide/Models/Dtos.cs` (replace stub)
- Create: `server/Jellyfin.Plugin.Tide/Quality/QualityMapper.cs`
- Test: `server/Jellyfin.Plugin.Tide.Tests/QualityMapperTests.cs`

**Interfaces:**
- Produces:
  - `QualityDto(string Res, string Codec, string? Range, string? Audio)`
  - `QualityMapper.Map(IReadOnlyList<SourceStreams> sources) -> QualityDto?`
  - `SourceStreams(IReadOnlyList<VideoStream> Video, IReadOnlyList<AudioStream> Audio)`
  - `VideoStream(int? Width, string? Codec, string? RangeType)`
  - `AudioStream(string? Profile, int? Channels, bool IsDefault)`
  - `HeroItemDto`, `EpisodeRef`, `ProgressDto`, `UserPrefs`, `ClientConfig`, `HomeResponse`, `QualityRequest`
  - `RowIds.All`

- [ ] **Step 1: Write the failing tests**

`server/Jellyfin.Plugin.Tide.Tests/QualityMapperTests.cs`:
```csharp
using Jellyfin.Plugin.Tide.Quality;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class QualityMapperTests
{
    private static SourceStreams S(int? w, string codec, string range, string? profile = null, int? ch = 6, bool def = true) =>
        new(new[] { new VideoStream(w, codec, range) }, new[] { new AudioStream(profile, ch, def) });

    [Theory]
    [InlineData(3840, "4K")]
    [InlineData(3832, "4K")]
    [InlineData(1920, "1080p")]
    [InlineData(1280, "720p")]
    [InlineData(720, "SD")]
    public void Resolution(int width, string expected) =>
        Assert.Equal(expected, QualityMapper.Map(new[] { S(width, "hevc", "SDR") })!.Res);

    [Theory]
    [InlineData("hevc", "HEVC")]
    [InlineData("av1", "AV1")]
    [InlineData("h264", "H.264")]
    [InlineData("vc1", "VC-1")]
    [InlineData("mpeg2video", "MPEG-2")]
    [InlineData("vp9", "VP9")]
    public void Codec(string codec, string expected) =>
        Assert.Equal(expected, QualityMapper.Map(new[] { S(1920, codec, "SDR") })!.Codec);

    [Theory]
    [InlineData("SDR", null)]
    [InlineData("HDR10", "HDR10")]
    [InlineData("HDR10Plus", "HDR10+")]
    [InlineData("HLG", "HLG")]
    [InlineData("DOVI", "DV")]
    [InlineData("DOVIWithHDR10", "DV")]
    [InlineData("DOVIWithHDR10Plus", "DV")]
    [InlineData("DOVIInvalid", "DV")]
    [InlineData("Unknown", null)]
    public void Range(string rangeType, string? expected) =>
        Assert.Equal(expected, QualityMapper.Map(new[] { S(3840, "hevc", rangeType) })!.Range);

    [Theory]
    [InlineData("Dolby TrueHD + Dolby Atmos", 8, "Atmos")]
    [InlineData("Dolby Digital Plus + Dolby Atmos", 6, "Atmos")]
    [InlineData("LC", 8, "7.1")]
    [InlineData("LC", 6, "5.1")]
    [InlineData(null, 2, "Stereo")]
    [InlineData(null, 1, null)]
    public void Audio(string? profile, int ch, string? expected) =>
        Assert.Equal(expected, QualityMapper.Map(new[] { S(1920, "h264", "SDR", profile, ch) })!.Audio);

    [Fact]
    public void PrefersDefaultAudioStream()
    {
        var src = new SourceStreams(
            new[] { new VideoStream(1920, "h264", "SDR") },
            new[] { new AudioStream(null, 2, false), new AudioStream("Dolby Atmos", 8, true) });
        Assert.Equal("Atmos", QualityMapper.Map(new[] { src })!.Audio);
    }

    [Fact]
    public void PicksHighestResolutionSource()
    {
        var q = QualityMapper.Map(new[] { S(1920, "h264", "SDR"), S(3840, "hevc", "HDR10") })!;
        Assert.Equal("4K", q.Res);
        Assert.Equal("HEVC", q.Codec);
    }

    [Fact]
    public void NoVideoReturnsNull() =>
        Assert.Null(QualityMapper.Map(new[] { new SourceStreams(Array.Empty<VideoStream>(), Array.Empty<AudioStream>()) }));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/dotnet test Tide.slnx --filter QualityMapperTests`
Expected: build error `The type or namespace name 'Quality' does not exist`.

- [ ] **Step 3: Implement DTOs and mapper**

`server/Jellyfin.Plugin.Tide/Models/Dtos.cs`:
```csharp
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.Tide.Models;

public static class RowIds
{
    public static readonly IReadOnlyList<string> All = new[]
    {
        "continue", "nextUp", "latestMovies", "latestShows", "becauseYouWatched", "topRated",
        "genre1", "genre2", "genre3", "favourites", "random", "collections", "musicAlbums", "musicArtists",
    };

    public static readonly IReadOnlySet<string> Genres = new HashSet<string> { "genre1", "genre2", "genre3" };
}

public sealed record QualityDto(
    [property: JsonPropertyName("res")] string Res,
    [property: JsonPropertyName("codec")] string Codec,
    [property: JsonPropertyName("range")] string? Range,
    [property: JsonPropertyName("audio")] string? Audio);

public sealed record EpisodeRef(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("season")] int Season,
    [property: JsonPropertyName("number")] int Number,
    [property: JsonPropertyName("name")] string Name);

public sealed record ProgressDto(
    [property: JsonPropertyName("percent")] int Percent,
    [property: JsonPropertyName("minutesLeft")] int MinutesLeft);

public sealed class HeroItemDto
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("type")] public string Type { get; init; } = "Movie";
    [JsonPropertyName("reason")] public string Reason { get; init; } = "topRated";
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    [JsonPropertyName("year")] public int? Year { get; init; }
    [JsonPropertyName("genres")] public string[] Genres { get; init; } = Array.Empty<string>();
    [JsonPropertyName("officialRating")] public string? OfficialRating { get; init; }
    [JsonPropertyName("communityRating")] public float? CommunityRating { get; init; }
    [JsonPropertyName("criticRating")] public float? CriticRating { get; init; }
    [JsonPropertyName("runtimeMinutes")] public int? RuntimeMinutes { get; init; }
    [JsonPropertyName("seasonCount")] public int? SeasonCount { get; init; }
    [JsonPropertyName("overview")] public string Overview { get; init; } = "";
    [JsonPropertyName("episode")] public EpisodeRef? Episode { get; init; }
    [JsonPropertyName("progress")] public ProgressDto? Progress { get; init; }
    [JsonPropertyName("quality")] public QualityDto? Quality { get; init; }
    [JsonPropertyName("hasLogo")] public bool HasLogo { get; init; }
    [JsonPropertyName("youtube")] public string[] Youtube { get; init; } = Array.Empty<string>();
    [JsonPropertyName("playTargetId")] public string PlayTargetId { get; init; } = "";
}

public sealed class UserPrefs
{
    [JsonPropertyName("rowOrder")] public string[] RowOrder { get; set; } = Array.Empty<string>();
    [JsonPropertyName("hidden")] public string[] Hidden { get; set; } = Array.Empty<string>();
    [JsonPropertyName("genres")] public Dictionary<string, string?> Genres { get; set; } = new();
    [JsonPropertyName("edited")] public bool Edited { get; set; }
}

public sealed record ClientConfig(
    [property: JsonPropertyName("enableTheme")] bool EnableTheme,
    [property: JsonPropertyName("enableIcons")] bool EnableIcons,
    [property: JsonPropertyName("enableHome")] bool EnableHome,
    [property: JsonPropertyName("enableTrailers")] bool EnableTrailers,
    [property: JsonPropertyName("heroSlotSeconds")] int HeroSlotSeconds,
    [property: JsonPropertyName("newDays")] int NewDays,
    [property: JsonPropertyName("version")] string Version);

public sealed record HomeResponse(
    [property: JsonPropertyName("hero")] IReadOnlyList<HeroItemDto> Hero,
    [property: JsonPropertyName("prefs")] UserPrefs Prefs,
    [property: JsonPropertyName("config")] ClientConfig Config);

public sealed class QualityRequest
{
    [JsonPropertyName("ids")] public string[] Ids { get; set; } = Array.Empty<string>();
}
```

`server/Jellyfin.Plugin.Tide/Quality/QualityMapper.cs`:
```csharp
using Jellyfin.Plugin.Tide.Models;

namespace Jellyfin.Plugin.Tide.Quality;

public sealed record VideoStream(int? Width, string? Codec, string? RangeType);

public sealed record AudioStream(string? Profile, int? Channels, bool IsDefault);

public sealed record SourceStreams(IReadOnlyList<VideoStream> Video, IReadOnlyList<AudioStream> Audio);

public static class QualityMapper
{
    public static QualityDto? Map(IReadOnlyList<SourceStreams> sources)
    {
        var best = sources
            .Select(s => (Source: s, Video: s.Video.FirstOrDefault()))
            .Where(x => x.Video is not null)
            .OrderByDescending(x => x.Video!.Width ?? 0)
            .FirstOrDefault();
        if (best.Video is null)
        {
            return null;
        }

        var audio = best.Source.Audio.FirstOrDefault(a => a.IsDefault) ?? best.Source.Audio.FirstOrDefault();
        return new QualityDto(Res(best.Video.Width), Codec(best.Video.Codec), Range(best.Video.RangeType), Audio(audio));
    }

    internal static string Res(int? width) => width switch
    {
        >= 3800 => "4K",
        >= 1900 => "1080p",
        >= 1260 => "720p",
        _ => "SD",
    };

    internal static string Codec(string? codec) => (codec ?? string.Empty).ToLowerInvariant() switch
    {
        "hevc" or "h265" => "HEVC",
        "av1" => "AV1",
        "h264" or "avc" => "H.264",
        "vc1" => "VC-1",
        "mpeg2video" => "MPEG-2",
        var other => other.ToUpperInvariant(),
    };

    internal static string? Range(string? rangeType)
    {
        if (string.IsNullOrEmpty(rangeType))
        {
            return null;
        }

        if (rangeType.StartsWith("DOVI", StringComparison.OrdinalIgnoreCase))
        {
            return "DV";
        }

        return rangeType switch
        {
            "HDR10" => "HDR10",
            "HDR10Plus" => "HDR10+",
            "HLG" => "HLG",
            _ => null,
        };
    }

    internal static string? Audio(AudioStream? a)
    {
        if (a is null)
        {
            return null;
        }

        if (a.Profile?.Contains("Atmos", StringComparison.OrdinalIgnoreCase) == true)
        {
            return "Atmos";
        }

        return a.Channels switch
        {
            >= 8 => "7.1",
            6 => "5.1",
            2 => "Stereo",
            _ => null,
        };
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/dotnet test Tide.slnx --filter QualityMapperTests`
Expected: `Passed!  - Failed: 0, Passed: 29`.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add DTOs and file-quality mapper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: HeroSelector (smart mix)

**Files:**
- Create: `server/Jellyfin.Plugin.Tide/Hero/HeroSelector.cs`
- Test: `server/Jellyfin.Plugin.Tide.Tests/HeroSelectorTests.cs`

**Interfaces:**
- Produces:
  - `enum HeroReason { Resume, NextEpisode, NewEpisode, New, TopRated }`
  - `HeroCandidate(string Key, Guid ItemId, HeroReason Reason, bool HasBackdrop, bool HasLogo)`
  - `HeroSelector.Select(IReadOnlyList<HeroCandidate> personal, IReadOnlyList<HeroCandidate> newest, IReadOnlyList<HeroCandidate> topRated, int size) -> IReadOnlyList<HeroCandidate>`
  - `HeroSelector.ReasonString(HeroReason) -> string`, returning `"resume"|"nextEpisode"|"newEpisode"|"new"|"topRated"`

**Rules (from spec 5.1):**
- quota `size/3` per pool; the remainder goes to personal
- de-duplicate by `Key` (series ID for episodes)
- skip candidates without a backdrop
- top up from the other pools in the order personal → newest → topRated
- topRated: candidates with a logo first (stable ordering)
- output interleaved round-robin: personal, newest, topRated

- [ ] **Step 1: Write the failing tests**

`server/Jellyfin.Plugin.Tide.Tests/HeroSelectorTests.cs`:
```csharp
using Jellyfin.Plugin.Tide.Hero;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class HeroSelectorTests
{
    private static HeroCandidate C(string key, HeroReason r, bool backdrop = true, bool logo = true) =>
        new(key, Guid.NewGuid(), r, backdrop, logo);

    private static List<HeroCandidate> Many(string prefix, HeroReason r, int n) =>
        Enumerable.Range(0, n).Select(i => C(prefix + i, r)).ToList();

    [Fact]
    public void TwoOfEachInterleaved()
    {
        var res = HeroSelector.Select(Many("p", HeroReason.Resume, 5), Many("n", HeroReason.New, 5), Many("t", HeroReason.TopRated, 5), 6);
        Assert.Equal(new[] { "p0", "n0", "t0", "p1", "n1", "t1" }, res.Select(x => x.Key));
    }

    [Fact]
    public void DeduplicatesAcrossPools()
    {
        var res = HeroSelector.Select(
            new[] { C("a", HeroReason.Resume), C("b", HeroReason.Resume) },
            new[] { C("a", HeroReason.New), C("c", HeroReason.New), C("d", HeroReason.New) },
            new[] { C("b", HeroReason.TopRated), C("e", HeroReason.TopRated), C("f", HeroReason.TopRated) },
            6);
        Assert.Equal(6, res.Count);
        Assert.Equal(res.Count, res.Select(x => x.Key).Distinct().Count());
    }

    [Fact]
    public void TopsUpWhenPoolShort()
    {
        var res = HeroSelector.Select(Array.Empty<HeroCandidate>(), Many("n", HeroReason.New, 5), Many("t", HeroReason.TopRated, 5), 6);
        Assert.Equal(6, res.Count);
        // quotas 2/2/2; personal is empty, so top-up runs personal -> newest -> topRated: newest fills first
        Assert.Equal(4, res.Count(x => x.Reason == HeroReason.New));
        Assert.Equal(2, res.Count(x => x.Reason == HeroReason.TopRated));
    }

    [Fact]
    public void SkipsCandidatesWithoutBackdrop()
    {
        var res = HeroSelector.Select(new[] { C("x", HeroReason.Resume, backdrop: false) }, Many("n", HeroReason.New, 1), Array.Empty<HeroCandidate>(), 6);
        Assert.Equal(new[] { "n0" }, res.Select(x => x.Key));
    }

    [Fact]
    public void TopRatedPrefersLogo()
    {
        var res = HeroSelector.Select(Array.Empty<HeroCandidate>(), Array.Empty<HeroCandidate>(),
            new[] { C("nologo", HeroReason.TopRated, logo: false), C("logo", HeroReason.TopRated) }, 1);
        Assert.Equal("logo", res.Single().Key);
    }

    [Fact]
    public void RespectsSize()
    {
        Assert.Equal(3, HeroSelector.Select(Many("p", HeroReason.Resume, 9), Many("n", HeroReason.New, 9), Many("t", HeroReason.TopRated, 9), 3).Count);
    }

    [Theory]
    [InlineData(HeroReason.Resume, "resume")]
    [InlineData(HeroReason.NextEpisode, "nextEpisode")]
    [InlineData(HeroReason.NewEpisode, "newEpisode")]
    [InlineData(HeroReason.New, "new")]
    [InlineData(HeroReason.TopRated, "topRated")]
    public void ReasonStrings(HeroReason r, string s) => Assert.Equal(s, HeroSelector.ReasonString(r));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/dotnet test Tide.slnx --filter HeroSelectorTests`
Expected: build error `The type or namespace name 'Hero' does not exist`.

- [ ] **Step 3: Implement**

`server/Jellyfin.Plugin.Tide/Hero/HeroSelector.cs`:
```csharp
namespace Jellyfin.Plugin.Tide.Hero;

public enum HeroReason
{
    Resume,
    NextEpisode,
    NewEpisode,
    New,
    TopRated,
}

public sealed record HeroCandidate(string Key, Guid ItemId, HeroReason Reason, bool HasBackdrop, bool HasLogo);

public static class HeroSelector
{
    public static IReadOnlyList<HeroCandidate> Select(
        IReadOnlyList<HeroCandidate> personal,
        IReadOnlyList<HeroCandidate> newest,
        IReadOnlyList<HeroCandidate> topRated,
        int size)
    {
        if (size <= 0)
        {
            return Array.Empty<HeroCandidate>();
        }

        var pools = new[]
        {
            new Queue<HeroCandidate>(personal.Where(c => c.HasBackdrop)),
            new Queue<HeroCandidate>(newest.Where(c => c.HasBackdrop)),
            new Queue<HeroCandidate>(topRated.Where(c => c.HasBackdrop).OrderByDescending(c => c.HasLogo)),
        };
        var quota = size / 3;
        var quotas = new[] { quota + (size % 3), quota, quota };
        var used = new HashSet<string>();
        var picked = new List<HeroCandidate>[] { new(), new(), new() };

        bool TakeFrom(int pool)
        {
            while (pools[pool].Count > 0)
            {
                var c = pools[pool].Dequeue();
                if (used.Add(c.Key))
                {
                    picked[pool].Add(c);
                    return true;
                }
            }

            return false;
        }

        for (var p = 0; p < 3; p++)
        {
            for (var i = 0; i < quotas[p]; i++)
            {
                if (!TakeFrom(p))
                {
                    break;
                }
            }
        }

        var total = picked.Sum(l => l.Count);
        for (var p = 0; p < 3 && total < size; p++)
        {
            while (total < size && TakeFrom(p))
            {
                total++;
            }
        }

        var result = new List<HeroCandidate>(size);
        for (var round = 0; result.Count < total; round++)
        {
            for (var p = 0; p < 3; p++)
            {
                if (round < picked[p].Count)
                {
                    result.Add(picked[p][round]);
                }
            }
        }

        return result;
    }

    public static string ReasonString(HeroReason reason) => reason switch
    {
        HeroReason.Resume => "resume",
        HeroReason.NextEpisode => "nextEpisode",
        HeroReason.NewEpisode => "newEpisode",
        HeroReason.New => "new",
        _ => "topRated",
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/dotnet test Tide.slnx --filter HeroSelectorTests`
Expected: `Passed!  - Failed: 0, Passed: 11`.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add hero smart-mix selector

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: UserPrefsStore

**Files:**
- Create: `server/Jellyfin.Plugin.Tide/Prefs/UserPrefsStore.cs`
- Test: `server/Jellyfin.Plugin.Tide.Tests/UserPrefsStoreTests.cs`

**Interfaces:**
- Consumes: `UserPrefs`, `RowIds` (Task 3)
- Produces:
  - `UserPrefsStore(string directory)`
  - `UserPrefs Load(Guid userId, string[] defaultOrder, string[] defaultHidden)`
  - `void Save(Guid userId, UserPrefs prefs)`
  - `static UserPrefs Normalize(UserPrefs p)`

**Rules:**
- Unknown row IDs are dropped and duplicates removed.
- Rows missing from `RowOrder` are appended in `RowIds.All` order.
- `Genres` keeps only `genre1..3` keys.
- A user with no file (or `Edited == false`) gets the admin defaults.

- [ ] **Step 1: Write the failing tests**

`server/Jellyfin.Plugin.Tide.Tests/UserPrefsStoreTests.cs`:
```csharp
using Jellyfin.Plugin.Tide.Models;
using Jellyfin.Plugin.Tide.Prefs;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public sealed class UserPrefsStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "tide-" + Guid.NewGuid());

    public void Dispose()
    {
        if (Directory.Exists(_dir))
        {
            Directory.Delete(_dir, true);
        }
    }

    [Fact]
    public void NoFileReturnsDefaults()
    {
        var store = new UserPrefsStore(_dir);
        var p = store.Load(Guid.NewGuid(), new[] { "topRated", "continue" }, new[] { "random" });
        Assert.Equal("topRated", p.RowOrder[0]);
        Assert.Equal("continue", p.RowOrder[1]);
        Assert.Equal(14, p.RowOrder.Length);
        Assert.Equal(new[] { "random" }, p.Hidden);
        Assert.False(p.Edited);
    }

    [Fact]
    public void SaveThenLoadRoundTrips()
    {
        var store = new UserPrefsStore(_dir);
        var id = Guid.NewGuid();
        store.Save(id, new UserPrefs { RowOrder = new[] { "random", "continue" }, Hidden = new[] { "collections" }, Genres = new() { ["genre1"] = "Sci-Fi" }, Edited = true });
        var p = store.Load(id, RowIds.All.ToArray(), Array.Empty<string>());
        Assert.Equal("random", p.RowOrder[0]);
        Assert.Equal(new[] { "collections" }, p.Hidden);
        Assert.Equal("Sci-Fi", p.Genres["genre1"]);
        Assert.True(p.Edited);
    }

    [Fact]
    public void NormalizeDropsUnknownAndDuplicatesAndAppendsMissing()
    {
        var p = UserPrefsStore.Normalize(new UserPrefs
        {
            RowOrder = new[] { "random", "bogus", "random", "continue" },
            Hidden = new[] { "bogus", "collections", "collections" },
            Genres = new() { ["genre1"] = "Drama", ["evil"] = "x" },
        });
        Assert.Equal(new[] { "random", "continue" }, p.RowOrder.Take(2));
        Assert.Equal(14, p.RowOrder.Length);
        Assert.Equal(new[] { "collections" }, p.Hidden);
        Assert.False(p.Genres.ContainsKey("evil"));
    }

    [Fact]
    public void CorruptFileFallsBackToDefaults()
    {
        var store = new UserPrefsStore(_dir);
        var id = Guid.NewGuid();
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, id.ToString("N") + ".json"), "{not json");
        Assert.False(store.Load(id, RowIds.All.ToArray(), Array.Empty<string>()).Edited);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/dotnet test Tide.slnx --filter UserPrefsStoreTests`
Expected: build error `The type or namespace name 'Prefs' does not exist`.

- [ ] **Step 3: Implement**

`server/Jellyfin.Plugin.Tide/Prefs/UserPrefsStore.cs`:
```csharp
using System.Text.Json;
using Jellyfin.Plugin.Tide.Models;

namespace Jellyfin.Plugin.Tide.Prefs;

public sealed class UserPrefsStore
{
    private readonly string _directory;
    private readonly object _lock = new();

    public UserPrefsStore(string directory)
    {
        _directory = directory;
    }

    public UserPrefs Load(Guid userId, string[] defaultOrder, string[] defaultHidden)
    {
        var path = PathFor(userId);
        lock (_lock)
        {
            if (File.Exists(path))
            {
                try
                {
                    var p = JsonSerializer.Deserialize<UserPrefs>(File.ReadAllText(path));
                    if (p is { Edited: true })
                    {
                        return Normalize(p);
                    }
                }
                catch (JsonException)
                {
                    // fall through to defaults
                }
            }
        }

        return Normalize(new UserPrefs { RowOrder = defaultOrder, Hidden = defaultHidden, Edited = false });
    }

    public void Save(Guid userId, UserPrefs prefs)
    {
        var normalized = Normalize(prefs);
        normalized.Edited = true;
        lock (_lock)
        {
            Directory.CreateDirectory(_directory);
            var tmp = PathFor(userId) + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(normalized));
            File.Move(tmp, PathFor(userId), true);
        }
    }

    public static UserPrefs Normalize(UserPrefs p)
    {
        var known = new HashSet<string>(RowIds.All);
        var order = (p.RowOrder ?? Array.Empty<string>()).Where(known.Contains).Distinct().ToList();
        order.AddRange(RowIds.All.Where(id => !order.Contains(id)));
        return new UserPrefs
        {
            RowOrder = order.ToArray(),
            Hidden = (p.Hidden ?? Array.Empty<string>()).Where(known.Contains).Distinct().ToArray(),
            Genres = (p.Genres ?? new()).Where(kv => RowIds.Genres.Contains(kv.Key)).ToDictionary(kv => kv.Key, kv => kv.Value),
            Edited = p.Edited,
        };
    }

    private string PathFor(Guid userId) => Path.Combine(_directory, userId.ToString("N") + ".json");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/dotnet test Tide.slnx --filter UserPrefsStoreTests`
Expected: `Passed!  - Failed: 0, Passed: 4`.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add per-user home row preferences store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: IndexPatcher, File Transformation bridge, ScriptInjector

**Files:**
- Create: `server/Jellyfin.Plugin.Tide/Injection/IndexPatcher.cs`, `server/Jellyfin.Plugin.Tide/Injection/FileTransformationBridge.cs`, `server/Jellyfin.Plugin.Tide/Injection/ScriptInjector.cs`, `server/Jellyfin.Plugin.Tide/PluginServiceRegistrator.cs`
- Modify: `server/Jellyfin.Plugin.Tide/Plugin.cs` (add `OnUninstalling` override)
- Test: `server/Jellyfin.Plugin.Tide.Tests/IndexPatcherTests.cs`

**Interfaces:**
- Produces:
  - `IndexPatcher.Patch(string html, string version) -> string`
  - `IndexPatcher.Unpatch(string html) -> string`
  - `FileTransformationBridge.TryRegister(ILogger) -> bool`
  - `FileTransformationBridge.Transform(PatchPayload) -> string` (static callback)
  - `ScriptInjector` (IHostedService)
  - DI registrations for `UserPrefsStore`, `QualityService`, `HeroService`, used by Tasks 7–8

- [ ] **Step 1: Write the failing tests**

`server/Jellyfin.Plugin.Tide.Tests/IndexPatcherTests.cs`:
```csharp
using Jellyfin.Plugin.Tide.Injection;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class IndexPatcherTests
{
    private const string Html = "<!doctype html><html><head><title>Jellyfin</title></head><body></body></html>";

    [Fact]
    public void InsertsBlockBeforeHeadClose()
    {
        var p = IndexPatcher.Patch(Html, "0.1.0");
        Assert.Contains("<!-- tide:start -->", p);
        Assert.Contains("src=\"../Tide/client.js?v=0.1.0\"", p);
        Assert.Contains("href=\"../Tide/client.css?v=0.1.0\"", p);
        Assert.True(p.IndexOf("tide:end", StringComparison.Ordinal) < p.IndexOf("</head>", StringComparison.Ordinal));
    }

    [Fact]
    public void IsIdempotentAndUpdatesVersion()
    {
        var once = IndexPatcher.Patch(Html, "0.1.0");
        var twice = IndexPatcher.Patch(once, "0.2.0");
        Assert.Equal(1, twice.Split("tide:start").Length - 1);
        Assert.Contains("v=0.2.0", twice);
        Assert.DoesNotContain("v=0.1.0", twice);
    }

    [Fact]
    public void UnpatchRestoresOriginal()
    {
        Assert.Equal(Html, IndexPatcher.Unpatch(IndexPatcher.Patch(Html, "0.1.0")));
    }

    [Fact]
    public void NoHeadLeavesHtmlUnchanged()
    {
        Assert.Equal("<html></html>", IndexPatcher.Patch("<html></html>", "0.1.0"));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/dotnet test Tide.slnx --filter IndexPatcherTests`
Expected: build error `The type or namespace name 'Injection' does not exist`.

- [ ] **Step 3: Implement patcher, bridge, injector, DI**

`server/Jellyfin.Plugin.Tide/Injection/IndexPatcher.cs`:
```csharp
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.Tide.Injection;

public static partial class IndexPatcher
{
    private const string Start = "<!-- tide:start -->";
    private const string End = "<!-- tide:end -->";

    public static string Patch(string html, string version)
    {
        var clean = Unpatch(html);
        var idx = clean.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        if (idx < 0)
        {
            return clean;
        }

        var block = $"{Start}<link rel=\"stylesheet\" href=\"../Tide/client.css?v={version}\"><script defer src=\"../Tide/client.js?v={version}\"></script>{End}";
        return clean.Insert(idx, block);
    }

    public static string Unpatch(string html) => BlockRegex().Replace(html, string.Empty);

    [GeneratedRegex(@"<!-- tide:start -->.*?<!-- tide:end -->", RegexOptions.Singleline)]
    private static partial Regex BlockRegex();
}
```

`server/Jellyfin.Plugin.Tide/Injection/FileTransformationBridge.cs`:
```csharp
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Tide.Injection;

public sealed class PatchPayload
{
    [JsonPropertyName("contents")]
    public string? Contents { get; set; }
}

/// <summary>Registers an index.html transformation with the optional File Transformation plugin via reflection.</summary>
public static class FileTransformationBridge
{
    public static readonly Guid TransformationId = Guid.Parse("b4c1f0a2-6d3e-4f7a-9c8b-2e5d1a0f3c7b");

    public static bool TryRegister(ILogger logger)
    {
        try
        {
            var asm = AssemblyLoadContext.All.SelectMany(c => c.Assemblies)
                .FirstOrDefault(a => a.FullName?.Contains(".FileTransformation", StringComparison.Ordinal) == true);
            var iface = asm?.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
            var register = iface?.GetMethod("RegisterTransformation", BindingFlags.Public | BindingFlags.Static);
            if (register is null)
            {
                return false;
            }

            var payload = new JsonObject
            {
                ["id"] = TransformationId.ToString(),
                ["fileNamePattern"] = "index.html",
                ["callbackAssembly"] = typeof(FileTransformationBridge).Assembly.FullName,
                ["callbackClass"] = typeof(FileTransformationBridge).FullName,
                ["callbackMethod"] = nameof(Transform),
            };
            var paramType = register.GetParameters().Single().ParameterType;
            object arg = paramType == typeof(JsonObject)
                ? payload
                : paramType.GetMethod("Parse", new[] { typeof(string) })?.Invoke(null, new object[] { payload.ToJsonString() })
                  ?? throw new InvalidOperationException("Unsupported File Transformation payload type " + paramType);
            register.Invoke(null, new[] { arg });
            logger.LogInformation("[Tide] Registered index.html transformation with File Transformation");
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Tide] File Transformation registration failed, falling back to direct patch");
            return false;
        }
    }

    public static string Transform(PatchPayload payload) =>
        IndexPatcher.Patch(payload.Contents ?? string.Empty, Plugin.Instance?.Version.ToString(3) ?? "0");
}
```

`server/Jellyfin.Plugin.Tide/Injection/ScriptInjector.cs`:
```csharp
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Tide.Injection;

public sealed class ScriptInjector : IHostedService
{
    private readonly IApplicationPaths _paths;
    private readonly ILogger<ScriptInjector> _logger;

    public ScriptInjector(IApplicationPaths paths, ILogger<ScriptInjector> logger)
    {
        _paths = paths;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (FileTransformationBridge.TryRegister(_logger))
        {
            Unpatch(_paths, _logger); // remove any old direct patch
            return Task.CompletedTask;
        }

        var index = Path.Combine(_paths.WebPath, "index.html");
        try
        {
            var html = File.ReadAllText(index);
            var patched = IndexPatcher.Patch(html, Plugin.Instance?.Version.ToString(3) ?? "0");
            if (patched != html)
            {
                File.WriteAllText(index, patched);
            }

            _logger.LogInformation("[Tide] Patched {Index}", index);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Tide] Could not patch {Index}. Install the File Transformation plugin or make the web folder writable.", index);
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public static void Unpatch(IApplicationPaths paths, ILogger logger)
    {
        var index = Path.Combine(paths.WebPath, "index.html");
        try
        {
            if (File.Exists(index))
            {
                var html = File.ReadAllText(index);
                var clean = IndexPatcher.Unpatch(html);
                if (clean != html)
                {
                    File.WriteAllText(index, clean);
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Tide] Could not unpatch {Index}", index);
        }
    }
}
```

`server/Jellyfin.Plugin.Tide/PluginServiceRegistrator.cs` (`QualityService` and `HeroService` are created in Task 7; until then, comment out those two lines and uncomment them in Task 7 Step 3):
```csharp
using Jellyfin.Plugin.Tide.Hero;
using Jellyfin.Plugin.Tide.Injection;
using Jellyfin.Plugin.Tide.Prefs;
using Jellyfin.Plugin.Tide.Quality;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.Tide;

public sealed class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection services, IServerApplicationHost applicationHost)
    {
        services.AddHostedService<ScriptInjector>();
        services.AddSingleton(_ => new UserPrefsStore(Path.Combine(Plugin.Instance!.DataFolderPath, "prefs")));
        services.AddSingleton<QualityService>();
        services.AddSingleton<HeroService>();
    }
}
```

Replace `server/Jellyfin.Plugin.Tide/Plugin.cs` with:
```csharp
using Jellyfin.Plugin.Tide.Configuration;
using Jellyfin.Plugin.Tide.Injection;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging.Abstractions;

namespace Jellyfin.Plugin.Tide;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public static readonly Guid PluginId = Guid.Parse("7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c");

    private readonly IApplicationPaths _paths;

    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        _paths = applicationPaths;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Tide";

    public override Guid Id => PluginId;

    public override string Description => "Streaming-app theme and home screen for Jellyfin.";

    public IEnumerable<PluginPageInfo> GetPages() => new[]
    {
        new PluginPageInfo
        {
            Name = "Tide",
            EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html",
        },
    };

    public override void OnUninstalling()
    {
        ScriptInjector.Unpatch(_paths, NullLogger.Instance);
        base.OnUninstalling();
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/dotnet test Tide.slnx --filter IndexPatcherTests`
Expected: `Passed!  - Failed: 0, Passed: 4`.
If `OnUninstalling` is not virtual in 12.4 (compile error CS0506), delete the override. Unpatching then only happens on the next start when FT is present, and the README must tell users to restore `index.html` by reinstalling or restarting the web package.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): inject client bundle via File Transformation or index.html patch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Jellyfin adapters (QualityService, HeroService) and API controllers

**Files:**
- Create: `server/Jellyfin.Plugin.Tide/Quality/QualityService.cs`, `server/Jellyfin.Plugin.Tide/Hero/HeroService.cs`, `server/Jellyfin.Plugin.Tide/Api/TideController.cs`, `server/Jellyfin.Plugin.Tide/Api/AssetController.cs`

**Interfaces:**
- Consumes: `QualityMapper`, `HeroSelector`, `UserPrefsStore`, DTOs
- Produces HTTP endpoints (Task 9 consumes them):
  - `GET /Tide/client.js`, `GET /Tide/client.css`, `GET /Tide/assets/{**path}` (anonymous)
  - `GET /Tide/ClientConfig` → `ClientConfig`
  - `GET /Tide/Home` → `HomeResponse`
  - `POST /Tide/Quality` body `QualityRequest` → `Dictionary<string, QualityDto?>`
  - `GET /Tide/UserPrefs` → `UserPrefs`
  - `PUT /Tide/UserPrefs` body `UserPrefs` → `UserPrefs`
- Jellyfin APIs used (verified against the 12.4 assemblies):
  - `ILibraryManager.GetItemList(InternalItemsQuery)`, `GetItemById(Guid)`, `ItemUpdated`
  - `InternalItemsQuery(User)` with `IncludeItemTypes`, `OrderBy`, `IsPlayed`, `Limit`, `Recursive`
  - `ITVSeriesManager.GetNextUp(NextUpQuery, DtoOptions)`
  - `IUserManager.GetUserById`, `IUserDataManager.GetUserData(User, BaseItem)`
  - `BaseItem.GetMediaSources(bool)`, `HasImage(ImageType,int)`, `RemoteTrailers`
  - `Series.GetEpisodes(User, DtoOptions, bool)`, `Series.GetSeasons(User, DtoOptions)`
  - `IAuthorizationContext.GetAuthorizationInfo(HttpRequest)`

- [ ] **Step 1: QualityService**

`server/Jellyfin.Plugin.Tide/Quality/QualityService.cs`:
```csharp
using System.Collections.Concurrent;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.Tide.Models;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.TV;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;

namespace Jellyfin.Plugin.Tide.Quality;

public sealed class QualityService
{
    private readonly ILibraryManager _library;
    private readonly ITVSeriesManager _tv;
    private readonly ConcurrentDictionary<Guid, QualityDto?> _cache = new();

    public QualityService(ILibraryManager library, ITVSeriesManager tv)
    {
        _library = library;
        _tv = tv;
        _library.ItemUpdated += (_, e) =>
        {
            _cache.TryRemove(e.Item.Id, out QualityDto? _);
            if (e.Item is Episode ep)
            {
                _cache.TryRemove(ep.SeriesId, out QualityDto? _);
            }
        };
    }

    public QualityDto? For(BaseItem item, User user)
    {
        if (item is Series)
        {
            // Series results depend on the user's next-up episode, so they are not cached.
            var target = NextOrLatestEpisode((Series)item, user);
            return target is null ? null : For(target, user);
        }

        return _cache.GetOrAdd(item.Id, _ => QualityMapper.Map(Streams(item)));
    }

    public Dictionary<string, QualityDto?> ForIds(IEnumerable<string> ids, User user)
    {
        var result = new Dictionary<string, QualityDto?>();
        foreach (var raw in ids.Take(100))
        {
            if (Guid.TryParse(raw, out var id) && _library.GetItemById(id) is { } item)
            {
                result[raw] = For(item, user);
            }
        }

        return result;
    }

    public Episode? NextOrLatestEpisode(Series series, User user)
    {
        var next = _tv.GetNextUp(new NextUpQuery { User = user, SeriesId = series.Id, Limit = 1 }, new DtoOptions(false)).Items.FirstOrDefault();
        return next as Episode ?? series.GetEpisodes(user, new DtoOptions(false), false).OfType<Episode>().LastOrDefault();
    }

    private static IReadOnlyList<SourceStreams> Streams(BaseItem item) =>
        item.GetMediaSources(false).Select(s => new SourceStreams(
            s.MediaStreams.Where(m => m.Type == MediaStreamType.Video)
                .Select(m => new VideoStream(m.Width, m.Codec, m.VideoRangeType.ToString())).ToList(),
            s.MediaStreams.Where(m => m.Type == MediaStreamType.Audio)
                .Select(m => new AudioStream(m.Profile, m.Channels, m.IsDefault)).ToList())).ToList();
}
```

- [ ] **Step 2: HeroService**

`server/Jellyfin.Plugin.Tide/Hero/HeroService.cs`:
```csharp
using System.Text.RegularExpressions;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.Tide.Models;
using Jellyfin.Plugin.Tide.Quality;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.TV;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;

namespace Jellyfin.Plugin.Tide.Hero;

public sealed partial class HeroService
{
    private readonly ILibraryManager _library;
    private readonly IUserDataManager _userData;
    private readonly ITVSeriesManager _tv;
    private readonly QualityService _quality;

    public HeroService(ILibraryManager library, IUserDataManager userData, ITVSeriesManager tv, QualityService quality)
    {
        _library = library;
        _userData = userData;
        _tv = tv;
        _quality = quality;
    }

    public IReadOnlyList<HeroItemDto> Build(User user, int size, int newDays)
    {
        var newCutoff = DateTime.UtcNow.AddDays(-newDays);
        var personal = new List<HeroCandidate>();

        foreach (var item in Query(user, new[] { BaseItemKind.Movie, BaseItemKind.Episode }, ItemSortBy.DatePlayed, 40, null))
        {
            var ud = _userData.GetUserData(user, item);
            if (ud is { Played: false, PlaybackPositionTicks: > 0 })
            {
                personal.Add(Candidate(item, HeroReason.Resume));
            }
        }

        foreach (var ep in _tv.GetNextUp(new NextUpQuery { User = user, Limit = 10, EnableResumable = false }, new DtoOptions(false)).Items.OfType<Episode>())
        {
            personal.Add(Candidate(ep, ep.DateCreated >= newCutoff ? HeroReason.NewEpisode : HeroReason.NextEpisode));
        }

        var newest = Query(user, new[] { BaseItemKind.Movie, BaseItemKind.Series }, ItemSortBy.DateCreated, 30, null)
            .Where(i => !i.IsPlayed(user, _userData.GetUserData(user, i)))
            .Select(i => Candidate(i, HeroReason.New)).ToList();

        var topRated = Query(user, new[] { BaseItemKind.Movie, BaseItemKind.Series }, ItemSortBy.CommunityRating, 30, false)
            .Select(i => Candidate(i, HeroReason.TopRated)).ToList();

        return HeroSelector.Select(personal, newest, topRated, size)
            .Select(c => ToDto(c, user))
            .Where(d => d is not null)
            .Select(d => d!)
            .ToList();
    }

    private IReadOnlyList<BaseItem> Query(User user, BaseItemKind[] kinds, ItemSortBy sort, int limit, bool? isPlayed) =>
        _library.GetItemList(new InternalItemsQuery(user)
        {
            IncludeItemTypes = kinds,
            Recursive = true,
            IsPlayed = isPlayed,
            IsVirtualItem = false,
            Limit = limit,
            OrderBy = new[] { (sort, SortOrder.Descending) },
        });

    /// <summary>The "display" item for an episode is its series (backdrop, logo, key).</summary>
    private BaseItem Display(BaseItem item) => item is Episode ep && ep.Series is not null ? ep.Series : item;

    private HeroCandidate Candidate(BaseItem item, HeroReason reason)
    {
        var display = Display(item);
        return new HeroCandidate(display.Id.ToString("N"), item.Id, reason, display.HasImage(ImageType.Backdrop, 0), display.HasImage(ImageType.Logo, 0));
    }

    private HeroItemDto? ToDto(HeroCandidate c, User user)
    {
        var item = _library.GetItemById(c.ItemId);
        if (item is null)
        {
            return null;
        }

        var display = Display(item);
        Episode? episode = item as Episode;
        if (episode is null && display is Series s && c.Reason != HeroReason.TopRated && c.Reason != HeroReason.New)
        {
            episode = _quality.NextOrLatestEpisode(s, user);
        }

        var playable = (BaseItem?)episode ?? item;
        var ud = _userData.GetUserData(user, playable);
        ProgressDto? progress = null;
        if (ud is { PlaybackPositionTicks: > 0 } && playable.RunTimeTicks is > 0)
        {
            var pct = (int)Math.Round(100.0 * ud.PlaybackPositionTicks / playable.RunTimeTicks.Value);
            var left = (int)((playable.RunTimeTicks.Value - ud.PlaybackPositionTicks) / TimeSpan.TicksPerMinute);
            progress = new ProgressDto(pct, left);
        }

        return new HeroItemDto
        {
            Id = display.Id.ToString("N"),
            Type = display is Series ? "Series" : "Movie",
            Reason = HeroSelector.ReasonString(c.Reason),
            Name = display.Name,
            Year = display.ProductionYear,
            Genres = display.Genres.Take(2).ToArray(),
            OfficialRating = display.OfficialRating,
            CommunityRating = display.CommunityRating,
            CriticRating = display.CriticRating,
            RuntimeMinutes = display is Movie && display.RunTimeTicks is { } t ? (int)(t / TimeSpan.TicksPerMinute) : null,
            SeasonCount = display is Series ser ? ser.GetSeasons(user, new DtoOptions(false)).Count : null,
            Overview = display.Overview ?? string.Empty,
            Episode = episode is null ? null : new EpisodeRef(episode.Id.ToString("N"), episode.ParentIndexNumber ?? 0, episode.IndexNumber ?? 0, episode.Name),
            Progress = progress,
            Quality = _quality.For(playable, user),
            HasLogo = display.HasImage(ImageType.Logo, 0),
            Youtube = display.RemoteTrailers.Select(t => YoutubeId(t.Url)).Where(id => id is not null).Select(id => id!).Take(3).ToArray(),
            PlayTargetId = playable.Id.ToString("N"),
        };
    }

    internal static string? YoutubeId(string? url)
    {
        if (string.IsNullOrEmpty(url))
        {
            return null;
        }

        var m = YoutubeRegex().Match(url);
        return m.Success ? m.Groups[1].Value : null;
    }

    [GeneratedRegex(@"(?:v=|youtu\.be/|embed/)([\w-]{11})")]
    private static partial Regex YoutubeRegex();
}
```

- [ ] **Step 3: Controllers**

`server/Jellyfin.Plugin.Tide/Api/AssetController.cs`:
```csharp
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Tide.Api;

[ApiController]
[Route("Tide")]
[AllowAnonymous]
public partial class AssetController : ControllerBase
{
    private static readonly Dictionary<string, string> Types = new(StringComparer.OrdinalIgnoreCase)
    {
        [".js"] = "application/javascript",
        [".css"] = "text/css",
        [".woff2"] = "font/woff2",
        [".woff"] = "font/woff",
        [".svg"] = "image/svg+xml",
        [".png"] = "image/png",
    };

    [HttpGet("client.js")]
    public IActionResult Js() => Serve("client.js");

    [HttpGet("client.css")]
    public IActionResult Css() => Serve("client.css");

    [HttpGet("assets/{**path}")]
    public IActionResult Asset(string path) => SafePath().IsMatch(path) ? Serve("assets/" + path) : NotFound();

    private IActionResult Serve(string relative)
    {
        var stream = typeof(AssetController).Assembly.GetManifestResourceStream("Tide.Web/" + relative);
        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = relative.StartsWith("assets/", StringComparison.Ordinal)
            ? "public, max-age=31536000, immutable"
            : "public, max-age=300";
        return File(stream, Types.GetValueOrDefault(Path.GetExtension(relative), "application/octet-stream"));
    }

    [GeneratedRegex(@"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$")]
    private static partial Regex SafePath();
}
```

`server/Jellyfin.Plugin.Tide/Api/TideController.cs`:
```csharp
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.Tide.Hero;
using Jellyfin.Plugin.Tide.Models;
using Jellyfin.Plugin.Tide.Prefs;
using Jellyfin.Plugin.Tide.Quality;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Tide.Api;

[ApiController]
[Route("Tide")]
[Authorize]
public class TideController : ControllerBase
{
    private readonly IAuthorizationContext _auth;
    private readonly IUserManager _users;
    private readonly HeroService _hero;
    private readonly QualityService _quality;
    private readonly UserPrefsStore _prefs;

    public TideController(IAuthorizationContext auth, IUserManager users, HeroService hero, QualityService quality, UserPrefsStore prefs)
    {
        _auth = auth;
        _users = users;
        _hero = hero;
        _quality = quality;
        _prefs = prefs;
    }

    private static Configuration.PluginConfiguration Cfg => Plugin.Instance!.Configuration;

    [HttpGet("ClientConfig")]
    public ActionResult<ClientConfig> GetClientConfig() => BuildClientConfig();

    [HttpGet("Home")]
    public async Task<ActionResult<HomeResponse>> GetHome()
    {
        var user = await CurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        var hero = _hero.Build(user, Math.Clamp(Cfg.HeroSize, 1, 12), Cfg.NewDays);
        return new HomeResponse(hero, LoadPrefs(user), BuildClientConfig());
    }

    [HttpPost("Quality")]
    public async Task<ActionResult<Dictionary<string, QualityDto?>>> PostQuality([FromBody] QualityRequest req)
    {
        var user = await CurrentUser();
        return user is null ? Unauthorized() : _quality.ForIds(req.Ids, user);
    }

    [HttpGet("UserPrefs")]
    public async Task<ActionResult<UserPrefs>> GetPrefs()
    {
        var user = await CurrentUser();
        return user is null ? Unauthorized() : LoadPrefs(user);
    }

    [HttpPut("UserPrefs")]
    public async Task<ActionResult<UserPrefs>> PutPrefs([FromBody] UserPrefs prefs)
    {
        var user = await CurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        _prefs.Save(user.Id, prefs);
        return LoadPrefs(user);
    }

    private UserPrefs LoadPrefs(User user) => _prefs.Load(user.Id, Cfg.DefaultRowOrder, Cfg.DefaultHiddenRows);

    private static ClientConfig BuildClientConfig() => new(
        Cfg.EnableTheme, Cfg.EnableIcons, Cfg.EnableHome, Cfg.EnableTrailers,
        Math.Clamp(Cfg.HeroSlotSeconds, 8, 120), Cfg.NewDays, Plugin.Instance!.Version.ToString(3));

    private async Task<User?> CurrentUser()
    {
        var info = await _auth.GetAuthorizationInfo(Request).ConfigureAwait(false);
        return info.UserId == Guid.Empty ? null : _users.GetUserById(info.UserId);
    }
}
```

Uncomment the two `AddSingleton` lines in `PluginServiceRegistrator.cs` for `QualityService` and `HeroService`.

- [ ] **Step 4: Build against 12.4 and fix any API drift**

Run: `./scripts/dotnet build Tide.slnx -c Release 2>&1 | grep -E "error|Build succeeded"`
Expected: `Build succeeded.`
If an error names a member, inspect the real API with the probe from the design session:
```bash
mkdir -p /tmp/tide-probe && cd /tmp/tide-probe && cat > p.csproj <<'EOF'
<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Jellyfin.Controller" Version="12.4.0" /></ItemGroup></Project>
EOF
echo 'foreach (var m in typeof(MediaBrowser.Controller.Net.AuthorizationInfo).GetProperties()) System.Console.WriteLine(m.PropertyType.Name+" "+m.Name);' > Program.cs
docker run --rm -v $PWD:/src -w /src mcr.microsoft.com/dotnet/sdk:10.0 dotnet run
```
Swap the type in the `typeof(...)` for the one the error names. Change only the call site in `QualityService`, `HeroService` or `TideController`, then re-run until the build succeeds.

- [ ] **Step 5: Smoke-test against local Jellyfin**

Run:
```bash
(cd web && npm run build) && ./scripts/dotnet publish server/Jellyfin.Plugin.Tide -c Release -o e2e/plugins/Tide && \
  (cd e2e && docker compose restart && sleep 15 && node -e "
import('./setup.mjs').then(async m => { const t = await m.getToken();
const h = { Authorization: 'MediaBrowser Client=\"e2e\", Device=\"e2e\", DeviceId=\"e2e\", Version=\"1\", Token=\"'+t+'\"' };
for (const p of ['/Tide/ClientConfig','/Tide/Home','/Tide/UserPrefs']) { const r = await fetch('http://localhost:8096'+p,{headers:h}); console.log(p, r.status, (await r.text()).slice(0,160)); }
const js = await fetch('http://localhost:8096/Tide/client.js'); console.log('/Tide/client.js', js.status);
const idx = await (await fetch('http://localhost:8096/web/')).text(); console.log('injected', idx.includes('tide:start'));
});")
```
Expected:
- the three endpoints return `200` with camelCase JSON
- `/Tide/client.js 200`
- `injected true`

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): add hero, quality, prefs and asset endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Web API layer and boot

**Files:**
- Create: `web/src/types.ts`, `web/src/api/client.ts`, `web/src/api/tide.ts`, `web/src/api/actions.ts`
- Modify: `web/src/main.ts`
- Test: `web/test/client.test.ts`

**Interfaces:**
- Consumes: the HTTP endpoints from Task 7; `ROUTES` from `router/selectors.ts`
- Produces:
  - `types.ts`: `Quality`, `HeroItem`, `UserPrefs`, `ClientConfig`, `HomeResponse`, `RowId`, `ROW_IDS`, `JfItem`
  - `client.ts`:
    - `getSession(): Session | null`
    - `waitForSession(timeoutMs?: number): Promise<Session | null>`
    - `api<T>(path, opts?): Promise<T>`
    - `imageUrl(id, type, maxWidth)`, `streamUrl(id)`
  - `tide.ts`:
    - `getClientConfig()`, `getHome()`
    - `getQuality(ids): Promise<Record<string, Quality | null>>`
    - `putPrefs(p)`
  - `actions.ts`: `play(id)`, `openDetails(id)`, `setWatched(id, on)`, `setFavourite(id, on)`

- [ ] **Step 1: Write the failing tests**

`web/test/client.test.ts`:
```ts
import { api, getSession, imageUrl, streamUrl, waitForSession } from '../src/api/client';

function fakeApiClient() {
  (window as any).ApiClient = {
    serverAddress: () => 'http://jf.local',
    accessToken: () => 'tok123',
    getCurrentUserId: () => 'user1',
  };
}

afterEach(() => {
  delete (window as any).ApiClient;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('getSession reads window.ApiClient', () => {
  expect(getSession()).toBeNull();
  fakeApiClient();
  expect(getSession()).toEqual({ server: 'http://jf.local', token: 'tok123', userId: 'user1' });
});

test('waitForSession resolves once ApiClient appears', async () => {
  vi.useFakeTimers();
  const p = waitForSession(5000);
  setTimeout(fakeApiClient, 300);
  await vi.advanceTimersByTimeAsync(600);
  expect((await p)?.token).toBe('tok123');
});

test('waitForSession gives up after timeout', async () => {
  vi.useFakeTimers();
  const p = waitForSession(1000);
  await vi.advanceTimersByTimeAsync(1200);
  expect(await p).toBeNull();
});

test('api sends MediaBrowser token header and query params', async () => {
  fakeApiClient();
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":1}', { status: 200 }));
  const r = await api<{ ok: number }>('/Items', { query: { Limit: 5, IsPlayed: false, skip: undefined } });
  expect(r.ok).toBe(1);
  const [url, init] = spy.mock.calls[0]!;
  expect(url).toBe('http://jf.local/Items?Limit=5&IsPlayed=false');
  expect((init!.headers as Record<string, string>).Authorization).toBe('MediaBrowser Token="tok123"');
});

test('api throws on non-2xx', async () => {
  fakeApiClient();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
  await expect(api('/x')).rejects.toThrow('500');
});

test('url helpers', () => {
  fakeApiClient();
  expect(imageUrl('abc', 'Backdrop/0', 1920)).toBe('http://jf.local/Items/abc/Images/Backdrop/0?maxWidth=1920&quality=88');
  expect(streamUrl('vid')).toBe('http://jf.local/Videos/vid/stream?static=true&ApiKey=tok123');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/client.test.ts`
Expected: FAIL `Failed to resolve import "../src/api/client"`.

- [ ] **Step 3: Implement**

`web/src/types.ts`:
```ts
export const ROW_IDS = [
  'continue', 'nextUp', 'latestMovies', 'latestShows', 'becauseYouWatched', 'topRated',
  'genre1', 'genre2', 'genre3', 'favourites', 'random', 'collections', 'musicAlbums', 'musicArtists',
] as const;
export type RowId = (typeof ROW_IDS)[number];

export interface Quality { res: string; codec: string; range?: string | null; audio?: string | null }

export type HeroReason = 'resume' | 'nextEpisode' | 'newEpisode' | 'new' | 'topRated';

export interface HeroItem {
  id: string; type: 'Movie' | 'Series'; reason: HeroReason; name: string; year?: number | null;
  genres: string[]; officialRating?: string | null; communityRating?: number | null; criticRating?: number | null;
  runtimeMinutes?: number | null; seasonCount?: number | null; overview: string;
  episode?: { id: string; season: number; number: number; name: string } | null;
  progress?: { percent: number; minutesLeft: number } | null;
  quality?: Quality | null; hasLogo: boolean; youtube: string[]; playTargetId: string;
}

export interface UserPrefs { rowOrder: string[]; hidden: string[]; genres: Record<string, string | null>; edited: boolean }

export interface ClientConfig {
  enableTheme: boolean; enableIcons: boolean; enableHome: boolean; enableTrailers: boolean;
  heroSlotSeconds: number; newDays: number; version: string;
}

export interface HomeResponse { hero: HeroItem[]; prefs: UserPrefs; config: ClientConfig }

/** Subset of Jellyfin's BaseItemDto (PascalCase, as returned by stock endpoints). */
export interface JfItem {
  Id: string; Name: string; Type: string; ProductionYear?: number; Genres?: string[];
  CommunityRating?: number; CriticRating?: number; RunTimeTicks?: number; ChildCount?: number;
  SeriesId?: string; SeriesName?: string; ParentIndexNumber?: number; IndexNumber?: number;
  DateCreated?: string; ImageTags?: Record<string, string>; BackdropImageTags?: string[];
  ParentBackdropItemId?: string; AlbumArtist?: string;
  UserData?: { Played?: boolean; PlayedPercentage?: number; UnplayedItemCount?: number; IsFavorite?: boolean; PlaybackPositionTicks?: number };
}
```

`web/src/api/client.ts`:
```ts
export interface Session { server: string; token: string; userId: string }

interface JfApiClient { serverAddress(): string; accessToken(): string; getCurrentUserId(): string }

export function getSession(): Session | null {
  const c = (window as unknown as { ApiClient?: JfApiClient }).ApiClient;
  if (!c || typeof c.accessToken !== 'function') return null;
  const token = c.accessToken();
  if (!token) return null;
  return { server: c.serverAddress().replace(/\/$/, ''), token, userId: c.getCurrentUserId() };
}

export function waitForSession(timeoutMs = 10000): Promise<Session | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const s = getSession();
      if (s) return resolve(s);
      if (Date.now() - started >= timeoutMs) return resolve(null);
      setTimeout(tick, 250);
    };
    tick();
  });
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function api<T>(path: string, opts: { method?: string; query?: Query; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const s = getSession();
  if (!s) throw new Error('No Jellyfin session');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10000);
  try {
    const headers: Record<string, string> = { Authorization: `MediaBrowser Token="${s.token}"` };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${s.server}${path}${qs(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function imageUrl(id: string, type: string, maxWidth: number): string {
  return `${getSession()?.server ?? ''}/Items/${id}/Images/${type}?maxWidth=${maxWidth}&quality=88`;
}

export function streamUrl(id: string): string {
  const s = getSession();
  return `${s?.server ?? ''}/Videos/${id}/stream?static=true&ApiKey=${encodeURIComponent(s?.token ?? '')}`;
}
```

`web/src/api/tide.ts`:
```ts
import { api } from './client';
import type { ClientConfig, HomeResponse, Quality, UserPrefs } from '../types';

export const getClientConfig = () => api<ClientConfig>('/Tide/ClientConfig');
export const getHome = () => api<HomeResponse>('/Tide/Home');
export const putPrefs = (p: UserPrefs) => api<UserPrefs>('/Tide/UserPrefs', { method: 'PUT', body: p });

export async function getQuality(ids: string[]): Promise<Record<string, Quality | null>> {
  if (!ids.length) return {};
  return api<Record<string, Quality | null>>('/Tide/Quality', { method: 'POST', body: { ids: ids.slice(0, 100) } });
}
```

`web/src/api/actions.ts`:
```ts
import { api, getSession } from './client';
import { ROUTES } from '../router/selectors';

interface PlaybackManager { play(o: { ids: string[]; serverId?: string }): Promise<unknown> }

export function openDetails(id: string): void {
  location.hash = ROUTES.details(id).replace(/^#/, '');
}

export async function play(id: string): Promise<void> {
  const pm = (window as unknown as { playbackManager?: PlaybackManager }).playbackManager;
  const serverId = (window as unknown as { ApiClient?: { serverId(): string } }).ApiClient?.serverId();
  if (pm?.play) {
    await pm.play({ ids: [id], serverId });
    return;
  }
  openDetails(id);
}

export async function setWatched(id: string, on: boolean): Promise<void> {
  const s = getSession();
  await api(`/UserPlayedItems/${id}`, { method: on ? 'POST' : 'DELETE', query: { userId: s?.userId } });
}

export async function setFavourite(id: string, on: boolean): Promise<void> {
  const s = getSession();
  await api(`/UserFavoriteItems/${id}`, { method: on ? 'POST' : 'DELETE', query: { userId: s?.userId } });
}
```

`web/src/main.ts`:
```ts
import { waitForSession } from './api/client';
import { getClientConfig } from './api/tide';
import type { ClientConfig } from './types';

export const TIDE_VERSION = '0.1.0';

export type Feature = (cfg: ClientConfig) => void;
const features: Feature[] = [];
export function registerFeature(f: Feature): void {
  features.push(f);
}

export async function boot(): Promise<void> {
  const session = await waitForSession(10000);
  if (!session) return; // stock UI untouched
  let cfg: ClientConfig;
  try {
    cfg = await getClientConfig();
  } catch (e) {
    console.warn('[Tide] config unavailable, staying out of the way', e);
    return;
  }
  document.body.classList.add('tide');
  for (const f of features) {
    try {
      f(cfg);
    } catch (e) {
      console.error('[Tide] feature failed', e);
    }
  }
}

if (typeof window !== 'undefined' && !(window as unknown as { __TIDE_TEST__?: boolean }).__TIDE_TEST__) {
  void boot();
}
```
The `__TIDE_TEST__` flag is set by `web/test/setup.ts` (Task 1), so importing `main.ts` in tests never boots. Note that ES imports are hoisted, so a per-file assignment would not work.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test && npm run typecheck`
Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): add API client, Tide endpoints, actions and boot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Theme (tokens, fonts, global restyle, N1 nav)

**Files:**
- Create: `web/src/theme/tokens.css`, `web/src/theme/global.css`, `web/src/theme/index.ts`
- Modify: `web/src/main.ts` (import theme)
- Test: `web/test/theme.test.ts`

**Interfaces:**
- Consumes: `SELECTORS.appBar`, `ROUTES.isHome` from selectors; `registerFeature` from main
- Produces:
  - CSS custom properties `--tide-*` (spec 4.1), plus `--tide-ease`, `--tide-radius`, `--tide-gutter`
  - body classes `tide-theme` and `tide-scrolled`, and `tide-on-home` (set by Task 13)
  - `initTheme(cfg)`

- [ ] **Step 1: Write the failing test**

`web/test/theme.test.ts`:
```ts
import { initTheme, updateScrolled } from '../src/theme/index';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: true, heroSlotSeconds: 30, newDays: 14, version: '0.1.0' };

test('adds tide-theme when enabled', () => {
  initTheme(cfg);
  expect(document.body.classList.contains('tide-theme')).toBe(true);
});

test('does nothing when disabled', () => {
  document.body.className = '';
  initTheme({ ...cfg, enableTheme: false });
  expect(document.body.classList.contains('tide-theme')).toBe(false);
});

test('scrolled class toggles past 80px', () => {
  updateScrolled(10);
  expect(document.body.classList.contains('tide-scrolled')).toBe(false);
  updateScrolled(81);
  expect(document.body.classList.contains('tide-scrolled')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/theme.test.ts`
Expected: FAIL `Failed to resolve import "../src/theme/index"`.

- [ ] **Step 3: Implement**

`web/src/theme/tokens.css`:
```css
body.tide {
  --tide-bg: #000;
  --tide-s1: #141416;
  --tide-s2: #1d1d20;
  --tide-s3: #2a2a2e;
  --tide-line: #2c2c2e;
  --tide-tx: #f5f5f7;
  --tide-mu: #a1a1a6;
  --tide-di: #6e6e73;
  --tide-ac: #fff;
  --tide-star: #ffd60a;
  --tide-critic: #ff6b5a;
  --tide-hdr: linear-gradient(90deg, #ffd60a, #ff9f0a);
  --tide-fav: #ff375f;
  --tide-ease: cubic-bezier(.2, .8, .2, 1);
  --tide-radius: 14px;
  --tide-gutter: 56px;
  --tide-font: 'Inter Variable', Inter, system-ui, sans-serif;
}
@media (max-width: 699px) { body.tide { --tide-gutter: 16px; } }

body.tide .tide-ms {
  font-family: 'Material Symbols Rounded';
  font-weight: normal; font-style: normal; line-height: 1; letter-spacing: normal; text-transform: none;
  display: inline-block; white-space: nowrap; direction: ltr;
  font-feature-settings: 'liga'; -webkit-font-smoothing: antialiased;
  font-variation-settings: 'FILL' 1, 'wght' 600, 'GRAD' 100, 'opsz' 24;
  font-size: 22px; vertical-align: middle;
}
```

`web/src/theme/global.css`:
```css
/* Global restyle of jellyfin-web Modern layout. Solid surfaces only. */
body.tide-theme, body.tide-theme .MuiPaper-root, body.tide-theme .backgroundContainer {
  background-color: var(--tide-bg);
  color: var(--tide-tx);
}
body.tide-theme, body.tide-theme button, body.tide-theme input, body.tide-theme select, body.tide-theme textarea,
body.tide-theme .MuiTypography-root, body.tide-theme .MuiButtonBase-root {
  font-family: var(--tide-font);
  -webkit-font-smoothing: antialiased;
}
body.tide-theme * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }

/* Surfaces */
body.tide-theme .MuiPaper-root, body.tide-theme .MuiDrawer-paper, body.tide-theme .MuiMenu-paper,
body.tide-theme .MuiDialog-paper, body.tide-theme .dialog, body.tide-theme .actionSheet {
  background: var(--tide-s1) !important;
  background-image: none !important;
  border: 1px solid var(--tide-line);
  border-radius: var(--tide-radius);
}

/* Buttons */
body.tide-theme .MuiButton-root { border-radius: var(--tide-radius); text-transform: none; font-weight: 600; box-shadow: none; }
body.tide-theme .MuiButton-containedPrimary, body.tide-theme .button-submit { background: var(--tide-ac) !important; color: #000 !important; }
body.tide-theme .MuiButton-containedSecondary, body.tide-theme .MuiButton-outlined { background: var(--tide-s3); color: var(--tide-tx); border-color: var(--tide-line); }
body.tide-theme .MuiIconButton-root { border-radius: 50%; }

/* Inputs */
body.tide-theme .MuiOutlinedInput-root, body.tide-theme .MuiFilledInput-root, body.tide-theme .emby-input, body.tide-theme .emby-select {
  background: var(--tide-s2) !important; border-radius: 12px; color: var(--tide-tx);
}
body.tide-theme .MuiOutlinedInput-notchedOutline { border-color: var(--tide-line) !important; }

/* Progress / accents */
body.tide-theme .MuiLinearProgress-bar, body.tide-theme .itemProgressBarForeground { background: #fff !important; }
body.tide-theme .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track { background: #fff !important; opacity: 1; }

/* Scrollbars */
body.tide-theme ::-webkit-scrollbar { width: 10px; height: 10px; }
body.tide-theme ::-webkit-scrollbar-thumb { background: var(--tide-s3); border-radius: 5px; }
body.tide-theme ::-webkit-scrollbar-track { background: transparent; }

/* N1 top nav */
body.tide-theme .MuiAppBar-root {
  background: var(--tide-bg) !important; box-shadow: none !important; border: 0;
  transition: background-color .3s var(--tide-ease);
}
body.tide-theme.tide-on-home:not(.tide-scrolled) .MuiAppBar-root { background: transparent !important; }
body.tide-theme .MuiAppBar-root .MuiButton-root {
  border-radius: 22px; padding: 7px 15px; color: var(--tide-tx); font-weight: 500;
}
body.tide-theme .MuiAppBar-root .MuiButton-root[aria-current="page"],
body.tide-theme .MuiAppBar-root .MuiButton-root.Mui-selected,
body.tide-theme .MuiAppBar-root .MuiButton-root.active {
  background: #fff !important; color: #000 !important; font-weight: 600;
}
body.tide-theme .MuiAppBar-root .MuiIconButton-root { background: var(--tide-s2); margin-left: 8px; }

/* Stock cards everywhere else */
body.tide-theme .cardScalable, body.tide-theme .cardImageContainer { border-radius: var(--tide-radius); }
```

`web/src/theme/index.ts`:
```ts
import '@fontsource-variable/inter';
import 'material-symbols/rounded.css';
import './tokens.css';
import './global.css';
import type { ClientConfig } from '../types';

export function updateScrolled(y: number): void {
  document.body.classList.toggle('tide-scrolled', y > 80);
}

export function initTheme(cfg: ClientConfig): void {
  if (!cfg.enableTheme) return;
  document.body.classList.add('tide-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', '#000000');
  window.addEventListener('scroll', () => updateScrolled(window.scrollY), { passive: true });
  updateScrolled(window.scrollY);
}
```

Modify `web/src/main.ts`. Add after the imports:
```ts
import { initTheme } from './theme/index';
```
And add before the auto-boot block:
```ts
registerFeature(initTheme);
```

- [ ] **Step 4: Run tests and build**

Run: `cd web && npm test && npm run build && ls dist dist/assets | head`
Expected: tests pass. `dist/` has `client.js` and `client.css`; `dist/assets/` lists `inter-*.woff2` and `material-symbols-rounded*.woff2`.
Then run `grep -o "url([^)]*woff2)" dist/client.css | head -3`. Expected: URLs start with `/Tide/assets/` or `./assets/`.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): add design tokens, bundled fonts, global restyle and N1 nav

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Icon swap

**Files:**
- Create: `web/src/icons/map.ts`, `web/src/icons/swap.ts`
- Modify: `web/src/main.ts` (register feature)
- Test: `web/test/icons.test.ts`

**Interfaces:**
- Consumes: `registerFeature`
- Produces:
  - `MUI_ICON_MAP: Record<string, string>` (MUI `data-testid` → Material Symbols name)
  - `FONT_ICON_RENAMES: Record<string, string>`
  - `swapIcons(root: ParentNode)`, `initIcons(cfg)`

- [ ] **Step 1: Write the failing test**

`web/test/icons.test.ts`:
```ts
import { swapIcons } from '../src/icons/swap';
import { MUI_ICON_MAP } from '../src/icons/map';

test('replaces mapped MUI svg icon with symbol span and keeps size class', () => {
  document.body.innerHTML = '<button><svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeSmall" data-testid="HomeIcon"></svg></button>';
  swapIcons(document);
  const span = document.querySelector('span.tide-ms')!;
  expect(span.textContent).toBe('home');
  expect(span.classList.contains('MuiSvgIcon-fontSizeSmall')).toBe(true);
  expect(document.querySelector('svg')).toBeNull();
});

test('leaves unmapped svg icons alone', () => {
  document.body.innerHTML = '<svg data-testid="SomethingWeirdIcon"></svg>';
  swapIcons(document);
  expect(document.querySelector('svg')).not.toBeNull();
});

test('converts legacy material-icons font spans and renames', () => {
  document.body.innerHTML = '<span class="material-icons">favorite_border</span><span class="material-icons">play_arrow</span>';
  swapIcons(document);
  const spans = [...document.querySelectorAll('span.tide-ms')];
  expect(spans.map((s) => s.textContent)).toEqual(['favorite', 'play_arrow']);
});

test('is idempotent', () => {
  document.body.innerHTML = '<svg data-testid="SearchIcon"></svg>';
  swapIcons(document);
  swapIcons(document);
  expect(document.querySelectorAll('span.tide-ms').length).toBe(1);
});

test('map covers core navigation icons', () => {
  for (const k of ['HomeIcon', 'SearchIcon', 'MenuIcon', 'SettingsIcon', 'PlayArrowIcon', 'FavoriteIcon', 'CastIcon']) {
    expect(MUI_ICON_MAP[k]).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/icons.test.ts`
Expected: FAIL `Failed to resolve import "../src/icons/swap"`.

- [ ] **Step 3: Implement**

`web/src/icons/map.ts`:
```ts
/** MUI icon data-testid -> Material Symbols Rounded ligature. Extend from docs/notes/web-12.4-dom.md muiIconTestIds. */
export const MUI_ICON_MAP: Record<string, string> = {
  HomeIcon: 'home', SearchIcon: 'search', MenuIcon: 'menu', SettingsIcon: 'settings', CastIcon: 'cast',
  CastConnectedIcon: 'cast_connected', PlayArrowIcon: 'play_arrow', PauseIcon: 'pause', FavoriteIcon: 'favorite',
  FavoriteBorderIcon: 'favorite', CheckIcon: 'check', CheckCircleIcon: 'check_circle', AddIcon: 'add',
  MoreVertIcon: 'more_vert', MoreHorizIcon: 'more_horiz', CloseIcon: 'close', ArrowBackIcon: 'arrow_back',
  ArrowForwardIcon: 'arrow_forward', ChevronLeftIcon: 'chevron_left', ChevronRightIcon: 'chevron_right',
  ExpandMoreIcon: 'expand_more', ExpandLessIcon: 'expand_less', MovieIcon: 'movie', TvIcon: 'tv', LiveTvIcon: 'live_tv',
  MusicNoteIcon: 'music_note', LibraryMusicIcon: 'library_music', PhotoLibraryIcon: 'photo_library', BookIcon: 'book',
  FolderIcon: 'folder', DashboardIcon: 'dashboard', PersonIcon: 'person', AccountCircleIcon: 'account_circle',
  LogoutIcon: 'logout', NotificationsIcon: 'notifications', InfoIcon: 'info', InfoOutlinedIcon: 'info',
  EditIcon: 'edit', DeleteIcon: 'delete', DownloadIcon: 'download', ShareIcon: 'share', StarIcon: 'star',
  ShuffleIcon: 'shuffle', RepeatIcon: 'repeat', SkipNextIcon: 'skip_next', SkipPreviousIcon: 'skip_previous',
  VolumeUpIcon: 'volume_up', VolumeOffIcon: 'volume_off', SubtitlesIcon: 'subtitles', FullscreenIcon: 'fullscreen',
  FilterListIcon: 'filter_list', SortIcon: 'sort', ViewModuleIcon: 'view_module', ListIcon: 'list',
  SyncIcon: 'sync', RefreshIcon: 'refresh', DevicesIcon: 'devices', GroupIcon: 'group', HelpIcon: 'help',
  CollectionsBookmarkIcon: 'collections_bookmark', PlaylistPlayIcon: 'playlist_play', QueueMusicIcon: 'queue_music',
};

/** Legacy material-icons ligatures whose Rounded/filled equivalent has a different name. */
export const FONT_ICON_RENAMES: Record<string, string> = {
  favorite_border: 'favorite',
  star_border: 'star',
  bookmark_border: 'bookmark',
  check_box_outline_blank: 'check_box_outline_blank',
};
```

`web/src/icons/swap.ts`:
```ts
import { FONT_ICON_RENAMES, MUI_ICON_MAP } from './map';
import type { ClientConfig } from '../types';

function symbol(name: string, keepClasses: string[]): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = ['tide-ms', ...keepClasses].join(' ');
  s.setAttribute('aria-hidden', 'true');
  s.textContent = name;
  return s;
}

export function swapIcons(root: ParentNode): void {
  root.querySelectorAll<SVGElement>('svg[data-testid]').forEach((svg) => {
    const name = MUI_ICON_MAP[svg.getAttribute('data-testid') ?? ''];
    if (!name) return;
    const keep = [...svg.classList].filter((c) => c.startsWith('MuiSvgIcon-fontSize') || c === 'MuiSvgIcon-root');
    svg.replaceWith(symbol(name, keep));
  });
  root.querySelectorAll<HTMLElement>('.material-icons:not(.tide-ms)').forEach((el) => {
    const raw = (el.textContent ?? '').trim();
    if (!raw) return;
    el.classList.remove('material-icons');
    el.classList.add('tide-ms');
    el.textContent = FONT_ICON_RENAMES[raw] ?? raw;
  });
}

export function initIcons(cfg: ClientConfig): void {
  if (!cfg.enableIcons) return;
  swapIcons(document);
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      swapIcons(document);
    });
  }).observe(document.body, { childList: true, subtree: true });
}
```

Modify `web/src/main.ts`. Add `import { initIcons } from './icons/swap';` and `registerFeature(initIcons);` after `registerFeature(initTheme);`.

Also extend `MUI_ICON_MAP` with every `muiIconTestIds` entry from `docs/notes/web-12.4-dom.json` that has no mapping yet. Use the Material Symbols name that is the snake_case of the ID without the `Icon` suffix, for example `LibraryBooksIcon` → `library_books`.

- [ ] **Step 4: Run tests**

Run: `cd web && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): swap MUI and legacy icons for Material Symbols Rounded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: UI components (DOM helper, quality badge, cards)

**Files:**
- Create: `web/src/ui/dom.ts`, `web/src/ui/quality.ts`, `web/src/ui/cards.ts`, `web/src/ui/cards.css`
- Test: `web/test/cards.test.ts`

**Interfaces:**
- Consumes: `JfItem`, `Quality`, `imageUrl`, `play`, `openDetails`, `setWatched`, `setFavourite`
- Produces:
  - `h(tag, attrs?, ...children): HTMLElement`, `icon(name): HTMLElement`
  - `qualityBadge(q: Quality, full: boolean): HTMLElement | null`
  - `posterCard(item: JfItem, opts: { quality?: Quality | null; newDays: number; now?: number }): HTMLElement`
  - `landscapeCard(item: JfItem): HTMLElement`
  - `squareCard(item: JfItem, round?: boolean): HTMLElement`
  - `subLine(item: JfItem): string`, `minutesLeft(item: JfItem): number | null`

- [ ] **Step 1: Write the failing tests**

`web/test/cards.test.ts`:
```ts
import { landscapeCard, minutesLeft, posterCard, subLine } from '../src/ui/cards';
import { qualityBadge } from '../src/ui/quality';
import type { JfItem } from '../src/types';

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
});

const NOW = Date.parse('2026-11-08T12:00:00Z');
const movie: JfItem = {
  Id: 'm1', Name: 'Top Gun: Maverick', Type: 'Movie', ProductionYear: 2022, Genres: ['Action', 'Drama'],
  RunTimeTicks: 130 * 60 * 1e7, CommunityRating: 8.158, CriticRating: 96, DateCreated: '2026-11-01T00:00:00Z',
  UserData: { PlayedPercentage: 60, PlaybackPositionTicks: 78 * 60 * 1e7 },
};
const series: JfItem = { Id: 's1', Name: 'Silo', Type: 'Series', ProductionYear: 2023, Genres: ['Drama'], ChildCount: 3, DateCreated: '2024-01-01T00:00:00Z', UserData: { UnplayedItemCount: 9 } };

test('quality badge: poster form shows res + codec only', () => {
  const b = qualityBadge({ res: '4K', codec: 'HEVC', range: 'HDR10', audio: 'Atmos' }, false)!;
  expect([...b.children].map((c) => c.textContent)).toEqual(['4K', 'HEVC']);
});

test('quality badge: full form includes range and audio, omits null range', () => {
  const b = qualityBadge({ res: '1080p', codec: 'H.264', range: null, audio: '5.1' }, true)!;
  expect([...b.children].map((c) => c.textContent)).toEqual(['1080p', 'H.264', '5.1']);
});

test('sub line for movie and series', () => {
  expect(subLine(movie)).toBe('2022 · Action · 2h 10m');
  expect(subLine(series)).toBe('2023 · Drama · 3 seasons');
});

test('poster card resting state: NEW, quality, progress, no title overlay', () => {
  const c = posterCard(movie, { quality: { res: '4K', codec: 'HEVC' }, newDays: 14, now: NOW });
  expect(c.querySelector('.tide-chip-new')).not.toBeNull();
  expect(c.querySelector('.tide-q')?.textContent).toBe('4KHEVC');
  expect((c.querySelector('.tide-poster-progress i') as HTMLElement).style.width).toBe('60%');
  expect(c.querySelector('.tide-poster-logo')).toBeNull();
  expect(c.querySelector('.tide-card-title')?.textContent).toBe('Top Gun: Maverick');
});

test('poster card: ratings live in hover layer', () => {
  const c = posterCard(movie, { newDays: 14, now: NOW });
  const hover = c.querySelector('.tide-poster-hover')!;
  expect(hover.textContent).toContain('8.2');
  expect(hover.textContent).toContain('96%');
  expect(hover.querySelectorAll('button').length).toBe(4);
});

test('poster card corner: unwatched count, watched check, favourite', () => {
  expect(posterCard(series, { newDays: 14, now: NOW }).querySelector('.tide-corner')?.textContent).toBe('9');
  const watched = posterCard({ ...movie, UserData: { Played: true } }, { newDays: 14, now: NOW });
  expect(watched.querySelector('.tide-corner')?.textContent).toBe('check');
  const fav = posterCard({ ...movie, UserData: { IsFavorite: true } }, { newDays: 14, now: NOW });
  expect(fav.querySelector('.tide-corner')?.textContent).toBe('favorite');
});

test('not NEW when older than window', () => {
  expect(posterCard(series, { newDays: 14, now: NOW }).querySelector('.tide-chip-new')).toBeNull();
});

test('minutes left', () => {
  expect(minutesLeft(movie)).toBe(52);
});

test('landscape card for episode uses episode image + series logo', () => {
  const ep: JfItem = { Id: 'e1', Name: 'Bad Optics', Type: 'Episode', SeriesId: 's9', SeriesName: 'Lanterns', ParentIndexNumber: 1, IndexNumber: 6, RunTimeTicks: 60 * 60 * 1e7, UserData: { PlayedPercentage: 25, PlaybackPositionTicks: 15 * 60 * 1e7 } };
  const c = landscapeCard(ep);
  expect((c.querySelector('.tide-land-img') as HTMLElement).style.backgroundImage).toContain('/Items/e1/Images/Primary');
  expect(c.querySelector('img.tide-land-logo')?.getAttribute('src')).toContain('/Items/s9/Images/Logo');
  expect(c.querySelector('.tide-card-sub')?.textContent).toBe('S1 · E6 · Bad Optics · 45m left');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/cards.test.ts`
Expected: FAIL `Failed to resolve import "../src/ui/cards"`.

- [ ] **Step 3: Implement**

`web/src/ui/dom.ts`:
```ts
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null> & { style?: string };

export function h(tag: string, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function icon(name: string, cls = ''): HTMLElement {
  return h('span', { class: `tide-ms ${cls}`.trim(), 'aria-hidden': 'true' }, name);
}

export function fmtRuntime(ticks?: number): string | null {
  if (!ticks) return null;
  const m = Math.round(ticks / 6e8);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
```

`web/src/ui/quality.ts`:
```ts
import { h } from './dom';
import type { Quality } from '../types';

export function qualityBadge(q: Quality | null | undefined, full: boolean): HTMLElement | null {
  if (!q || !q.res) return null;
  const parts = [h('span', { class: 'tide-q-res' }, q.res), h('span', { class: 'tide-q-codec' }, q.codec)];
  if (full && q.range) parts.push(h('span', { class: 'tide-q-range' }, q.range));
  if (full && q.audio) parts.push(h('span', { class: 'tide-q-audio' }, q.audio));
  return h('span', { class: 'tide-q' }, ...parts);
}
```

`web/src/ui/cards.ts`:
```ts
import './cards.css';
import { fmtRuntime, h, icon } from './dom';
import { qualityBadge } from './quality';
import { imageUrl } from '../api/client';
import { openDetails, play, setFavourite, setWatched } from '../api/actions';
import type { JfItem, Quality } from '../types';

export function subLine(item: JfItem): string {
  const parts: string[] = [];
  if (item.ProductionYear) parts.push(String(item.ProductionYear));
  if (item.Genres?.[0]) parts.push(item.Genres[0]);
  if (item.Type === 'Series') {
    const n = item.ChildCount ?? 1;
    parts.push(`${n} season${n === 1 ? '' : 's'}`);
  } else {
    const rt = fmtRuntime(item.RunTimeTicks);
    if (rt) parts.push(rt);
  }
  return parts.join(' · ');
}

export function minutesLeft(item: JfItem): number | null {
  const pos = item.UserData?.PlaybackPositionTicks;
  if (!pos || !item.RunTimeTicks) return null;
  return Math.max(0, Math.round((item.RunTimeTicks - pos) / 6e8));
}

function isNew(item: JfItem, newDays: number, now: number): boolean {
  if (!item.DateCreated) return false;
  return now - Date.parse(item.DateCreated) <= newDays * 864e5;
}

function corner(item: JfItem): HTMLElement | null {
  const ud = item.UserData ?? {};
  if (item.Type === 'Series' && (ud.UnplayedItemCount ?? 0) > 0) return h('span', { class: 'tide-corner tide-corner-count' }, String(ud.UnplayedItemCount));
  if (ud.Played) return h('span', { class: 'tide-corner tide-corner-done' }, icon('check'));
  if (ud.IsFavorite) return h('span', { class: 'tide-corner tide-corner-fav' }, icon('favorite'));
  return null;
}

function stop(fn: () => void | Promise<void>): EventListener {
  return (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    void fn();
  };
}

export function posterCard(item: JfItem, opts: { quality?: Quality | null; newDays: number; now?: number }): HTMLElement {
  const now = opts.now ?? Date.now();
  const ud = item.UserData ?? {};
  const pct = ud.PlayedPercentage && !ud.Played ? Math.round(ud.PlayedPercentage) : 0;
  const badges = h('div', { class: 'tide-poster-badges' },
    isNew(item, opts.newDays, now) ? h('span', { class: 'tide-chip tide-chip-w tide-chip-new' }, 'NEW') : null,
    qualityBadge(opts.quality, false));
  const ratings = h('div', { class: 'tide-poster-ratings' },
    item.CommunityRating ? h('span', { class: 'tide-chip' }, icon('star', 'tide-star'), item.CommunityRating.toFixed(1)) : null,
    item.CriticRating ? h('span', { class: 'tide-chip' }, icon('local_fire_department', 'tide-critic'), `${Math.round(item.CriticRating)}%`) : null);
  const hover = h('div', { class: 'tide-poster-hover' }, ratings,
    h('div', { class: 'tide-poster-actions' },
      h('button', { class: 'tide-ib tide-ib-w', 'aria-label': 'Play', onclick: stop(() => play(item.Id)) }, icon('play_arrow')),
      h('button', { class: 'tide-ib', 'aria-label': 'Mark watched', onclick: stop(() => setWatched(item.Id, !ud.Played)) }, icon('check')),
      h('button', { class: 'tide-ib', 'aria-label': 'Favourite', onclick: stop(() => setFavourite(item.Id, !ud.IsFavorite)) }, icon('favorite')),
      h('button', { class: 'tide-ib tide-ib-more', 'aria-label': 'More', onclick: stop(() => openDetails(item.Id)) }, icon('more_horiz'))));
  const poster = h('div', { class: 'tide-poster', style: `background-image:url("${imageUrl(item.Id, 'Primary', 500)}")` },
    badges, corner(item),
    pct ? h('div', { class: 'tide-poster-progress' }, (() => { const i = h('i'); i.style.width = `${pct}%`; return i; })()) : null,
    hover);
  const card = h('a', { class: 'tide-card tide-card-poster', href: '#', 'data-id': item.Id, onclick: stop(() => openDetails(item.Id)) },
    poster,
    h('div', { class: 'tide-card-title' }, item.Name),
    h('div', { class: 'tide-card-sub' }, subLine(item)));
  attachLongPress(card);
  return card;
}

export function landscapeCard(item: JfItem): HTMLElement {
  const isEp = item.Type === 'Episode' && item.SeriesId;
  const img = isEp ? imageUrl(item.Id, 'Primary', 640) : imageUrl(item.Id, 'Backdrop/0', 640);
  const logoId = isEp ? item.SeriesId! : item.Id;
  const pct = Math.round(item.UserData?.PlayedPercentage ?? 0);
  const left = minutesLeft(item);
  const sub = isEp
    ? [`S${item.ParentIndexNumber ?? 0} · E${item.IndexNumber ?? 0}`, item.Name]
    : [item.ProductionYear ? String(item.ProductionYear) : null, fmtRuntime(item.RunTimeTicks)];
  if (left !== null) sub.push(`${left}m left`);
  const logo = h('img', { class: 'tide-land-logo', src: imageUrl(logoId, 'Logo', 300), alt: '' }) as HTMLImageElement;
  logo.onerror = () => logo.remove();
  const bar = h('i');
  bar.style.width = `${pct}%`;
  const imgEl = h('div', { class: 'tide-land-img' }, logo,
    h('div', { class: 'tide-land-play' }, icon('play_arrow')),
    pct ? h('div', { class: 'tide-land-progress' }, bar) : null);
  imgEl.style.backgroundImage = `url("${img}")`;
  return h('a', { class: 'tide-card tide-card-land', href: '#', 'data-id': item.Id, onclick: stop(() => play(item.Id)) },
    imgEl,
    h('div', { class: 'tide-card-title' }, isEp ? item.SeriesName ?? item.Name : item.Name),
    h('div', { class: 'tide-card-sub' }, sub.filter(Boolean).join(' · ')));
}

export function squareCard(item: JfItem, round = false): HTMLElement {
  const img = h('div', { class: `tide-sq-img${round ? ' tide-round' : ''}` });
  img.style.backgroundImage = `url("${imageUrl(item.Id, 'Primary', 400)}")`;
  return h('a', { class: 'tide-card tide-card-sq', href: '#', 'data-id': item.Id, onclick: stop(() => openDetails(item.Id)) },
    img,
    h('div', { class: 'tide-card-title' }, item.Name),
    h('div', { class: 'tide-card-sub' }, item.AlbumArtist ?? (item.ProductionYear ? String(item.ProductionYear) : '')));
}

/** Phone: long-press (500 ms) toggles the hover layer instead of opening. */
function attachLongPress(card: HTMLElement): void {
  let t: ReturnType<typeof setTimeout> | undefined;
  card.addEventListener('touchstart', () => {
    t = setTimeout(() => {
      document.querySelectorAll('.tide-card.tide-pressed').forEach((c) => c !== card && c.classList.remove('tide-pressed'));
      card.classList.toggle('tide-pressed');
      t = undefined;
    }, 500);
  }, { passive: true });
  const cancel = () => t && clearTimeout(t);
  card.addEventListener('touchend', cancel);
  card.addEventListener('touchmove', cancel);
}
```

`web/src/ui/cards.css`:
```css
body.tide .tide-card { display: block; color: var(--tide-tx); text-decoration: none; min-width: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
body.tide .tide-card-title { font-size: 14px; font-weight: 600; margin-top: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
body.tide .tide-card-sub { font-size: 12px; color: #8e8e93; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

body.tide .tide-chip { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; font-weight: 700; padding: 3px 7px; border-radius: 7px; background: var(--tide-s2); color: #e5e5ea; }
body.tide .tide-chip .tide-ms { font-size: 13px; }
body.tide .tide-chip-w { background: #fff; color: #000; }
body.tide .tide-star { color: var(--tide-star); }
body.tide .tide-critic { color: var(--tide-critic); }

body.tide .tide-q { display: inline-flex; border-radius: 7px; overflow: hidden; font-size: 10.5px; font-weight: 800; letter-spacing: .02em; box-shadow: 0 0 0 1px rgba(255,255,255,.18); background: #000; }
body.tide .tide-q > span { padding: 3px 6px; }
body.tide .tide-q-res { background: #fff; color: #000; }
body.tide .tide-q-codec, body.tide .tide-q-audio { background: #1c1c1f; color: #fff; }
body.tide .tide-q-audio { border-left: 1px solid #333; }
body.tide .tide-q-range { background: var(--tide-hdr); color: #000; }

body.tide .tide-ib { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--tide-s3); color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: 0 0 auto; }
body.tide .tide-ib .tide-ms { font-size: 20px; }
body.tide .tide-ib-w { background: #fff; color: #000; }
body.tide .tide-ib-more { margin-left: auto; }

/* Rich poster (v4) */
body.tide .tide-poster { position: relative; aspect-ratio: 2/3; border-radius: var(--tide-radius); background: var(--tide-s1) center/cover; overflow: hidden; box-shadow: 0 10px 24px rgba(0,0,0,.55); transition: transform .35s var(--tide-ease), box-shadow .35s var(--tide-ease); }
body.tide .tide-poster::before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,0) 22%); pointer-events: none; }
body.tide .tide-poster-badges { position: absolute; top: 10px; left: 10px; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; z-index: 2; }
body.tide .tide-corner { position: absolute; top: 10px; right: 10px; z-index: 2; min-width: 24px; height: 24px; padding: 0 7px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; background: #fff; color: #000; }
body.tide .tide-corner .tide-ms { font-size: 16px; }
body.tide .tide-corner-fav { background: #000; color: var(--tide-fav); padding: 0; width: 26px; height: 26px; }
body.tide .tide-poster-progress { position: absolute; left: 10px; right: 10px; bottom: 10px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.25); overflow: hidden; z-index: 2; }
body.tide .tide-poster-progress i { display: block; height: 100%; background: #fff; }
body.tide .tide-poster-hover { position: absolute; inset: auto 0 0 0; padding: 48px 12px 12px; background: linear-gradient(0deg, #000 0%, rgba(0,0,0,.85) 55%, rgba(0,0,0,0)); z-index: 3; opacity: 0; transform: translateY(12px); transition: opacity .3s var(--tide-ease), transform .3s var(--tide-ease); }
body.tide .tide-poster-ratings { display: flex; gap: 4px; margin-bottom: 10px; }
body.tide .tide-poster-actions { display: flex; gap: 6px; }
body.tide .tide-card-poster:hover .tide-poster, body.tide .tide-card-poster:focus-visible .tide-poster, body.tide .tide-card-poster.tide-pressed .tide-poster { transform: translateY(-6px) scale(1.04); box-shadow: 0 26px 50px rgba(0,0,0,.85), 0 0 0 3px #fff; }
body.tide .tide-card-poster:hover .tide-poster-hover, body.tide .tide-card-poster:focus-visible .tide-poster-hover, body.tide .tide-card-poster.tide-pressed .tide-poster-hover { opacity: 1; transform: none; }
body.tide .tide-card-poster:hover .tide-poster-progress { opacity: 0; }

/* Landscape continue card */
body.tide .tide-land-img { position: relative; aspect-ratio: 16/9; border-radius: var(--tide-radius); background: var(--tide-s1) center/cover; overflow: hidden; box-shadow: 0 10px 24px rgba(0,0,0,.6); transition: transform .35s var(--tide-ease), box-shadow .35s var(--tide-ease); }
body.tide .tide-land-img::before { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(0,0,0,.85), rgba(0,0,0,0) 55%); }
body.tide .tide-land-logo { position: absolute; left: 12px; bottom: 16px; max-width: 55%; max-height: 34%; z-index: 2; }
body.tide .tide-land-progress { position: absolute; left: 12px; right: 12px; bottom: 8px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.25); overflow: hidden; z-index: 2; }
body.tide .tide-land-progress i { display: block; height: 100%; background: #fff; }
body.tide .tide-land-play { position: absolute; top: 50%; left: 50%; width: 52px; height: 52px; margin: -26px; border-radius: 50%; background: #fff; color: #000; display: flex; align-items: center; justify-content: center; z-index: 3; opacity: 0; transform: scale(.8); transition: .25s var(--tide-ease); }
body.tide .tide-land-play .tide-ms { font-size: 28px; }
body.tide .tide-card-land:hover .tide-land-img { transform: translateY(-4px) scale(1.03); box-shadow: 0 24px 46px rgba(0,0,0,.85), 0 0 0 3px #fff; }
body.tide .tide-card-land:hover .tide-land-play { opacity: 1; transform: none; }

/* Square / round */
body.tide .tide-sq-img { aspect-ratio: 1; border-radius: var(--tide-radius); background: var(--tide-s1) center/cover; box-shadow: 0 10px 24px rgba(0,0,0,.55); transition: transform .35s var(--tide-ease), box-shadow .35s var(--tide-ease); }
body.tide .tide-sq-img.tide-round { border-radius: 50%; }
body.tide .tide-card-sq:hover .tide-sq-img { transform: translateY(-4px) scale(1.03); box-shadow: 0 24px 46px rgba(0,0,0,.85), 0 0 0 3px #fff; }

@media (prefers-reduced-motion: reduce) {
  body.tide .tide-poster, body.tide .tide-land-img, body.tide .tide-sq-img { transition: none; transform: none !important; }
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): add quality badge and rich poster, landscape and square cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Row engine (definitions, ordering, lazy render)

**Files:**
- Create: `web/src/home/rows.ts`, `web/src/home/rowView.ts`, `web/src/home/home.css`
- Test: `web/test/rows.test.ts`

**Interfaces:**
- Consumes: `api`, `getQuality`, `posterCard`, `landscapeCard`, `squareCard`, `h`, `icon`, `UserPrefs`, `RowId`, `ROW_IDS`, `JfItem`, `ROUTES`
- Produces:
  - `RowDef { id: RowId; title(ctx): string; kind: 'poster' | 'landscape' | 'square' | 'round'; fetch(ctx): Promise<JfItem[]>; link?: string }`
  - `RowContext { userId: string; prefs: UserPrefs; newDays: number; genres: string[]; becauseOf?: JfItem | null }`
  - `ROWS: Record<RowId, RowDef>`
  - `visibleRows(prefs: UserPrefs): RowId[]`
  - `pickGenres(prefs: UserPrefs, available: string[], rnd?: () => number): Record<'genre1' | 'genre2' | 'genre3', string | null>`
  - `renderRow(def: RowDef, ctx: RowContext): HTMLElement` (lazy; hides itself when empty)

- [ ] **Step 1: Write the failing tests**

`web/test/rows.test.ts`:
```ts
import { pickGenres, renderRow, ROWS, visibleRows } from '../src/home/rows';
import type { UserPrefs } from '../src/types';

const prefs = (o: Partial<UserPrefs> = {}): UserPrefs => ({
  rowOrder: ['random', 'continue', 'nextUp', 'latestMovies', 'latestShows', 'becauseYouWatched', 'topRated', 'genre1', 'genre2', 'genre3', 'favourites', 'collections', 'musicAlbums', 'musicArtists'],
  hidden: ['collections'], genres: {}, edited: true, ...o,
});

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
  (globalThis as any).IntersectionObserver = class {
    constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
    observe() { this.cb([{ isIntersecting: true }]); }
    disconnect() {}
  };
});
afterEach(() => vi.restoreAllMocks());

test('visibleRows follows order and drops hidden', () => {
  const v = visibleRows(prefs());
  expect(v[0]).toBe('random');
  expect(v).not.toContain('collections');
  expect(v.length).toBe(13);
});

test('pickGenres keeps fixed genres and fills random without duplicates', () => {
  const g = pickGenres(prefs({ genres: { genre1: 'Drama', genre2: null } }), ['Drama', 'Comedy', 'Sci-Fi'], () => 0);
  expect(g.genre1).toBe('Drama');
  expect(new Set(Object.values(g)).size).toBe(3);
});

test('pickGenres returns null when not enough genres', () => {
  expect(pickGenres(prefs(), ['Drama'], () => 0).genre2).toBeNull();
});

test('every row id has a definition', () => {
  for (const id of visibleRows(prefs({ hidden: [] }))) expect(ROWS[id]).toBeDefined();
});

test('renderRow fetches, renders cards, then fetches quality', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/Tide/Quality')) return new Response('{"a":{"res":"4K","codec":"HEVC"}}');
    return new Response(JSON.stringify({ Items: [{ Id: 'a', Name: 'A', Type: 'Movie' }] }));
  });
  const el = renderRow(ROWS.latestMovies, { userId: 'u', prefs: prefs(), newDays: 14, genres: [] });
  await vi.waitFor(() => expect(el.querySelectorAll('.tide-card').length).toBe(1));
  await vi.waitFor(() => expect(el.querySelector('.tide-q')?.textContent).toBe('4KHEVC'));
  expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('IncludeItemTypes=Movie'))).toBe(true);
});

test('renderRow hides itself when empty', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"Items":[]}'));
  const el = renderRow(ROWS.collections, { userId: 'u', prefs: prefs(), newDays: 14, genres: [] });
  await vi.waitFor(() => expect(el.hidden).toBe(true));
});

test('renderRow shows retry on error', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x', { status: 500 }));
  const el = renderRow(ROWS.topRated, { userId: 'u', prefs: prefs(), newDays: 14, genres: [] });
  await vi.waitFor(() => expect(el.querySelector('.tide-row-error button')?.textContent).toContain('Retry'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/rows.test.ts`
Expected: FAIL `Failed to resolve import "../src/home/rows"`.

- [ ] **Step 3: Implement**

`web/src/home/rows.ts`:
```ts
import { api } from '../api/client';
import { ROUTES } from '../router/selectors';
import type { JfItem, RowId, UserPrefs } from '../types';
import { ROW_IDS } from '../types';
export { renderRow } from './rowView';

export interface RowContext { userId: string; prefs: UserPrefs; newDays: number; genres: string[]; becauseOf?: JfItem | null; picked?: Record<string, string | null> }
export interface RowDef {
  id: RowId;
  kind: 'poster' | 'landscape' | 'square' | 'round';
  title(ctx: RowContext): string;
  fetch(ctx: RowContext): Promise<JfItem[]>;
  link?: string;
}

const LIMIT = 20;
const FIELDS = 'Genres,DateCreated,ChildCount,ProductionYear,CommunityRating,CriticRating,RunTimeTicks';
type Result = { Items: JfItem[] };
const items = async (path: string, query: Record<string, string | number | boolean | undefined>) =>
  (await api<Result>(path, { query: { Limit: LIMIT, Fields: FIELDS, EnableUserData: true, ...query } })).Items ?? [];
const userItems = (ctx: RowContext, q: Record<string, string | number | boolean | undefined>) =>
  items('/Items', { userId: ctx.userId, Recursive: true, ...q });

function genreRow(id: 'genre1' | 'genre2' | 'genre3'): RowDef {
  return {
    id, kind: 'poster',
    title: (ctx) => ctx.picked?.[id] ?? '',
    fetch: (ctx) => {
      const g = ctx.picked?.[id];
      return g ? userItems(ctx, { IncludeItemTypes: 'Movie,Series', Genres: g, SortBy: 'Random' }) : Promise.resolve([]);
    },
  };
}

export const ROWS: Record<RowId, RowDef> = {
  continue: { id: 'continue', kind: 'landscape', title: () => 'Continue Watching', fetch: (ctx) => items('/UserItems/Resume', { userId: ctx.userId, MediaTypes: 'Video' }) },
  nextUp: { id: 'nextUp', kind: 'landscape', title: () => 'Next Up', fetch: (ctx) => items('/Shows/NextUp', { userId: ctx.userId }) },
  latestMovies: { id: 'latestMovies', kind: 'poster', link: ROUTES.movies, title: () => 'Recently Added Movies', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'Movie', SortBy: 'DateCreated', SortOrder: 'Descending' }) },
  latestShows: { id: 'latestShows', kind: 'poster', link: ROUTES.shows, title: () => 'Recently Added Shows', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'Series', SortBy: 'DateLastContentAdded', SortOrder: 'Descending' }) },
  becauseYouWatched: {
    id: 'becauseYouWatched', kind: 'poster',
    title: (ctx) => (ctx.becauseOf ? `Because you watched ${ctx.becauseOf.SeriesName ?? ctx.becauseOf.Name}` : ''),
    fetch: async (ctx) => {
      const src = ctx.becauseOf;
      if (!src) return [];
      return (await api<Result>(`/Items/${src.SeriesId ?? src.Id}/Similar`, { query: { userId: ctx.userId, Limit: LIMIT, Fields: FIELDS } })).Items ?? [];
    },
  },
  topRated: { id: 'topRated', kind: 'poster', title: () => 'Top rated, not watched yet', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'Movie,Series', IsPlayed: false, SortBy: 'CommunityRating', SortOrder: 'Descending' }) },
  genre1: genreRow('genre1'),
  genre2: genreRow('genre2'),
  genre3: genreRow('genre3'),
  favourites: { id: 'favourites', kind: 'poster', title: () => 'Your Favourites', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'Movie,Series', IsFavorite: true, SortBy: 'SortName' }) },
  random: { id: 'random', kind: 'poster', title: () => 'Something different', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'Movie,Series', IsPlayed: false, SortBy: 'Random' }) },
  collections: { id: 'collections', kind: 'poster', title: () => 'Collections', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'BoxSet', SortBy: 'SortName' }) },
  musicAlbums: { id: 'musicAlbums', kind: 'square', link: ROUTES.music, title: () => 'Recently Added Albums', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'MusicAlbum', SortBy: 'DateCreated', SortOrder: 'Descending' }) },
  musicArtists: { id: 'musicArtists', kind: 'round', link: ROUTES.music, title: () => 'Artists', fetch: (ctx) => items('/Artists/AlbumArtists', { userId: ctx.userId, SortBy: 'Random' }) },
};

export function visibleRows(prefs: UserPrefs): RowId[] {
  const hidden = new Set(prefs.hidden);
  const known = new Set<string>(ROW_IDS);
  return prefs.rowOrder.filter((id): id is RowId => known.has(id) && !hidden.has(id));
}

export function pickGenres(prefs: UserPrefs, available: string[], rnd: () => number = Math.random): Record<'genre1' | 'genre2' | 'genre3', string | null> {
  const keys = ['genre1', 'genre2', 'genre3'] as const;
  const out = {} as Record<(typeof keys)[number], string | null>;
  const used = new Set<string>();
  for (const k of keys) {
    const fixed = prefs.genres[k];
    if (fixed && available.includes(fixed) && !used.has(fixed)) {
      out[k] = fixed;
      used.add(fixed);
    }
  }
  const pool = available.filter((g) => !used.has(g));
  for (const k of keys) {
    if (out[k]) continue;
    if (!pool.length) { out[k] = null; continue; }
    const g = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!;
    out[k] = g;
    used.add(g);
  }
  return out;
}
```

`web/src/home/rowView.ts`:
```ts
import { getQuality } from '../api/tide';
import { h, icon } from '../ui/dom';
import { landscapeCard, posterCard, squareCard } from '../ui/cards';
import { qualityBadge } from '../ui/quality';
import type { RowContext, RowDef } from './rows';
import type { JfItem } from '../types';

function card(def: RowDef, item: JfItem, ctx: RowContext): HTMLElement {
  if (def.kind === 'landscape') return landscapeCard(item);
  if (def.kind === 'square') return squareCard(item);
  if (def.kind === 'round') return squareCard(item, true);
  return posterCard(item, { newDays: ctx.newDays });
}

export function renderRow(def: RowDef, ctx: RowContext): HTMLElement {
  const track = h('div', { class: `tide-row-track tide-row-${def.kind}` });
  const titleText = def.title(ctx);
  const header = h('div', { class: 'tide-row-head' },
    def.link ? h('a', { class: 'tide-row-title', href: def.link }, titleText, icon('chevron_right')) : h('h2', { class: 'tide-row-title' }, titleText),
    h('div', { class: 'tide-row-arrows' },
      h('button', { class: 'tide-ib', 'aria-label': 'Scroll left', onclick: () => track.scrollBy({ left: -track.clientWidth * 0.9, behavior: 'smooth' }) }, icon('chevron_left')),
      h('button', { class: 'tide-ib', 'aria-label': 'Scroll right', onclick: () => track.scrollBy({ left: track.clientWidth * 0.9, behavior: 'smooth' }) }, icon('chevron_right'))));
  const section = h('section', { class: 'tide-row', 'data-row': def.id }, header, track);
  if (!titleText && def.id !== 'continue') section.hidden = true;

  const load = async () => {
    track.replaceChildren(h('div', { class: 'tide-row-skeleton' }));
    try {
      const list = await def.fetch(ctx);
      if (!list.length) {
        section.hidden = true;
        return;
      }
      section.hidden = false;
      track.replaceChildren(...list.map((i) => card(def, i, ctx)));
      if (def.kind === 'poster') {
        const q = await getQuality(list.map((i) => i.Id)).catch(() => ({}) as Record<string, null>);
        track.querySelectorAll<HTMLElement>('.tide-card-poster').forEach((c) => {
          const badge = qualityBadge(q[c.dataset.id ?? ''] ?? null, false);
          const slot = c.querySelector('.tide-poster-badges');
          if (badge && slot && !slot.querySelector('.tide-q')) slot.append(badge);
        });
      }
    } catch (e) {
      console.warn(`[Tide] row ${def.id} failed`, e);
      track.replaceChildren(h('div', { class: 'tide-row-error' }, "Couldn't load · ", h('button', { onclick: () => void load() }, 'Retry')));
    }
  };

  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      void load();
    }
  }, { rootMargin: '600px 0px' });
  io.observe(section);
  return section;
}
```

`web/src/home/home.css`:
```css
body.tide .tide-home { background: var(--tide-bg); color: var(--tide-tx); padding-bottom: 80px; min-height: 100vh; }
body.tide .tide-row { padding: 0 var(--tide-gutter); margin-top: 36px; }
body.tide .tide-row-head { display: flex; align-items: center; margin-bottom: 16px; }
body.tide .tide-row-title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -.015em; color: var(--tide-tx); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
body.tide .tide-row-title .tide-ms { color: var(--tide-di); }
body.tide .tide-row-arrows { margin-left: auto; display: flex; gap: 8px; }
body.tide .tide-row-track { display: grid; grid-auto-flow: column; gap: 18px; overflow-x: auto; overflow-y: visible; scroll-snap-type: x mandatory; scrollbar-width: none; padding: 10px 4px 24px; margin: -10px -4px 0; }
body.tide .tide-row-track::-webkit-scrollbar { display: none; }
body.tide .tide-row-track > * { scroll-snap-align: start; }
body.tide .tide-row-poster { grid-auto-columns: calc((100% - 18px * 6) / 7); }
body.tide .tide-row-landscape { grid-auto-columns: calc((100% - 18px * 4) / 5); }
body.tide .tide-row-square, body.tide .tide-row-round { grid-auto-columns: calc((100% - 18px * 7) / 8); }
body.tide .tide-row-skeleton { height: 220px; border-radius: var(--tide-radius); background: var(--tide-s1); grid-column: 1 / -1; }
body.tide .tide-row-error { color: var(--tide-mu); font-size: 14px; }
body.tide .tide-row-error button { background: none; border: 0; color: #fff; font-weight: 600; cursor: pointer; text-decoration: underline; }
body.tide .tide-edit-home { display: flex; justify-content: center; margin-top: 48px; }
@media (max-width: 699px) {
  body.tide .tide-row-arrows { display: none; }
  body.tide .tide-row-poster { grid-auto-columns: 38%; }
  body.tide .tide-row-landscape { grid-auto-columns: 78%; }
  body.tide .tide-row-square, body.tide .tide-row-round { grid-auto-columns: 34%; }
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): add home row engine with 14 row types and lazy loading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Hero (H3 + W2 + T3)

**Files:**
- Create: `web/src/home/hero.ts`, `web/src/home/hero.css`
- Test: `web/test/hero.test.ts`

**Interfaces:**
- Consumes: `HeroItem`, `ClientConfig`, `imageUrl`, `streamUrl`, `api`, `play`, `openDetails`, `setFavourite`, `h`, `icon`, `qualityBadge`
- Produces:
  - `createHero(items: HeroItem[], cfg: ClientConfig): { el: HTMLElement; destroy(): void; go(i: number): void; current(): number }`
  - `trailerSources(item: HeroItem, local: string[]): TrailerSource[]`
  - `type TrailerSource = { kind: 'local'; url: string } | { kind: 'youtube'; id: string }`
  - `reasonLine(item: HeroItem): { chip: string | null; episode: string | null; button: string }`

- [ ] **Step 1: Write the failing tests**

`web/test/hero.test.ts`:
```ts
import { createHero, reasonLine, trailerSources } from '../src/home/hero';
import type { ClientConfig, HeroItem } from '../src/types';

const cfg: ClientConfig = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: true, heroSlotSeconds: 30, newDays: 14, version: '0.1.0' };
const base: HeroItem = { id: 'h1', type: 'Movie', reason: 'topRated', name: 'Top Gun: Maverick', year: 2022, genres: ['Action'], overview: 'x', hasLogo: true, youtube: ['Klc__shdj88', 'giXco2jaZ_4'], playTargetId: 'h1' };

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
  (globalThis as any).IntersectionObserver = class { observe() {} disconnect() {} };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

test('reason lines (W2)', () => {
  expect(reasonLine({ ...base, reason: 'resume', progress: { percent: 60, minutesLeft: 52 } })).toEqual({ chip: null, episode: null, button: 'Resume' });
  expect(reasonLine({ ...base, type: 'Series', reason: 'newEpisode', episode: { id: 'e', season: 1, number: 6, name: 'Bad Optics' } }))
    .toEqual({ chip: 'NEW EPISODE', episode: 'S1 · E6 “Bad Optics”', button: 'Play S1 E6' });
  expect(reasonLine({ ...base, type: 'Series', reason: 'nextEpisode', episode: { id: 'e', season: 2, number: 1, name: 'Hi' } }).chip).toBeNull();
  expect(reasonLine({ ...base, reason: 'new' })).toEqual({ chip: 'NEW', episode: null, button: 'Play' });
  expect(reasonLine(base)).toEqual({ chip: null, episode: null, button: 'Play' });
});

test('trailer chain: local first, then youtube in order', () => {
  expect(trailerSources(base, ['loc1'])).toEqual([
    { kind: 'local', url: 'http://jf/Videos/loc1/stream?static=true&ApiKey=t' },
    { kind: 'youtube', id: 'Klc__shdj88' },
    { kind: 'youtube', id: 'giXco2jaZ_4' },
  ]);
});

test('no label above logo; logo image used when available', () => {
  const { el } = createHero([base], cfg);
  expect(el.querySelector('.tide-hero-why')).toBeNull();
  expect(el.querySelector('img.tide-hero-logo')?.getAttribute('src')).toContain('/Items/h1/Images/Logo');
});

test('falls back to text title when no logo', () => {
  const { el } = createHero([{ ...base, hasLogo: false }], cfg);
  expect(el.querySelector('.tide-hero-title')?.textContent).toBe('Top Gun: Maverick');
});

test('T3 strip: one entry per item, active follows go()', () => {
  const items = [base, { ...base, id: 'h2' }, { ...base, id: 'h3' }];
  const hero = createHero(items, { ...cfg, enableTrailers: false });
  const strip = hero.el.querySelectorAll('.tide-t3-item');
  expect(strip.length).toBe(3);
  expect(strip[0]!.classList.contains('on')).toBe(true);
  hero.go(2);
  expect(hero.current()).toBe(2);
  expect(strip[2]!.classList.contains('on')).toBe(true);
  hero.destroy();
});

test('auto-advances after heroSlotSeconds when trailers off', () => {
  vi.useFakeTimers();
  const hero = createHero([base, { ...base, id: 'h2' }], { ...cfg, enableTrailers: false, heroSlotSeconds: 10 });
  vi.advanceTimersByTime(10_001);
  expect(hero.current()).toBe(1);
  hero.destroy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/hero.test.ts`
Expected: FAIL `Failed to resolve import "../src/home/hero"`.

- [ ] **Step 3: Implement**

`web/src/home/hero.ts`:
```ts
import './hero.css';
import { api, imageUrl, streamUrl } from '../api/client';
import { openDetails, play, setFavourite } from '../api/actions';
import { h, icon } from '../ui/dom';
import { qualityBadge } from '../ui/quality';
import type { ClientConfig, HeroItem } from '../types';

export type TrailerSource = { kind: 'local'; url: string } | { kind: 'youtube'; id: string };

const START_DELAY = 3000;
const LOAD_TIMEOUT = 6000;

export function reasonLine(item: HeroItem): { chip: string | null; episode: string | null; button: string } {
  const ep = item.episode;
  const epText = ep ? `S${ep.season} · E${ep.number} “${ep.name}”` : null;
  switch (item.reason) {
    case 'resume': return { chip: null, episode: epText, button: 'Resume' };
    case 'newEpisode': return { chip: 'NEW EPISODE', episode: epText, button: ep ? `Play S${ep.season} E${ep.number}` : 'Play' };
    case 'nextEpisode': return { chip: null, episode: epText, button: ep ? `Play S${ep.season} E${ep.number}` : 'Play' };
    case 'new': return { chip: 'NEW', episode: null, button: 'Play' };
    default: return { chip: null, episode: null, button: 'Play' };
  }
}

export function trailerSources(item: HeroItem, local: string[]): TrailerSource[] {
  return [...local.map((id) => ({ kind: 'local' as const, url: streamUrl(id) })), ...item.youtube.map((id) => ({ kind: 'youtube' as const, id }))];
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function saveData(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || (!!c.effectiveType && c.effectiveType !== '4g'));
}

function slide(item: HeroItem, idx: number): HTMLElement {
  const r = reasonLine(item);
  const bg = h('div', { class: 'tide-hero-bg' });
  bg.style.backgroundImage = `url("${imageUrl(item.id, 'Backdrop/0', 1920)}")`;
  const title = () => h('div', { class: 'tide-hero-title' }, item.name);
  const logo = item.hasLogo ? h('img', { class: 'tide-hero-logo', src: imageUrl(item.id, 'Logo', 800), alt: item.name }) : title();
  if (logo instanceof HTMLImageElement) logo.onerror = () => logo.replaceWith(title());
  const meta = h('div', { class: 'tide-hero-meta' },
    r.chip === 'NEW' ? h('span', { class: 'tide-chip tide-chip-w' }, 'NEW') : null,
    item.communityRating ? h('span', {}, icon('star', 'tide-star'), ` ${item.communityRating.toFixed(1)}`) : null,
    item.criticRating ? h('span', {}, icon('local_fire_department', 'tide-critic'), ` ${Math.round(item.criticRating)}%`) : null,
    item.year ? h('span', {}, String(item.year)) : null,
    item.genres.length ? h('span', {}, item.genres.join(', ')) : null,
    item.seasonCount ? h('span', {}, `${item.seasonCount} season${item.seasonCount === 1 ? '' : 's'}`) : null,
    item.runtimeMinutes ? h('span', {}, `${Math.floor(item.runtimeMinutes / 60)}h ${String(item.runtimeMinutes % 60).padStart(2, '0')}m`) : null,
    item.officialRating ? h('span', { class: 'tide-hero-rating' }, item.officialRating) : null,
    qualityBadge(item.quality, true));
  const episode = r.episode
    ? h('div', { class: 'tide-hero-ep' }, r.chip === 'NEW EPISODE' ? h('span', { class: 'tide-chip tide-chip-w' }, 'NEW EPISODE') : null, r.episode)
    : null;
  const progress = item.progress
    ? h('div', { class: 'tide-hero-progress' }, (() => { const b = h('span', { class: 'tide-hero-bar' }, h('i')); (b.firstChild as HTMLElement).style.width = `${item.progress!.percent}%`; return b; })(), `${item.progress.minutesLeft}m left`)
    : null;
  const buttons = h('div', { class: 'tide-hero-btns' },
    h('button', { class: 'tide-btn tide-btn-w', onclick: () => void play(item.playTargetId) }, icon('play_arrow'), r.button),
    h('button', { class: 'tide-btn', onclick: () => openDetails(item.id) }, icon('info'), 'More info'),
    h('button', { class: 'tide-ib tide-ib-lg', 'aria-label': 'Watchlist', onclick: () => void setFavourite(item.id, true) }, icon('add')),
    h('button', { class: 'tide-ib tide-ib-lg', 'aria-label': 'Favourite', onclick: () => void setFavourite(item.id, true) }, icon('favorite')));
  return h('div', { class: 'tide-hero-slide', 'data-i': idx }, bg, h('div', { class: 'tide-hero-vid' }), h('div', { class: 'tide-hero-shade' }),
    h('div', { class: 'tide-hero-txt' }, logo, meta, episode, h('p', { class: 'tide-hero-desc' }, item.overview), buttons, progress));
}

export function createHero(items: HeroItem[], cfg: ClientConfig) {
  const slides = items.map(slide);
  const muteBtn = h('button', { class: 'tide-ib tide-hero-mute', 'aria-label': 'Unmute' }, icon('volume_off'));
  const strip = h('div', { class: 'tide-t3' }, ...items.map((it, i) => {
    const logo = it.hasLogo ? h('img', { src: imageUrl(it.id, 'Logo', 260), alt: it.name }) : h('span', { class: 'tide-t3-text' }, it.name);
    return h('button', { class: 'tide-t3-item', 'data-i': i, 'aria-label': it.name, onclick: () => go(i) }, logo, h('span', { class: 'tide-t3-bar' }, h('i')));
  }));
  const el = h('section', { class: 'tide-hero' }, ...slides, strip, muteBtn);
  const trailersOn = cfg.enableTrailers && !reducedMotion() && !saveData();
  if (!trailersOn) muteBtn.hidden = true;

  let cur = -1;
  let muted = true;
  let slotTimer: ReturnType<typeof setTimeout> | undefined;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let paused = false;
  let remainingMs = cfg.heroSlotSeconds * 1000;
  let slotStartedAt = 0;

  const clearTimers = () => [slotTimer, startTimer, loadTimer].forEach((t) => t && clearTimeout(t));

  function stopVideo(s: HTMLElement): void {
    s.classList.remove('vidon');
    const v = s.querySelector('.tide-hero-vid')!;
    v.classList.remove('show');
    v.replaceChildren();
  }

  function scheduleNext(ms: number): void {
    slotStartedAt = Date.now();
    remainingMs = ms;
    slotTimer = setTimeout(() => go(cur + 1), ms);
  }

  function setBar(i: number, ms: number, from = 0): void {
    strip.querySelectorAll<HTMLElement>('.tide-t3-bar i').forEach((b, n) => {
      b.style.transition = 'none';
      b.style.width = n === i ? `${from}%` : '0%';
    });
    const bar = strip.querySelectorAll<HTMLElement>('.tide-t3-bar i')[i];
    if (bar) {
      void bar.offsetWidth;
      bar.style.transition = `width ${ms}ms linear`;
      bar.style.width = '100%';
    }
  }

  async function startTrailer(i: number): Promise<void> {
    const item = items[i]!;
    let local: string[] = [];
    try {
      local = (await api<{ Id: string }[]>(`/Items/${item.id}/LocalTrailers`)).map((t) => t.Id);
    } catch { /* none */ }
    if (cur !== i) return;
    tryNext(i, trailerSources(item, local), 0);
  }

  function tryNext(i: number, sources: TrailerSource[], n: number): void {
    const s = slides[i]!;
    const box = s.querySelector('.tide-hero-vid')!;
    if (cur !== i || n >= sources.length) {
      s.classList.add('kenburns');
      return;
    }
    const src = sources[n]!;
    const fail = () => { if (cur === i) { box.replaceChildren(); tryNext(i, sources, n + 1); } };
    const ok = () => {
      if (cur !== i) return;
      loadTimer && clearTimeout(loadTimer);
      box.classList.add('show');
      s.classList.add('vidon');
    };
    loadTimer = setTimeout(fail, LOAD_TIMEOUT);
    if (src.kind === 'local') {
      const v = h('video', { muted: true, autoplay: true, playsinline: true }) as HTMLVideoElement;
      v.muted = muted;
      v.src = src.url;
      v.addEventListener('playing', ok, { once: true });
      v.addEventListener('error', fail, { once: true });
      v.addEventListener('ended', () => cur === i && go(i + 1));
      box.replaceChildren(v);
    } else {
      const f = h('iframe', {
        allow: 'autoplay; encrypted-media',
        src: `https://www.youtube-nocookie.com/embed/${src.id}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`,
      }) as HTMLIFrameElement;
      f.addEventListener('load', () => setTimeout(() => { ok(); if (!muted) ytCommand(f, 'unMute'); }, 1500), { once: true });
      box.replaceChildren(f);
    }
  }

  function ytCommand(f: HTMLIFrameElement, func: string): void {
    f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
  }

  function onYtMessage(e: MessageEvent): void {
    if (typeof e.data !== 'string' || !e.origin.includes('youtube')) return;
    try {
      const d = JSON.parse(e.data) as { event?: string; info?: { playerState?: number } | number };
      const state = typeof d.info === 'object' ? d.info?.playerState : undefined;
      if (state === 0) go(cur + 1); // ended
    } catch { /* ignore */ }
  }

  function go(n: number): void {
    if (!items.length) return;
    clearTimers();
    if (cur >= 0) {
      slides[cur]!.classList.remove('on', 'kenburns');
      stopVideo(slides[cur]!);
      strip.children[cur]?.classList.remove('on');
    }
    cur = ((n % items.length) + items.length) % items.length;
    slides[cur]!.classList.add('on');
    strip.children[cur]?.classList.add('on');
    const ms = cfg.heroSlotSeconds * 1000;
    setBar(cur, ms);
    if (items.length > 1) scheduleNext(ms);
    if (trailersOn) {
      const i = cur;
      startTimer = setTimeout(() => void startTrailer(i), START_DELAY);
    } else if (!reducedMotion()) {
      slides[cur]!.classList.add('kenburns');
    }
  }

  function pause(): void {
    if (paused) return;
    paused = true;
    clearTimeout(slotTimer);
    remainingMs = Math.max(0, remainingMs - (Date.now() - slotStartedAt));
  }

  function resume(): void {
    if (!paused) return;
    paused = false;
    if (items.length > 1) scheduleNext(remainingMs);
  }

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.firstElementChild!.textContent = muted ? 'volume_off' : 'volume_up';
    const s = slides[cur];
    const f = s?.querySelector('iframe');
    const v = s?.querySelector('video');
    if (f) ytCommand(f as HTMLIFrameElement, muted ? 'mute' : 'unMute');
    if (v) (v as HTMLVideoElement).muted = muted;
  });

  const onVis = () => (document.hidden ? pause() : resume());
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('message', onYtMessage);
  const io = new IntersectionObserver((e) => (e.some((x) => x.isIntersecting) ? resume() : pause()), { threshold: 0.2 });
  io.observe(el);

  go(0);

  return {
    el,
    go,
    current: () => cur,
    destroy(): void {
      clearTimers();
      slides.forEach(stopVideo);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('message', onYtMessage);
      io.disconnect();
    },
  };
}
```

`web/src/home/hero.css`:
```css
body.tide .tide-hero { position: relative; height: 720px; overflow: hidden; background: #000; }
body.tide .tide-hero-slide { position: absolute; inset: 0; opacity: 0; transition: opacity 1.1s ease; pointer-events: none; }
body.tide .tide-hero-slide.on { opacity: 1; pointer-events: auto; }
body.tide .tide-hero-bg { position: absolute; inset: 0; background: #000 center 20% / cover; }
body.tide .tide-hero-slide.kenburns .tide-hero-bg { animation: tide-kb 30s ease-out forwards; }
@keyframes tide-kb { from { transform: scale(1); } to { transform: scale(1.1); } }
body.tide .tide-hero-vid { position: absolute; inset: 0; overflow: hidden; opacity: 0; transition: opacity 1.4s ease; }
body.tide .tide-hero-vid.show { opacity: 1; }
body.tide .tide-hero-vid iframe, body.tide .tide-hero-vid video { position: absolute; top: 50%; left: 50%; width: 100%; aspect-ratio: 16/9; min-height: 100%; transform: translate(-50%, -50%) scale(1.18); border: 0; pointer-events: none; object-fit: cover; }
body.tide .tide-hero-shade { position: absolute; inset: 0; z-index: 2; background:
  linear-gradient(90deg, #000 0%, rgba(0,0,0,.85) 26%, rgba(0,0,0,.2) 58%, rgba(0,0,0,0) 78%),
  linear-gradient(0deg, #000 0%, rgba(0,0,0,0) 36%),
  linear-gradient(180deg, rgba(0,0,0,.6), rgba(0,0,0,0) 20%); }
body.tide .tide-hero-txt { position: absolute; left: var(--tide-gutter); bottom: 150px; z-index: 3; width: min(540px, 80%); }
body.tide .tide-hero-logo { display: block; max-width: 440px; max-height: 170px; margin-bottom: 20px; transform-origin: left bottom; transition: transform .9s var(--tide-ease); filter: drop-shadow(0 4px 24px rgba(0,0,0,.6)); }
body.tide .tide-hero-title { font-weight: 900; font-size: 62px; letter-spacing: -.045em; line-height: .92; margin-bottom: 18px; }
body.tide .vidon .tide-hero-logo { transform: scale(.72); }
body.tide .tide-hero-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 14px; font-weight: 500; color: #e5e5ea; }
body.tide .tide-hero-meta .tide-ms { font-size: 17px; margin-top: -2px; }
body.tide .tide-hero-rating { border: 1px solid #636366; border-radius: 6px; padding: 2px 7px; font-size: 11px; font-weight: 700; }
body.tide .tide-hero-ep { margin-top: 12px; font-size: 14px; font-weight: 600; display: flex; gap: 8px; align-items: center; }
body.tide .tide-hero-desc { color: #d1d1d6; font-size: 15px; line-height: 1.55; margin: 14px 0 24px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; max-height: 80px; transition: opacity .6s, max-height .8s, margin .8s; }
body.tide .vidon .tide-hero-desc { opacity: 0; max-height: 0; margin: 8px 0 16px; }
body.tide .tide-hero-btns { display: flex; gap: 10px; align-items: center; }
body.tide .tide-btn { display: inline-flex; align-items: center; gap: 8px; font: 700 15px var(--tide-font); padding: 13px 26px; border-radius: 14px; border: 0; background: var(--tide-s3); color: #fff; cursor: pointer; }
body.tide .tide-btn .tide-ms { font-size: 22px; }
body.tide .tide-btn-w { background: #fff; color: #000; }
body.tide .tide-ib-lg { width: 48px; height: 48px; }
body.tide .tide-hero-progress { margin-top: 14px; display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--tide-mu); }
body.tide .tide-hero-bar { width: 140px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.25); overflow: hidden; }
body.tide .tide-hero-bar i { display: block; height: 100%; background: #fff; }
body.tide .tide-hero-mute { position: absolute; right: var(--tide-gutter); top: 100px; z-index: 5; background: var(--tide-s2); }
/* T3 logo strip */
body.tide .tide-t3 { position: absolute; right: var(--tide-gutter); bottom: 56px; z-index: 4; display: flex; gap: 30px; align-items: flex-end; }
body.tide .tide-t3-item { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; background: none; border: 0; padding: 0; cursor: pointer; color: #fff; }
body.tide .tide-t3-item img { height: 34px; max-width: 150px; object-fit: contain; object-position: left bottom; filter: grayscale(1) brightness(.45); transition: filter .3s, height .3s var(--tide-ease); }
body.tide .tide-t3-item.on img { filter: none; height: 44px; }
body.tide .tide-t3-text { font-weight: 800; font-size: 14px; color: #6e6e73; max-width: 150px; text-align: left; }
body.tide .tide-t3-item.on .tide-t3-text { color: #fff; }
body.tide .tide-t3-bar { width: 100%; height: 3px; border-radius: 2px; background: var(--tide-s3); overflow: hidden; }
body.tide .tide-t3-bar i { display: block; height: 100%; width: 0; background: #fff; }
@media (max-width: 699px) {
  body.tide .tide-hero { height: 78vh; min-height: 520px; }
  body.tide .tide-hero-txt { bottom: 70px; width: auto; right: var(--tide-gutter); }
  body.tide .tide-hero-logo { max-width: 70%; max-height: 110px; }
  body.tide .tide-hero-title { font-size: 40px; }
  body.tide .tide-hero-desc, body.tide .tide-hero-meta .tide-q, body.tide .tide-hero-btns .tide-btn:nth-child(2), body.tide .tide-hero-btns .tide-ib:last-child { display: none; }
  body.tide .tide-hero-btns .tide-btn-w { flex: 1; justify-content: center; }
  body.tide .tide-t3 { left: 0; right: 0; bottom: 28px; justify-content: center; gap: 6px; }
  body.tide .tide-t3-item img, body.tide .tide-t3-text { display: none; }
  body.tide .tide-t3-bar { width: 8px; height: 8px; border-radius: 4px; }
  body.tide .tide-t3-item.on .tide-t3-bar { width: 28px; }
  body.tide .tide-hero-mute { top: 70px; }
}
@media (prefers-reduced-motion: reduce) {
  body.tide .tide-hero-slide.kenburns .tide-hero-bg { animation: none; }
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): add H3 hero with trailer chain, W2 reasons and T3 logo strip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Home assembly, router hook, Edit-home panel, phone tab bar

**Files:**
- Create: `web/src/home/home.ts`, `web/src/home/editPanel.ts`, `web/src/router/hook.ts`, `web/src/mobile/tabbar.ts`
- Modify: `web/src/main.ts` (register `initRouter`, `initTabbar`)
- Test: `web/test/home.test.ts`

**Interfaces:**
- Consumes:
  - `getHome`, `putPrefs`, `api`
  - `createHero`, `ROWS`, `visibleRows`, `pickGenres`, `renderRow`
  - `SELECTORS`, `ROUTES`, `WEB_VERIFIED_VERSION`
  - `h`, `icon`
- Produces:
  - `mountHome(host: HTMLElement, cfg): Promise<() => void>`, which returns an unmount function
  - `openEditPanel(prefs, onSave)`, `moveRow(order, from, to): string[]`
  - `initRouter(cfg)`, `initTabbar()`

- [ ] **Step 1: Write the failing tests**

`web/test/home.test.ts`:
```ts
import { moveRow } from '../src/home/editPanel';
import { mountHome } from '../src/home/home';
import { shouldTakeOver } from '../src/router/hook';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: '0.1.0' };

beforeEach(() => {
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
  (globalThis as any).IntersectionObserver = class { observe() {} disconnect() {} };
});
afterEach(() => vi.restoreAllMocks());

test('moveRow reorders', () => {
  expect(moveRow(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  expect(moveRow(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
});

test('shouldTakeOver only on home with feature on', () => {
  expect(shouldTakeOver(cfg, { hash: '#/home', pathname: '/web/' } as Location)).toBe(true);
  expect(shouldTakeOver(cfg, { hash: '#/details?id=1', pathname: '/web/' } as Location)).toBe(false);
  expect(shouldTakeOver({ ...cfg, enableHome: false }, { hash: '#/home', pathname: '/web/' } as Location)).toBe(false);
});

test('mountHome hides stock content, renders hero + rows + edit button, unmount restores', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/Tide/Home')) return new Response(JSON.stringify({
      hero: [{ id: 'h1', type: 'Movie', reason: 'new', name: 'X', genres: [], overview: '', hasLogo: false, youtube: [], playTargetId: 'h1' }],
      prefs: { rowOrder: ['continue', 'topRated'], hidden: [], genres: {}, edited: false }, config: cfg,
    }));
    if (u.includes('/Genres')) return new Response('{"Items":[{"Name":"Drama"}]}');
    return new Response('{"Items":[]}');
  });
  document.body.innerHTML = '<main><div class="stock">stock</div></main>';
  const host = document.querySelector('main') as HTMLElement;
  const unmount = await mountHome(host, cfg);
  expect((host.querySelector('.stock') as HTMLElement).hidden).toBe(true);
  expect(host.querySelector('.tide-hero')).not.toBeNull();
  expect(host.querySelectorAll('.tide-row').length).toBeGreaterThanOrEqual(2);
  expect(host.querySelector('.tide-edit-home button')?.textContent).toContain('Edit home');
  expect(document.body.classList.contains('tide-on-home')).toBe(true);
  unmount();
  expect(host.querySelector('.tide-home')).toBeNull();
  expect((host.querySelector('.stock') as HTMLElement).hidden).toBe(false);
  expect(document.body.classList.contains('tide-on-home')).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/home.test.ts`
Expected: FAIL `Failed to resolve import "../src/home/editPanel"`.

- [ ] **Step 3: Implement**

`web/src/home/editPanel.ts`:
```ts
import { h, icon } from '../ui/dom';
import { ROWS } from './rows';
import type { RowId, UserPrefs } from '../types';
import { ROW_IDS } from '../types';

export function moveRow(order: string[], from: number, to: number): string[] {
  const next = [...order];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

const LABELS: Partial<Record<RowId, string>> = { genre1: 'Genre row 1', genre2: 'Genre row 2', genre3: 'Genre row 3', becauseYouWatched: 'Because you watched…' };

export function openEditPanel(prefs: UserPrefs, genres: string[], onSave: (p: UserPrefs) => void): void {
  let order = [...prefs.rowOrder];
  const hidden = new Set(prefs.hidden);
  const picked: Record<string, string | null> = { ...prefs.genres };
  const list = h('ol', { class: 'tide-edit-list' });
  const close = () => overlay.remove();

  function render(): void {
    list.replaceChildren(...order.map((id, i) => {
      const def = ROWS[id as RowId];
      const label = LABELS[id as RowId] ?? def.title({ userId: '', prefs, newDays: 0, genres: [] });
      const toggle = h('input', { type: 'checkbox', 'aria-label': `Show ${label}` }) as HTMLInputElement;
      toggle.checked = !hidden.has(id);
      toggle.onchange = () => { if (toggle.checked) hidden.delete(id); else hidden.add(id); };
      const genreSel = id.startsWith('genre')
        ? (() => {
            const s = h('select', {}, h('option', { value: '' }, 'Random'), ...genres.map((g) => h('option', { value: g }, g))) as HTMLSelectElement;
            s.value = picked[id] ?? '';
            s.onchange = () => { picked[id] = s.value || null; };
            return s;
          })()
        : null;
      const li = h('li', { class: 'tide-edit-item', draggable: 'true', 'data-i': i },
        icon('drag_indicator', 'tide-edit-handle'), h('span', { class: 'tide-edit-label' }, label), genreSel,
        h('button', { class: 'tide-ib', 'aria-label': 'Move up', onclick: () => { if (i > 0) { order = moveRow(order, i, i - 1); render(); } } }, icon('arrow_upward')),
        h('button', { class: 'tide-ib', 'aria-label': 'Move down', onclick: () => { if (i < order.length - 1) { order = moveRow(order, i, i + 1); render(); } } }, icon('arrow_downward')),
        h('label', { class: 'tide-switch' }, toggle, h('span')));
      li.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', String(i)));
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer?.getData('text/plain'));
        if (!Number.isNaN(from)) { order = moveRow(order, from, i); render(); }
      });
      return li;
    }));
  }

  const panel = h('aside', { class: 'tide-edit-panel', role: 'dialog', 'aria-label': 'Edit home' },
    h('header', {}, h('h2', {}, 'Edit home'), h('button', { class: 'tide-ib', 'aria-label': 'Close', onclick: close }, icon('close'))),
    list,
    h('footer', {},
      h('button', { class: 'tide-btn', onclick: () => { order = [...ROW_IDS]; hidden.clear(); Object.keys(picked).forEach((k) => (picked[k] = null)); render(); } }, 'Reset to default'),
      h('button', { class: 'tide-btn tide-btn-w', onclick: () => { onSave({ rowOrder: order, hidden: [...hidden], genres: picked, edited: true }); close(); } }, 'Save')));
  const overlay = h('div', { class: 'tide-edit-overlay', onclick: (e: Event) => { if (e.target === overlay) close(); } }, panel);
  render();
  document.body.append(overlay);
}
```

`web/src/home/home.ts`:
```ts
import './home.css';
import { api, getSession } from '../api/client';
import { getHome, putPrefs } from '../api/tide';
import { h, icon } from '../ui/dom';
import { createHero } from './hero';
import { openEditPanel } from './editPanel';
import { pickGenres, renderRow, ROWS, visibleRows } from './rows';
import type { RowContext } from './rows';
import type { ClientConfig, HomeResponse, JfItem, UserPrefs } from '../types';

export async function mountHome(host: HTMLElement, cfg: ClientConfig): Promise<() => void> {
  const stock = [...host.children].filter((c) => !c.classList.contains('tide-home')) as HTMLElement[];
  stock.forEach((c) => (c.hidden = true));
  document.body.classList.add('tide-on-home');
  const root = h('div', { class: 'tide-home' });
  host.prepend(root);
  let heroApi: ReturnType<typeof createHero> | null = null;

  const userId = getSession()?.userId ?? '';
  let data: HomeResponse | null = null;
  try {
    data = await getHome();
  } catch (e) {
    console.warn('[Tide] /Tide/Home failed, rows only', e);
  }
  const prefs: UserPrefs = data?.prefs ?? { rowOrder: Object.keys(ROWS), hidden: [], genres: {}, edited: false };

  const [genres, recent] = await Promise.all([
    api<{ Items: { Name: string }[] }>('/Genres', { query: { userId, IncludeItemTypes: 'Movie,Series', Recursive: true } }).then((r) => r.Items.map((g) => g.Name)).catch(() => [] as string[]),
    api<{ Items: JfItem[] }>('/Items', { query: { userId, Recursive: true, IncludeItemTypes: 'Movie,Episode', IsPlayed: true, SortBy: 'DatePlayed', SortOrder: 'Descending', Limit: 1 } }).then((r) => r.Items[0] ?? null).catch(() => null),
  ]);

  if (!data) {
    const first = await api<{ Items: JfItem[] }>('/UserItems/Resume', { query: { userId, Limit: 1, MediaTypes: 'Video' } })
      .then((r) => r.Items[0] ?? null).catch(() => null);
    if (first) {
      data = {
        prefs, config: cfg,
        hero: [{
          id: first.SeriesId ?? first.Id, type: first.SeriesId ? 'Series' : 'Movie', reason: 'resume',
          name: first.SeriesName ?? first.Name, year: first.ProductionYear, genres: first.Genres ?? [], overview: '',
          hasLogo: true, youtube: [], playTargetId: first.Id,
        }],
      };
    }
  }

  function build(p: UserPrefs): void {
    heroApi?.destroy();
    heroApi = null;
    root.replaceChildren();
    if (data?.hero.length) {
      heroApi = createHero(data.hero, cfg);
      root.append(heroApi.el);
    } else {
      root.append(h('div', { class: 'tide-hero-spacer' }));
    }
    const ctx: RowContext = { userId, prefs: p, newDays: cfg.newDays, genres, becauseOf: recent, picked: pickGenres(p, genres) };
    for (const id of visibleRows(p)) root.append(renderRow(ROWS[id], ctx));
    root.append(h('div', { class: 'tide-edit-home' },
      h('button', { class: 'tide-btn', onclick: () => openEditPanel(p, genres, async (np) => {
        try { build(await putPrefs(np)); } catch (e) { console.warn('[Tide] save prefs failed', e); }
      }) }, icon('tune'), 'Edit home')));
  }

  build(prefs);

  return () => {
    heroApi?.destroy();
    root.remove();
    stock.forEach((c) => (c.hidden = false));
    document.body.classList.remove('tide-on-home');
  };
}
```

Append to `web/src/home/home.css`:
```css
body.tide .tide-hero-spacer { height: 96px; }
body.tide .tide-edit-overlay { position: fixed; inset: 0; z-index: 2000; background: none; display: flex; justify-content: flex-end; }
body.tide .tide-edit-panel { box-shadow: -30px 0 60px #000; }
body.tide .tide-edit-panel { width: min(440px, 100%); height: 100%; background: var(--tide-s1); border-left: 1px solid var(--tide-line); display: flex; flex-direction: column; color: var(--tide-tx); }
body.tide .tide-edit-panel header, body.tide .tide-edit-panel footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 20px 24px; }
body.tide .tide-edit-panel h2 { margin: 0; font-size: 20px; }
body.tide .tide-edit-list { list-style: none; margin: 0; padding: 0 16px; overflow-y: auto; flex: 1; }
body.tide .tide-edit-item { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 12px; background: var(--tide-s2); margin-bottom: 8px; }
body.tide .tide-edit-label { flex: 1; font-size: 14px; font-weight: 600; }
body.tide .tide-edit-handle { color: var(--tide-di); cursor: grab; }
body.tide .tide-edit-item select { background: var(--tide-s3); color: var(--tide-tx); border: 0; border-radius: 8px; padding: 6px; }
body.tide .tide-switch input { accent-color: #fff; width: 18px; height: 18px; }
```
The overlay is an invisible click-catcher (no tint); the panel itself is solid `--tide-s1`. No translucency.

`web/src/router/hook.ts`:
```ts
import { mountHome } from '../home/home';
import { ROUTES, SELECTORS, WEB_VERIFIED_VERSION } from './selectors';
import type { ClientConfig } from '../types';

export function shouldTakeOver(cfg: ClientConfig, loc: Location = location): boolean {
  return cfg.enableHome && ROUTES.isHome(loc);
}

function findHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(SELECTORS.homeHost);
}

/** One-time (per browser) toast, shown only to administrators. */
export async function adminToast(message: string): Promise<void> {
  const key = `tide-toast:${message}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch { /* storage blocked */ }
  const c = (window as unknown as { ApiClient?: { getCurrentUser(): Promise<{ Policy?: { IsAdministrator?: boolean } }> } }).ApiClient;
  const user = await c?.getCurrentUser().catch(() => null);
  if (!user?.Policy?.IsAdministrator) return;
  const t = document.createElement('div');
  t.className = 'tide-toast';
  t.textContent = message;
  t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:3000;background:#141416;color:#f5f5f7;border:1px solid #2c2c2e;border-radius:14px;padding:14px 18px;font:500 14px var(--tide-font);max-width:90vw';
  t.onclick = () => t.remove();
  document.body.append(t);
  setTimeout(() => t.remove(), 12000);
  try {
    localStorage.setItem(key, '1');
  } catch { /* storage blocked */ }
}

export function initRouter(cfg: ClientConfig): void {
  let unmount: (() => void) | null = null;
  let mounting = false;
  let warned = false;

  async function sync(): Promise<void> {
    if (!shouldTakeOver(cfg)) {
      unmount?.();
      unmount = null;
      return;
    }
    if (unmount || mounting) return;
    mounting = true;
    let host = findHost();
    for (let i = 0; !host && i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      host = findHost();
    }
    if (!host) {
      if (!warned) {
        console.warn(`[Tide] home host not found; Tide verified for web ${WEB_VERIFIED_VERSION}. Keeping stock home.`);
        void adminToast(`Tide home is off: this Jellyfin web version is not verified (Tide supports ${WEB_VERIFIED_VERSION}). Theme stays on.`);
      }
      warned = true;
      mounting = false;
      return;
    }
    unmount = await mountHome(host, cfg);
    mounting = false;
  }

  window.addEventListener('hashchange', () => void sync());
  window.addEventListener('popstate', () => void sync());
  // React may re-render the host and wipe our root; re-sync when that happens.
  new MutationObserver(() => {
    if (unmount && !document.querySelector('.tide-home')) {
      unmount();
      unmount = null;
      void sync();
    }
  }).observe(document.body, { childList: true, subtree: true });
  void sync();
}
```

`web/src/mobile/tabbar.ts`:
```ts
import { h, icon } from '../ui/dom';
import { ROUTES } from '../router/selectors';

export function initTabbar(): void {
  const tabs: [string, string, string][] = [['home', 'Home', ROUTES.home], ['movie', 'Movies', ROUTES.movies], ['tv', 'Shows', ROUTES.shows], ['search', 'Search', ROUTES.search]];
  const bar = h('nav', { class: 'tide-tabbar', 'aria-label': 'Main' }, ...tabs.map(([ic, label, href]) =>
    h('a', { href, 'data-href': href }, h('span', { class: 'tide-tab-pill' }, icon(ic)), label)));
  const mark = () => bar.querySelectorAll('a').forEach((a) => a.classList.toggle('on', location.hash.startsWith(a.dataset.href ?? '~')));
  window.addEventListener('hashchange', mark);
  mark();
  document.body.append(bar);
  const style = document.createElement('style');
  style.textContent = `
    body.tide .tide-tabbar { display: none; }
    @media (max-width: 699px) {
      body.tide .tide-tabbar { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 1500; height: calc(64px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); background: var(--tide-s1); border-top: 1px solid var(--tide-line); justify-content: space-around; align-items: center; }
      body.tide .tide-tabbar a { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; color: var(--tide-di); text-decoration: none; min-width: 64px; min-height: 44px; justify-content: center; }
      body.tide .tide-tabbar a.on { color: #fff; }
      body.tide .tide-tab-pill { padding: 4px 18px; border-radius: 16px; }
      body.tide .tide-tabbar a.on .tide-tab-pill { background: #fff; color: #000; }
      body.tide .tide-home { padding-bottom: 96px; }
    }`;
  document.head.append(style);
}
```

Modify `web/src/main.ts`. Add these imports:
```ts
import { initRouter } from './router/hook';
import { initTabbar } from './mobile/tabbar';
```
And register them after the icon feature:
```ts
registerFeature(initRouter);
registerFeature(() => initTabbar());
```

- [ ] **Step 4: Run tests, build, deploy locally and check by eye**

Run: `cd web && npm test && npm run typecheck && npm run build && cd .. && ./scripts/dotnet publish server/Jellyfin.Plugin.Tide -c Release -o e2e/plugins/Tide && (cd e2e && docker compose restart)`
Expected: tests pass. After about 15 s, log in at `http://localhost:8096` as `tide`/`tide`. Home shows the Tide hero (Big Buck Bunny / Sintel), rows, and an Edit home button. Clicking More info opens the stock details page.
If home still shows stock content, compare `SELECTORS.homeHost` with `docs/notes/web-12.4-dom.md`, fix the selector and redo this step.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): mount Tide home on /home with edit panel and phone tab bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: End-to-end tests

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/tests/home.spec.ts`

**Interfaces:**
- Consumes: the running local Jellyfin (Task 2) with the plugin published (Task 14 Step 4), and `setup.mjs`

- [ ] **Step 1: Config and spec**

`e2e/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  use: { baseURL: process.env.JF_URL ?? 'http://localhost:8096', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
```

`e2e/tests/home.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/web/');
  await page.waitForSelector('input[type=password]');
  await page.fill('input[type=text], #txtManualName', 'tide');
  await page.fill('input[type=password]', 'tide');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
}

test('home renders hero and rows', async ({ page }) => {
  await login(page);
  await expect(page.locator('body')).toHaveClass(/tide-theme/);
  await expect(page.locator('.tide-hero-slide.on')).toBeVisible();
  await expect(page.locator('.tide-row:not([hidden])').first()).toBeVisible();
});

test('poster hover shows actions (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  const card = page.locator('.tide-card-poster').first();
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await expect(card.locator('.tide-poster-hover')).toHaveCSS('opacity', '1');
});

test('edit home: hide a row persists after reload', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  await page.getByRole('button', { name: /Edit home/ }).click();
  const item = page.locator('.tide-edit-item').filter({ hasText: 'Something different' });
  await item.locator('input[type=checkbox]').uncheck();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.reload();
  await page.waitForSelector('.tide-home');
  await expect(page.locator('.tide-row[data-row="random"]')).toHaveCount(0);
  // restore
  await page.getByRole('button', { name: /Edit home/ }).click();
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
});

test('phone shows tab bar and no row arrows', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await login(page);
  await expect(page.locator('.tide-tabbar')).toBeVisible();
  await expect(page.locator('.tide-row-arrows').first()).toBeHidden();
});

test('disabling home restores stock home', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop');
  const auth = await request.post('/Users/AuthenticateByName', {
    headers: { Authorization: 'MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1"' },
    data: { Username: 'tide', Pw: 'tide' },
  });
  const token = (await auth.json()).AccessToken as string;
  const h = { Authorization: `MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1", Token="${token}"` };
  const id = '7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c';
  const cfg = await (await request.get(`/Plugins/${id}/Configuration`, { headers: h })).json();
  await request.post(`/Plugins/${id}/Configuration`, { headers: h, data: { ...cfg, EnableHome: false } });
  try {
    await page.goto('/web/');
    await page.waitForSelector('input[type=password]');
    await page.fill('input[type=text], #txtManualName', 'tide');
    await page.fill('input[type=password]', 'tide');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);
    await expect(page.locator('.tide-home')).toHaveCount(0);
    await expect(page.locator('body')).toHaveClass(/tide-theme/);
  } finally {
    await request.post(`/Plugins/${id}/Configuration`, { headers: h, data: { ...cfg, EnableHome: true } });
  }
});
```

- [ ] **Step 2: Run E2E**

Run: `cd e2e && npx playwright test`
Expected: all tests pass on both projects; skipped ones are reported as skipped.

- [ ] **Step 3: Commit**

```bash
git add e2e
git commit -m "test(e2e): cover home hero, rows, edit panel, phone layout and disable path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: CI, release packaging and plugin repository manifest

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `manifest.json`, `README.md`

**Interfaces:**
- Produces:
  - a GitHub Release asset `tide_<version>.zip` containing `Jellyfin.Plugin.Tide.dll` and `meta.json`
  - `manifest.json`, served raw from the default branch as the repository URL

- [ ] **Step 1: CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: '10.0.x' }
      - run: npm ci || npm install
        working-directory: web
      - run: npm run typecheck && npm test && npm run build
        working-directory: web
      - run: dotnet test Tide.slnx -c Release
```

- [ ] **Step 2: Release workflow**

`.github/workflows/release.yml`:
```yaml
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: '10.0.x' }
      - run: npm install && npm run build
        working-directory: web
      - name: Publish plugin
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          dotnet publish server/Jellyfin.Plugin.Tide -c Release -o out -p:AssemblyVersion=$VERSION.0 -p:FileVersion=$VERSION.0
          cat > out/meta.json <<EOF
          {"guid":"7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c","name":"Tide","description":"Streaming-app theme and home screen.","overview":"Streaming-app theme and home screen.","owner":"${GITHUB_REPOSITORY_OWNER}","category":"General","version":"$VERSION.0","targetAbi":"12.4.0.0","changelog":"See release notes","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","status":"Active","autoUpdate":true}
          EOF
          (cd out && zip ../tide_$VERSION.zip Jellyfin.Plugin.Tide.dll meta.json)
          echo "VERSION=$VERSION" >> $GITHUB_ENV
          echo "MD5=$(md5sum tide_$VERSION.zip | cut -d' ' -f1)" >> $GITHUB_ENV
      - uses: softprops/action-gh-release@v2
        with:
          files: tide_${{ env.VERSION }}.zip
      - name: Update manifest.json
        run: |
          python3 - <<'PY'
          import json, os, datetime
          v=os.environ['VERSION']; repo=os.environ['GITHUB_REPOSITORY']
          m=json.load(open('manifest.json'))
          entry={"version":f"{v}.0","changelog":f"v{v}","targetAbi":"12.4.0.0",
                 "sourceUrl":f"https://github.com/{repo}/releases/download/v{v}/tide_{v}.zip",
                 "checksum":os.environ['MD5'],"timestamp":datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}
          m[0]["versions"]=[e for e in m[0]["versions"] if e["version"]!=entry["version"]]
          m[0]["versions"].insert(0,entry)
          json.dump(m,open('manifest.json','w'),indent=2)
          PY
          git config user.name "github-actions"
          git config user.email "github-actions@users.noreply.github.com"
          git add manifest.json && git commit -m "chore: update manifest for v${VERSION}" && git push origin HEAD:main
```

- [ ] **Step 3: Manifest and README**

`manifest.json`:
```json
[
  {
    "guid": "7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c",
    "name": "Tide",
    "description": "Streaming-app theme and home screen for Jellyfin 12.4+.",
    "overview": "Streaming-app theme and home screen.",
    "owner": "silke",
    "category": "General",
    "versions": []
  }
]
```

`README.md`:
````markdown
# Tide

A streaming-app theme and home screen for Jellyfin 12.4+ (Modern web layout): a hero with trailers, rich poster cards with file-quality badges, and home rows each user can configure. Works in the browser, Jellyfin Desktop and the Android app.

## Install
1. Dashboard → Plugins → Repositories → **+** → URL: `https://raw.githubusercontent.com/<you>/tide/main/manifest.json`
2. Catalog → **Tide** → Install → restart Jellyfin.
3. Optional but recommended: also install **File Transformation**. Without it, Tide patches `jellyfin-web/index.html` directly, so the web folder must be writable by Jellyfin.

## Configure
Dashboard → Plugins → Tide: turn the theme, icons, home and trailers on or off; set hero length, the NEW window and the default row order.
Each user can reorder or hide rows with **Edit home** at the bottom of Home.

## Develop
```sh
e2e/fetch-media.sh && (cd e2e && docker compose up -d && npm i && npm run setup)
(cd web && npm i && npm run watch)          # rebuilds web/dist
./scripts/dotnet publish server/Jellyfin.Plugin.Tide -c Release -o e2e/plugins/Tide && (cd e2e && docker compose restart)
./scripts/dotnet test Tide.slnx && (cd web && npm test) && (cd e2e && npx playwright test)
```
````

- [ ] **Step 4: Verify locally**

Run: `./scripts/dotnet test Tide.slnx -c Release && (cd web && npm test) && python3 -c "import json;json.load(open('manifest.json'))" && echo OK`
Expected: tests pass and `OK` is printed.

- [ ] **Step 5: Commit**

```bash
git add .github manifest.json README.md
git commit -m "ci: add build/test workflow, tagged release packaging and plugin manifest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Release check on the user's server (read-only)**

Before the first tag, take desktop (1440 px) and phone (390 px) screenshots of the real home against `https://your-jellyfin.example`, logged in as the user, after they install the build manually. Share them for sign-off. Do not change anything on that server yourself.
````
