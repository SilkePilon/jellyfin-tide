# Tide Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the login spec (`docs/superpowers/specs/2026-11-12-tide-login-design.md`):
- the L3 poster-wall sign-in that drives the stock 12.4 sign-in pages;
- the profile picker;
- Switch profile from the avatar menu.

**Architecture:**
- **Pre-session module (`web/src/login/`):** starts at script start, before any session. On the login routes it fetches the new anonymous `GET /Tide/Login` (posters, server name, on/off), mounts a Tide screen over the hidden stock page, and drives the stock DOM for every action (`login/stockLogin.ts`).
- **Switch profile:** a signed-in feature (`login/switchProfile.ts`). It injects a menu item, verifies the new password on a throwaway device session, and hands the sign-in to the login screen through an in-memory pending switch (`login/pending.ts`).

**Tech Stack:**
- Web: TypeScript, Vite, vitest + jsdom.
- Server: C# .NET 10 Jellyfin 12.4 plugin, xUnit.
- End-to-end: Playwright against the local 12.4 container.

## Global Constraints

**Surfaces**
- Solid only. Card `#141416` with a `0 0 0 1px #2a2a2e` ring and shadow `0 40px 100px rgba(0,0,0,.8)`.
- Fields `#1c1c1e` with a `#2a2a2e` ring (focus: 2 px white). Primary button white with black text; secondary `#2a2a2e`.
- No blur or see-through panels.

**Motion**
- Transform and opacity only, curve `cubic-bezier(.22,1,.36,1)`.
- `prefers-reduced-motion`: the wall is static and nothing slides.

**Tokens**
- Tide's `body.tide` tokens do not exist before sign-in. Login CSS uses literal colours.
- Font: `'Inter Variable', Inter, system-ui, sans-serif`. Inter is bundled and always loaded.

**Icons**
- New Material Symbols names must be in the subset: run `node scripts/icons.mjs` from `web/` and commit `src/theme/fonts/tide-symbols.{woff2,json}`.
- `iconFont.test.ts` fails otherwise. If Google Fonts is unreachable, stop and report BLOCKED.

**Rules**
- `[hidden]` wins over a component's own `display`. Invisible layers get `pointer-events: none`.
- **jellyfin-web performs every sign-in:** Tide only fills and clicks the stock pages.
- **Passwords are never stored.** Only in memory, at most 60 s (pending switch).

**Probed 12.4 facts**
- **Visible stock pages:** cached views duplicate ids, so always query the visible one: `#loginPage:not(.hide)`, `#forgotPasswordPage:not(.hide)`, `.forgotPasswordPinPage:not(.hide)`.
- **Login page:**
  - `.visualLoginForm #divUsers .card` contains `.cardContent[data-username][data-userid]`.
  - `form.manualLoginForm` (hidden while profiles show) contains `#txtManualName`, `#txtManualPassword` and `.chkRememberLogin` (checked by default). Submitting the form signs in regardless of its visibility.
  - Buttons: `.btnManual`, `.btnQuick`, `.btnForgotPassword`, `.btnSelectServer` (has `.hide` unless several servers). Disclaimer: `.loginDisclaimer`.
- **Wrong credentials:** `.toast.toastVisible` with "Invalid username or password. Please try again." Success navigates away from `#/login`.
- **Quick Connect:** `.btnQuick` opens `#quickConnectAlert` (`.text` "Enter code 422478 to login"). It polls and signs in by itself, and adds `history.state.usr.dialogs`. Escape does not close it; `history.back()` does.
- **Forgot password:**
  - `#forgotPasswordPage` has `#txtName` and `#btnSubmit` (a submit button).
  - The answer is an alert dialog (last `.dialogContainer .dialog`) reading "The following file has been created on your server and contains instructions on how to proceed Enter PIN here to finish Password reset /config/passwordreset….json" with a "Got It" button.
  - "Got It" leads to `#/forgotpasswordpin`: `.forgotPasswordPinPage` with `#txtPin` and a `button[type=submit]`.
- **User menu:**
  - Top-bar `button[aria-controls="app-user-menu"]` opens `#app-user-menu [role="menu"]`.
  - Items: `a` Profile (`#/userprofile?...`), Settings, Dashboard, Metadata Manager, Quick Connect (`#/quickconnect`), then an `li` Sign Out containing `svg[data-testid="LogoutIcon"]`.
- **Passwords:** `/Users/Public` users always have `HasPassword: true` in 12.x, so there are no lock icons and a password step always follows. An empty password is valid.
- **Same device id:** re-authenticating with the same DeviceId revokes that device's earlier token. Verification must use its own device id.
- **Server APIs:** `BaseItem.InheritedParentalRatingValue` (`int?`) and `IServerApplicationHost.FriendlyName` exist in the 12.4 assemblies.

**Local test data:** test profiles `mila` (password `mila`) and `noah` (no password) are visible on the login screen. `tide`/`tide` is hidden (manual sign-in).

**Commands**

| Purpose | Command |
|---|---|
| Web tests | `cd web && npx vitest run` |
| Typecheck | `cd web && npx tsc --noEmit -p .` |
| Server tests | `./scripts/dotnet test server/Jellyfin.Plugin.Tide.Tests` (repo root) |
| Deploy locally | `(cd web && npm run build) && ./scripts/dotnet publish server/Jellyfin.Plugin.Tide -c Release -o e2e/plugins/Tide && (cd e2e && docker compose up -d --force-recreate)`, then wait for `curl -sf localhost:8096/System/Info/Public` |
| End-to-end | `cd e2e && npx playwright test [file] [-g name]` |

**Commits:** end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work happens on branch `feat/login`. Never write the private server name or API key into repo files.

---

### Task 1: Server, anonymous `/Tide/Login` with posters

**Files:**
- Create:
  - `server/Jellyfin.Plugin.Tide/Login/LoginPosters.cs`
  - `server/Jellyfin.Plugin.Tide/Login/LoginService.cs`
  - `server/Jellyfin.Plugin.Tide/Api/LoginController.cs`
  - `server/Jellyfin.Plugin.Tide.Tests/LoginPostersTests.cs`
- Modify:
  - `server/Jellyfin.Plugin.Tide/Models/Dtos.cs`
  - `server/Jellyfin.Plugin.Tide/Configuration/PluginConfiguration.cs`
  - `server/Jellyfin.Plugin.Tide/Configuration/configPage.html`
  - `server/Jellyfin.Plugin.Tide/PluginServiceRegistrator.cs`
  - `server/Jellyfin.Plugin.Tide/Api/TideController.cs`
  - `server/Jellyfin.Plugin.Tide.Tests/TideControllerTests.cs`
  - `web/src/types.ts`

**Interfaces:**
- Produces HTTP: `GET /Tide/Login` (anonymous) returns `{ "enabled": bool, "serverName": string|null, "posters": [{ "id": "<guid N>", "tag": "<image tag>" }] }`.
- Produces: `ClientConfig.enableLogin` (JSON). TS type: `enableLogin?: boolean`.

- [ ] **Step 1: Write the failing tests**

`server/Jellyfin.Plugin.Tide.Tests/LoginPostersTests.cs`:
```csharp
using Jellyfin.Plugin.Tide.Login;
using Jellyfin.Plugin.Tide.Models;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class LoginPostersTests
{
    private static PosterCandidate C(int n, string? tag = "t", int? rating = null) =>
        new(new Guid($"00000000-0000-0000-0000-{n:D12}"), tag, rating);

    [Fact]
    public void SkipsAdultRatingsAndItemsWithoutAPoster()
    {
        var r = LoginPosters.Pick(new[] { C(1), C(2, rating: 18), C(3, tag: null), C(4, rating: 17), C(5, rating: 21), C(6, tag: "") }, 10);
        Assert.Equal(new[] { C(1).Id.ToString("N"), C(4).Id.ToString("N") }, r.Select(p => p.Id));
        Assert.All(r, p => Assert.Equal("t", p.Tag));
    }

    [Fact]
    public void RespectsTheLimitAndDropsDuplicates()
    {
        var r = LoginPosters.Pick(new[] { C(1), C(1), C(2), C(3), C(4) }, 3);
        Assert.Equal(new[] { C(1).Id.ToString("N"), C(2).Id.ToString("N"), C(3).Id.ToString("N") }, r.Select(p => p.Id));
    }

    [Fact]
    public void DisabledConfigCarriesNothing()
    {
        var d = LoginConfigDto.Disabled;
        Assert.False(d.Enabled);
        Assert.Null(d.ServerName);
        Assert.Empty(d.Posters);
    }
}
```

Append to the `TideControllerTests` class, before its closing brace:
```csharp
    [Fact]
    public void ClientConfigCarriesEnableLogin()
    {
        using var on = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(new PluginConfiguration(), "0.6.0")));
        Assert.True(on.RootElement.GetProperty("enableLogin").GetBoolean());
        using var off = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(new PluginConfiguration { EnableLogin = false }, "0.6.0")));
        Assert.False(off.RootElement.GetProperty("enableLogin").GetBoolean());
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `./scripts/dotnet test server/Jellyfin.Plugin.Tide.Tests`

Expected: build errors (`LoginPosters`, `PosterCandidate`, `LoginConfigDto` and `EnableLogin` are missing).

- [ ] **Step 3: Implement**

`server/Jellyfin.Plugin.Tide/Login/LoginPosters.cs`:
```csharp
using Jellyfin.Plugin.Tide.Models;

namespace Jellyfin.Plugin.Tide.Login;

/// <summary>A library item that could appear on the login poster wall.</summary>
public sealed record PosterCandidate(Guid Id, string? Tag, int? ParentalRating);

/// <summary>Which posters the public login page may show (spec: no adult titles, poster required, no metadata).</summary>
public static class LoginPosters
{
    /// <summary>Inherited parental rating value from which an item counts as adult-only.</summary>
    public const int AdultRating = 18;

    public static LoginPosterDto[] Pick(IEnumerable<PosterCandidate> candidates, int limit) =>
        candidates
            .Where(c => !string.IsNullOrEmpty(c.Tag) && (c.ParentalRating is null || c.ParentalRating < AdultRating))
            .DistinctBy(c => c.Id)
            .Take(limit)
            .Select(c => new LoginPosterDto(c.Id.ToString("N"), c.Tag!))
            .ToArray();
}
```

`server/Jellyfin.Plugin.Tide/Login/LoginService.cs`:
```csharp
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.Tide.Models;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Drawing;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;

namespace Jellyfin.Plugin.Tide.Login;

/// <summary>Data for the anonymous login page: server name and a cached random set of posters.</summary>
public sealed class LoginService
{
    public const int PosterCount = 40;
    public static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(30);

    private readonly ILibraryManager _library;
    private readonly IImageProcessor _images;
    private readonly IServerApplicationHost _host;
    private readonly object _lock = new();
    private (DateTime At, LoginPosterDto[] Posters)? _cache;

    public LoginService(ILibraryManager library, IImageProcessor images, IServerApplicationHost host)
    {
        _library = library;
        _images = images;
        _host = host;
    }

    public LoginConfigDto Build(bool enabled) =>
        enabled ? new LoginConfigDto(true, _host.FriendlyName, Posters()) : LoginConfigDto.Disabled;

    private LoginPosterDto[] Posters()
    {
        lock (_lock)
        {
            if (_cache is { } c && DateTime.UtcNow - c.At < CacheFor)
            {
                return c.Posters;
            }

            var items = _library.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                Recursive = true,
                IsVirtualItem = false,
                ImageTypes = new[] { ImageType.Primary },
                OrderBy = new[] { (ItemSortBy.Random, SortOrder.Ascending) },
                Limit = PosterCount * 2,
            });
            var posters = LoginPosters.Pick(items.Select(i => new PosterCandidate(i.Id, Tag(i), i.InheritedParentalRatingValue)), PosterCount);
            _cache = (DateTime.UtcNow, posters);
            return posters;
        }
    }

    private string? Tag(BaseItem item)
    {
        var info = item.GetImageInfo(ImageType.Primary, 0);
        if (info is null)
        {
            return null;
        }

        try
        {
            return _images.GetImageCacheTag(item, info);
        }
        catch (Exception)
        {
            return null;
        }
    }
}
```
If `SortOrder` is ambiguous, `HeroService.cs` shows the working usings (`Jellyfin.Database.Implementations.Enums` / `MediaBrowser.Model.Entities`). Copy them.

`server/Jellyfin.Plugin.Tide/Api/LoginController.cs`:
```csharp
using Jellyfin.Plugin.Tide.Login;
using Jellyfin.Plugin.Tide.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Tide.Api;

/// <summary>Anonymous: the login page runs before anyone is signed in.</summary>
[ApiController]
[Route("Tide")]
[AllowAnonymous]
public class LoginController : ControllerBase
{
    private readonly LoginService _login;

    public LoginController(LoginService login)
    {
        _login = login;
    }

    [HttpGet("Login")]
    public ActionResult<LoginConfigDto> GetLogin() => _login.Build(Plugin.Instance!.Configuration.EnableLogin);
}
```

In `Models/Dtos.cs`:
1. Append `[property: JsonPropertyName("enableLogin")] bool EnableLogin` as the last `ClientConfig` parameter, after `EnableSearch`.
2. Add:
```csharp
public sealed record LoginPosterDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("tag")] string Tag);

public sealed record LoginConfigDto(
    [property: JsonPropertyName("enabled")] bool Enabled,
    [property: JsonPropertyName("serverName")] string? ServerName,
    [property: JsonPropertyName("posters")] LoginPosterDto[] Posters)
{
    public static LoginConfigDto Disabled { get; } = new(false, null, Array.Empty<LoginPosterDto>());
}
```

Other server files:
- **`PluginConfiguration.cs`:** after `EnableSearch`, add `public bool EnableLogin { get; set; } = true;`.
- **`TideController.BuildClientConfig`:** pass `cfg.EnableLogin` as the last argument.
- **`PluginServiceRegistrator`:** add `services.AddSingleton<Login.LoginService>();`.
- **`configPage.html`:**
  - after the EnableSearch label add `<label class="checkboxContainer"><input is="emby-checkbox" type="checkbox" id="EnableLogin"><span>Tide login screen</span></label>`;
  - add `'EnableLogin'` to `bools`.

In `web/src/types.ts` (`ClientConfig`), after `enableSearch`:
```ts
  /** 0.6.0+. Missing (older server) means on. */
  enableLogin?: boolean;
```

- [ ] **Step 4: Run the tests**

Run: `./scripts/dotnet test server/Jellyfin.Plugin.Tide.Tests && (cd web && npx tsc --noEmit -p .)`

Expected: all pass (86 plus 4 new).

Then deploy, and check `curl -s localhost:8096/Tide/Login | head -c 300`. Expected: `{"enabled":true,"serverName":"…","posters":[{"id":"…","tag":"…"}…` with no token.

- [ ] **Step 5: Commit**

```bash
git add server web/src/types.ts
git commit -m "feat(server): anonymous /Tide/Login with login posters and EnableLogin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Stock sign-in driver

**Files:**
- Create: `web/src/login/stockLogin.ts`, `web/test/stockLogin.test.ts`

**Interfaces:**
- Produces: `LOGIN_TIMEOUT_MS = 15_000`; `SignInResult = { ok: true } | { ok: false; error: string }`
- Produces: `loginPage(): HTMLElement | null`; `newestDialog(): HTMLElement | null`; `dialogMessage(d: Element): string`
- Produces: `signIn(name: string, password: string, remember: boolean, timeoutMs?: number): Promise<SignInResult>`
- Produces: `startQuickConnect(timeoutMs?: number): Promise<string | null>` (the 6-digit code); `cancelQuickConnect(): void`
- Produces: `forgotPassword(name: string, timeoutMs?: number): Promise<{ message: string; pin: boolean }>`
- Produces: `submitPin(pin: string, timeoutMs?: number): Promise<{ message: string; done: boolean }>`; `backToLogin(): void`
- Produces: `disclaimer(): string`; `canSelectServer(): boolean`; `selectServer(): void`

- [ ] **Step 1: Write the failing tests**

`web/test/stockLogin.test.ts`:
```ts
import * as stock from '../src/login/stockLogin';

/** Fake of the probed stock 12.4 login pages (two cached #loginPage views: only the visible one counts). */
function fakeLogin(opts: { password?: string } = {}) {
  location.hash = '#/login?serverid=x';
  document.body.innerHTML = `
    <div id="loginPage" class="page hide"><form class="manualLoginForm"><input id="txtManualName"><input id="txtManualPassword"></form></div>
    <div id="loginPage" class="page">
      <form class="manualLoginForm hide"><input id="txtManualName"><input id="txtManualPassword" type="password">
        <input type="checkbox" class="chkRememberLogin" checked><button type="submit">Sign In</button></form>
      <button class="btnQuick">Use Quick Connect</button><button class="btnForgotPassword">Forgot Password</button>
      <button class="btnSelectServer hide">Change Server</button><div class="loginDisclaimer"> Be nice. </div>
    </div><div class="dialogContainer"></div>`;
  const page = document.querySelectorAll<HTMLElement>('#loginPage')[1]!;
  const submitted: { name: string; pw: string; remember: boolean }[] = [];
  page.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (page.querySelector('#txtManualName') as HTMLInputElement).value;
    const pw = (page.querySelector('#txtManualPassword') as HTMLInputElement).value;
    submitted.push({ name, pw, remember: (page.querySelector('.chkRememberLogin') as HTMLInputElement).checked });
    setTimeout(() => {
      if (opts.password === undefined || pw === opts.password) location.hash = '#/home';
      else document.body.insertAdjacentHTML('beforeend', '<div class="toast toastVisible">Invalid username or password. Please try again.</div>');
    }, 20);
  });
  return { page, submitted };
}
const dialog = (id: string, text: string, button = 'Got It', onClick?: () => void) => {
  const d = document.createElement('div');
  d.className = 'dialog opened';
  if (id) d.id = id;
  d.innerHTML = `<div class="formDialogHeader"><h1>Title</h1></div><div class="formDialogContent"><div class="text">${text}</div></div><button>${button}</button>`;
  d.querySelector('button')!.addEventListener('click', () => { d.remove(); onClick?.(); });
  document.querySelector('.dialogContainer')!.append(d);
  return d;
};
afterEach(() => { document.body.innerHTML = ''; location.hash = ''; });

test('signIn fills the visible stock form, mirrors "remember", and resolves ok when the page navigates', async () => {
  const f = fakeLogin({ password: 'mila' });
  const r = await stock.signIn('mila', 'mila', false, 2000);
  expect(r).toEqual({ ok: true });
  expect(f.submitted).toEqual([{ name: 'mila', pw: 'mila', remember: false }]);
});

test('signIn returns the stock toast text as the error; a hung server times out', async () => {
  fakeLogin({ password: 'mila' });
  const r = await stock.signIn('mila', 'nope', true, 2000);
  expect(r).toEqual({ ok: false, error: 'Invalid username or password. Please try again.' });
  const page = document.querySelectorAll<HTMLElement>('#loginPage')[1]!;
  const form = page.querySelector('form')!;
  const hung = form.cloneNode(true) as HTMLFormElement;
  hung.addEventListener('submit', (e) => e.preventDefault());
  form.replaceWith(hung);
  expect(await stock.signIn('mila', 'mila', true, 150)).toEqual({ ok: false, error: 'Couldn’t reach the server. Try again.' });
});

test('quick connect: reads the code from the stock dialog; cancel uses the dialog history entry', async () => {
  const { page } = fakeLogin();
  page.querySelector('.btnQuick')!.addEventListener('click', () => {
    history.pushState({ usr: { dialogs: ['d1'] } }, '');
    const d = dialog('quickConnectAlert', 'Enter code 422478 to login', 'Cancel');
    window.addEventListener('popstate', () => d.remove(), { once: true });
  });
  expect(await stock.startQuickConnect(1000)).toBe('422478');
  stock.cancelQuickConnect();
  await new Promise((r) => setTimeout(r, 30));
  expect(document.querySelector('#quickConnectAlert')).toBeNull();
});

test('forgot password: submits the name, returns the alert text, PIN step submits the PIN', async () => {
  const { page } = fakeLogin();
  page.querySelector('.btnForgotPassword')!.addEventListener('click', () => {
    location.hash = '#/forgotpassword';
    document.body.insertAdjacentHTML('beforeend', '<div id="forgotPasswordPage" class="page"><form><input id="txtName"><button id="btnSubmit" type="submit">Submit</button></form></div>');
    document.querySelector('#forgotPasswordPage form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      dialog('', 'The following file has been created on your server and contains instructions on how to proceed Enter PIN here to finish Password reset /config/x.json', 'Got It', () => {
        location.hash = '#/forgotpasswordpin';
        document.body.insertAdjacentHTML('beforeend', '<div class="page forgotPasswordPinPage"><form><input id="txtPin"><button type="submit">Submit</button></form></div>');
        document.querySelector('.forgotPasswordPinPage form')!.addEventListener('submit', (ev) => {
          ev.preventDefault();
          dialog('', 'Invalid PIN', 'Got It');
        });
      });
    });
  });
  const r = await stock.forgotPassword('mila', 1000);
  expect(r.pin).toBe(true);
  expect(r.message).toContain('created on your server');
  expect(r.message).not.toContain('Got It');
  expect((document.querySelector('#txtName') as HTMLInputElement).value).toBe('mila');
  const p = await stock.submitPin('1234', 1000);
  expect(p).toEqual({ message: 'Invalid PIN', done: false });
});

test('disclaimer and server switch come from the stock page', () => {
  fakeLogin();
  expect(stock.disclaimer()).toBe('Be nice.');
  expect(stock.canSelectServer()).toBe(false);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run test/stockLogin.test.ts`

Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement**

`web/src/login/stockLogin.ts`:
```ts
/**
 * Drives the stock 12.4 sign-in pages (which stay in the DOM, hidden under Tide's login screen). jellyfin-web keeps
 * doing the real work: credentials, server selection, Quick Connect polling, password reset.
 * Probed markup: docs/superpowers/plans/2026-11-12-tide-login.md (Global Constraints).
 */
export const LOGIN_TIMEOUT_MS = 15_000;
export type SignInResult = { ok: true } | { ok: false; error: string };

const visible = (sel: string) => document.querySelector<HTMLElement>(`${sel}:not(.hide)`);
export const loginPage = (): HTMLElement | null => visible('#loginPage');
const onLogin = () => /^#\/login(\?|$)/.test(location.hash);

function waitFor<T>(find: () => T | null | undefined | false, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const v = find();
      if (v) { resolve(v); return; }
      if (Date.now() - t0 > ms) { reject(new Error('stock login timeout')); return; }
      setTimeout(tick, 25);
    };
    tick();
  });
}

const setValue = (el: HTMLInputElement | null, v: string) => {
  if (!el) return;
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const submit = (form: HTMLFormElement) => {
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.querySelector<HTMLElement>('[type="submit"]')?.click();
};

export function newestDialog(): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>('.dialogContainer .dialog');
  return all[all.length - 1] ?? null;
}
export function dialogMessage(d: Element): string {
  const body = d.querySelector('.formDialogContent') ?? d.querySelector('.text') ?? d;
  return (body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
const newDialog = (before: Element | null) => () => { const d = newestDialog(); return d && d !== before ? d : null; };

export async function signIn(name: string, password: string, remember: boolean, timeoutMs = LOGIN_TIMEOUT_MS): Promise<SignInResult> {
  const page = await waitFor(loginPage, 5000).catch(() => null);
  const form = page?.querySelector<HTMLFormElement>('form.manualLoginForm');
  if (!page || !form) return { ok: false, error: 'The sign-in page isn’t ready. Try again.' };
  setValue(page.querySelector('#txtManualName'), name);
  setValue(page.querySelector('#txtManualPassword'), password);
  const rem = page.querySelector<HTMLInputElement>('.chkRememberLogin');
  if (rem && rem.checked !== remember) rem.click();
  const before = new Set(document.querySelectorAll('.toast'));
  submit(form);
  try {
    return await waitFor<SignInResult>(() => {
      if (!onLogin()) return { ok: true };
      const t = [...document.querySelectorAll<HTMLElement>('.toast.toastVisible')].find((x) => !before.has(x) && x.textContent?.trim());
      return t ? { ok: false, error: t.textContent!.trim() } : null;
    }, timeoutMs);
  } catch {
    return { ok: false, error: 'Couldn’t reach the server. Try again.' };
  }
}

export async function startQuickConnect(timeoutMs = 4000): Promise<string | null> {
  loginPage()?.querySelector<HTMLElement>('.btnQuick')?.click();
  const dlg = await waitFor(() => document.querySelector('#quickConnectAlert'), timeoutMs).catch(() => null);
  return dlg?.textContent?.match(/\b(\d{6})\b/)?.[1] ?? null;
}

/** Close the stock Quick Connect dialog through the history entry it added (never leaves the login page). */
export function cancelQuickConnect(): void {
  const usr = (history.state as { usr?: { dialogs?: unknown[] } | null } | null)?.usr;
  if (document.querySelector('#quickConnectAlert') && usr?.dialogs?.length) history.back();
}

export async function forgotPassword(name: string, timeoutMs = 8000): Promise<{ message: string; pin: boolean }> {
  loginPage()?.querySelector<HTMLElement>('.btnForgotPassword')?.click();
  const page = await waitFor(() => visible('#forgotPasswordPage'), 3000);
  setValue(page.querySelector('#txtName'), name);
  const before = newestDialog();
  const form = page.querySelector<HTMLFormElement>('form');
  if (form) submit(form);
  const dlg = await waitFor(newDialog(before), timeoutMs);
  const message = dialogMessage(dlg);
  dlg.querySelector<HTMLElement>('button')?.click();
  return { message, pin: /\bPIN\b/.test(message) };
}

export async function submitPin(pin: string, timeoutMs = 8000): Promise<{ message: string; done: boolean }> {
  const page = await waitFor(() => visible('.forgotPasswordPinPage'), 3000);
  setValue(page.querySelector('#txtPin'), pin);
  const before = newestDialog();
  const form = page.querySelector<HTMLFormElement>('form');
  if (form) submit(form);
  const dlg = await waitFor(newDialog(before), timeoutMs).catch(() => null);
  const message = dlg ? dialogMessage(dlg) : '';
  dlg?.querySelector<HTMLElement>('button')?.click();
  await new Promise((r) => setTimeout(r, 300));
  return { message, done: onLogin() };
}

export function backToLogin(): void {
  if (!onLogin()) location.hash = '#/login';
}

export const disclaimer = (): string => (loginPage()?.querySelector('.loginDisclaimer')?.textContent ?? '').trim();
export const canSelectServer = (): boolean => !!loginPage()?.querySelector('.btnSelectServer:not(.hide)');
export const selectServer = (): void => { loginPage()?.querySelector<HTMLElement>('.btnSelectServer')?.click(); };
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run test/stockLogin.test.ts && npx tsc --noEmit -p .`

Expected: 5 passed, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/login/stockLogin.ts web/test/stockLogin.test.ts
git commit -m "feat(login): driver for the stock 12.4 sign-in pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Login screen (L3)

**Files:**
- Create: `web/src/login/api.ts`, `web/src/login/pending.ts`, `web/src/login/screen.ts`, `web/src/login/login.css`, `web/test/loginScreen.test.ts`
- Modify: `web/src/api/client.ts` (export `serverBase`); icon subset

**Interfaces:**
- Consumes: Task 2's driver.
- Produces (`api.ts`):
  - `LoginConfig { enabled: boolean; serverName: string | null; posters: { id: string; tag: string }[] }` and `PublicUser { Id: string; Name: string; PrimaryImageTag?: string | null }`
  - `fetchLoginConfig(): Promise<LoginConfig | null>` (sessionStorage `tide:login-config`)
  - `publicUsers(): Promise<PublicUser[]>`; `quickConnectEnabled(): Promise<boolean>`
  - `posterUrl(p, w?)`; `userImageUrl(u, w?)`
- Produces (`pending.ts`): `PendingSwitch { name: string; password: string; remember: boolean; at: number }`; `setPendingSwitch(p, now?)`; `takePendingSwitch(now?)`; `PENDING_MS = 60_000`
- Produces (`screen.ts`):
  - `LoginState = 'profiles' | 'password' | 'manual' | 'qc' | 'forgot' | 'pin' | 'switching'`
  - `LoginDeps { config; users; quickConnect: boolean; stock: StockApi; pending: PendingSwitch | null }`, where `StockApi = typeof import('./stockLogin')`
  - `LoginScreen { el; state(): LoginState; route(hash: string): void; destroy(): void }` and `createLoginScreen(d)`
  - Shared with Task 5: `avatar(u, size)`, `avatarColor(name)`, `credentialsForm(o: CredentialsOpts)`, `CredentialsOpts`
- DOM:
  - root `.tide-lg`, wall `.tide-lg-wall` (tiles `i`), brand `.tide-lg-brand`, card `.tide-lg-card[data-state]`;
  - profiles `[data-user=<id>]`, `[data-lg="other"]`, `[data-lg="qc"]`;
  - form inputs `input[name=username|password]`, error `.tide-lg-err`;
  - `[data-lg="forgot"]`, `[data-lg="back"]`, code boxes `.tide-lg-code b`.

- [ ] **Step 1: Write the failing tests**

`web/test/loginScreen.test.ts`:
```ts
import { avatarColor, createLoginScreen } from '../src/login/screen';
import { setPendingSwitch, takePendingSwitch, PENDING_MS } from '../src/login/pending';

const USERS = [{ Id: 'u1', Name: 'mila' }, { Id: 'u2', Name: 'noah', PrimaryImageTag: 'tg' }];
const CFG = { enabled: true, serverName: 'Home Media', posters: [{ id: 'p1', tag: 't1' }, { id: 'p2', tag: 't2' }] };
function fakeStock(over: Record<string, unknown> = {}) {
  return {
    signIn: vi.fn(async (_n: string, pw: string) => (pw === 'mila' || pw === '' ? { ok: true } : { ok: false, error: 'Invalid username or password. Please try again.' })),
    startQuickConnect: vi.fn(async () => '422478'), cancelQuickConnect: vi.fn(),
    forgotPassword: vi.fn(async () => ({ message: 'The following file has been created on your server … Enter PIN here', pin: true })),
    submitPin: vi.fn(async () => ({ message: 'Invalid PIN', done: false })), backToLogin: vi.fn(),
    disclaimer: () => 'Be nice.', canSelectServer: () => false, selectServer: vi.fn(),
    ...over,
  } as any;
}
const make = (over: Partial<Parameters<typeof createLoginScreen>[0]> = {}) => {
  const stock = fakeStock();
  const s = createLoginScreen({ config: CFG, users: USERS, quickConnect: true, stock, pending: null, ...over });
  document.body.append(s.el);
  return { s, stock };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf' }; });
afterEach(() => { document.body.innerHTML = ''; });

test('profiles over the poster wall; brand shows the server name; avatar image or initial on a stable colour', () => {
  const { s } = make();
  expect(s.state()).toBe('profiles');
  expect(s.el.querySelectorAll('.tide-lg-wall i').length).toBeGreaterThanOrEqual(2);
  expect(s.el.querySelector('.tide-lg-wall i')!.getAttribute('style')).toContain('/Items/p1/Images/Primary');
  expect(s.el.querySelector('.tide-lg-brand')!.textContent).toContain('Home Media');
  const mila = s.el.querySelector('[data-user="u1"] .tide-lg-av') as HTMLElement;
  expect(mila.textContent).toBe('M');
  expect(avatarColor('mila')).toBe(avatarColor('mila'));
  expect((s.el.querySelector('[data-user="u2"] .tide-lg-av') as HTMLElement).style.backgroundImage).toContain('/Users/u2/Images/Primary');
  expect(s.el.querySelector('[data-lg="qc"]')).not.toBeNull();
  expect(s.el.querySelector('.tide-lg-disc')?.textContent).toBe('Be nice.');
});

test('pick a profile, wrong password shows the stock error inline, right password signs in', async () => {
  const { s, stock } = make();
  (s.el.querySelector('[data-user="u1"]') as HTMLElement).click();
  expect(s.state()).toBe('password');
  const pw = s.el.querySelector<HTMLInputElement>('input[name="password"]')!;
  pw.value = 'nope';
  s.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush(); await flush();
  expect(stock.signIn).toHaveBeenCalledWith('mila', 'nope', true);
  expect(s.el.querySelector('.tide-lg-err')!.textContent).toContain('Invalid username or password');
  expect((s.el.querySelector('.tide-lg-err') as HTMLElement).hidden).toBe(false);
  pw.value = 'mila';
  s.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(stock.signIn).toHaveBeenLastCalledWith('mila', 'mila', true);
  (s.el.querySelector('[data-lg="back"]') as HTMLElement).click();
  expect(s.state()).toBe('profiles');
});

test('other user / no public users: manual form with user name', async () => {
  const { s, stock } = make({ users: [] });
  expect(s.state()).toBe('manual');
  expect(s.el.querySelector('[data-lg="back"]')).toBeNull(); // no profiles to go back to
  s.el.querySelector<HTMLInputElement>('input[name="username"]')!.value = 'tide';
  s.el.querySelector<HTMLInputElement>('input[name="password"]')!.value = 'mila';
  s.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(stock.signIn).toHaveBeenCalledWith('tide', 'mila', true);
});

test('quick connect shows the code in six boxes; back cancels the stock dialog', async () => {
  const { s, stock } = make();
  (s.el.querySelector('[data-lg="qc"]') as HTMLElement).click();
  await flush(); await flush();
  expect(s.state()).toBe('qc');
  expect([...s.el.querySelectorAll('.tide-lg-code b')].map((b) => b.textContent).join('')).toBe('422478');
  (s.el.querySelector('[data-lg="back"]') as HTMLElement).click();
  expect(stock.cancelQuickConnect).toHaveBeenCalled();
  expect(s.state()).toBe('profiles');
});

test('forgot password: message in the card, then the PIN step', async () => {
  const { s, stock } = make();
  (s.el.querySelector('[data-user="u1"]') as HTMLElement).click();
  (s.el.querySelector('[data-lg="forgot"]') as HTMLElement).click();
  expect(s.state()).toBe('forgot');
  expect(s.el.querySelector<HTMLInputElement>('input[name="username"]')!.value).toBe('mila');
  s.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush(); await flush();
  expect(stock.forgotPassword).toHaveBeenCalledWith('mila');
  expect(s.state()).toBe('pin');
  expect(s.el.querySelector('.tide-lg-msg')!.textContent).toContain('created on your server');
  s.el.querySelector<HTMLInputElement>('input[name="pin"]')!.value = '1234';
  s.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush(); await flush();
  expect(stock.submitPin).toHaveBeenCalledWith('1234');
  expect(s.el.querySelector('.tide-lg-err')!.textContent).toContain('Invalid PIN');
});

test('a pending profile switch signs in at once ("Signing in as …")', async () => {
  const { s, stock } = make({ pending: { name: 'mila', password: 'mila', remember: true, at: Date.now() } });
  expect(s.state()).toBe('switching');
  expect(s.el.textContent).toContain('Signing in as mila');
  await flush();
  expect(stock.signIn).toHaveBeenCalledWith('mila', 'mila', true);
});

test('pending switch is taken once and expires', () => {
  setPendingSwitch({ name: 'a', password: 'b', remember: true }, 1000);
  expect(takePendingSwitch(1000 + PENDING_MS - 1)?.name).toBe('a');
  expect(takePendingSwitch(1000)).toBeNull();
  setPendingSwitch({ name: 'a', password: 'b', remember: true }, 1000);
  expect(takePendingSwitch(1000 + PENDING_MS + 1)).toBeNull();
});

test('arrow keys move between profiles', () => {
  const { s } = make();
  const first = s.el.querySelector<HTMLElement>('[data-user="u1"]')!;
  first.focus();
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(document.activeElement).toBe(s.el.querySelector('[data-user="u2"]'));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run test/loginScreen.test.ts`

Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Implement**

In `web/src/api/client.ts`, below `anySession()`, add:
```ts
/** The Jellyfin server base before anyone is signed in (login page): Tide's script URL, else jellyfin-web's ApiClient. */
export function serverBase(): string {
  return (scriptServer ?? jfApiClient()?.serverAddress?.() ?? location.origin).replace(/\/$/, '');
}
```

`web/src/login/api.ts`:
```ts
import { serverBase } from '../api/client';

export interface LoginPoster { id: string; tag: string }
export interface LoginConfig { enabled: boolean; serverName: string | null; posters: LoginPoster[] }
export interface PublicUser { Id: string; Name: string; PrimaryImageTag?: string | null }
const CACHE = 'tide:login-config';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${serverBase()}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
  return (await r.json()) as T;
}

/** Anonymous Tide login data; cached for the tab (the posters stay the same while you sign in and out). */
export async function fetchLoginConfig(): Promise<LoginConfig | null> {
  try { const c = sessionStorage.getItem(CACHE); if (c) return JSON.parse(c) as LoginConfig; } catch { /* storage blocked */ }
  try {
    const c = await get<LoginConfig>('/Tide/Login');
    try { sessionStorage.setItem(CACHE, JSON.stringify(c)); } catch { /* storage blocked */ }
    return c;
  } catch {
    return null;
  }
}
export const publicUsers = (): Promise<PublicUser[]> => get<PublicUser[]>('/Users/Public').catch(() => []);
export const quickConnectEnabled = (): Promise<boolean> => get<boolean>('/QuickConnect/Enabled').catch(() => false);
export const posterUrl = (p: LoginPoster, w = 300): string =>
  `${serverBase()}/Items/${p.id}/Images/Primary?maxWidth=${w}&quality=80&tag=${encodeURIComponent(p.tag)}`;
export const userImageUrl = (u: Pick<PublicUser, 'Id' | 'PrimaryImageTag'>, w = 200): string | null =>
  u.PrimaryImageTag ? `${serverBase()}/Users/${u.Id}/Images/Primary?maxWidth=${w}&quality=90&tag=${encodeURIComponent(u.PrimaryImageTag)}` : null;
```

`web/src/login/pending.ts`:
```ts
/** A profile switch in progress: kept in memory only (never stored), consumed once by the login screen. */
export interface PendingSwitch { name: string; password: string; remember: boolean; at: number }
export const PENDING_MS = 60_000;
let pending: PendingSwitch | null = null;

export function setPendingSwitch(p: Omit<PendingSwitch, 'at'>, now = Date.now()): void { pending = { ...p, at: now }; }
export function takePendingSwitch(now = Date.now()): PendingSwitch | null {
  const p = pending;
  pending = null;
  return p && now - p.at < PENDING_MS ? p : null;
}
```

`web/src/login/screen.ts`:
```ts
import './login.css';
import { h, icon } from '../ui/dom';
import { posterUrl, userImageUrl, type LoginConfig, type PublicUser } from './api';
import type { PendingSwitch } from './pending';

export type StockApi = typeof import('./stockLogin');
export type LoginState = 'profiles' | 'password' | 'manual' | 'qc' | 'forgot' | 'pin' | 'switching';
export interface LoginDeps { config: LoginConfig; users: PublicUser[]; quickConnect: boolean; stock: StockApi; pending: PendingSwitch | null }
export interface LoginScreen { el: HTMLElement; state(): LoginState; route(hash: string): void; destroy(): void }

const PALETTE = ['#3a3a3c', '#2c3e50', '#3d2c4e', '#4a3b2a', '#23423a', '#4a2a33', '#2a3a4a'];
export function avatarColor(name: string): string {
  let n = 0;
  for (const c of name) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[n % PALETTE.length]!;
}
export function avatar(u: Pick<PublicUser, 'Id' | 'Name' | 'PrimaryImageTag'>, size: number): HTMLElement {
  const el = h('span', { class: 'tide-lg-av', 'aria-hidden': 'true' }, (u.Name.trim()[0] ?? '?').toUpperCase());
  el.style.cssText = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background-color:${avatarColor(u.Name)}`;
  const url = userImageUrl(u, size * 2);
  if (url) { el.style.backgroundImage = `url("${url}")`; el.textContent = ''; }
  return el;
}

export interface CredentialsOpts {
  /** Fixed user (password step) or null (asks for the user name too). */
  user: string | null;
  remember: boolean;
  submitLabel?: string;
  /** Resolve null on success (the page moves on) or an error message to show. */
  onSubmit(name: string, password: string, remember: boolean): Promise<string | null>;
  onForgot?(name: string): void;
}

const field = (input: HTMLElement, iconName: string, extra: HTMLElement | null = null) =>
  h('label', { class: 'tide-lg-field' }, icon(iconName), input, extra);

export function credentialsForm(o: CredentialsOpts): HTMLFormElement {
  const name = o.user === null
    ? h('input', { name: 'username', type: 'text', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', placeholder: 'User name', 'aria-label': 'User name' }) as HTMLInputElement
    : null;
  const pw = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', placeholder: 'Password', 'aria-label': 'Password' }) as HTMLInputElement;
  const eye = h('button', { class: 'tide-lg-eye', type: 'button', 'aria-label': 'Show password' }, icon('visibility'));
  eye.addEventListener('click', () => {
    pw.type = pw.type === 'password' ? 'text' : 'password';
    eye.replaceChildren(icon(pw.type === 'password' ? 'visibility' : 'visibility_off'));
    pw.focus();
  });
  const err = h('div', { class: 'tide-lg-err', role: 'alert', hidden: true });
  const label = o.submitLabel ?? 'Sign in';
  const go = h('button', { class: 'tide-lg-btn w', type: 'submit' }, label) as HTMLButtonElement;
  let remember = o.remember;
  const rem = h('button', { class: `tide-lg-chk${remember ? '' : ' off'}`, type: 'button', role: 'checkbox', 'aria-checked': String(remember) }, h('i', {}, icon('check')), 'Stay signed in');
  rem.addEventListener('click', () => { remember = !remember; rem.classList.toggle('off', !remember); rem.setAttribute('aria-checked', String(remember)); });
  const forgot = o.onForgot ? h('button', { class: 'tide-lg-lnk', type: 'button', 'data-lg': 'forgot' }, 'Forgot password?') : null;
  forgot?.addEventListener('click', () => o.onForgot!(name ? name.value.trim() : o.user ?? ''));
  const form = h('form', { class: 'tide-lg-form', novalidate: true },
    name ? field(name, 'person') : null, field(pw, 'lock', eye), err, go, h('div', { class: 'tide-lg-row' }, rem, forgot)) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (go.disabled) return;
    const n = name ? name.value.trim() : o.user ?? '';
    if (!n) { name?.focus(); return; }
    go.disabled = true;
    go.replaceChildren(h('span', { class: 'tide-lg-spin', 'aria-label': 'Signing in' }));
    err.hidden = true;
    void o.onSubmit(n, pw.value, remember).then((problem) => {
      go.disabled = false;
      go.replaceChildren(label);
      if (!problem) return;
      err.replaceChildren(icon('error'), problem);
      err.hidden = false;
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
      pw.select();
    });
  });
  setTimeout(() => (name ?? pw).focus(), 60);
  return form;
}

const JF_LOGO = '<svg viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="tlg" x1="97" y1="350" x2="440" y2="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#aa5cc3"/><stop offset="1" stop-color="#00a4dc"/></linearGradient></defs><path fill="url(#tlg)" d="M256 72c-18 0-74 101-101 155S56 412 69 437s362 25 374 0-60-155-86-210-82-155-101-155zm0 116c12 0 47 66 64 101s39 82 31 98-182 16-190 0 14-63 31-98 51-101 64-101z"/></svg>';
const WALL_COLS = 9;

function wall(config: LoginConfig): HTMLElement {
  const el = h('div', { class: 'tide-lg-wall', 'aria-hidden': 'true' });
  const p = config.posters;
  if (!p.length) return el;
  // Enough tiles for two screens of rows, doubled so the upward drift can loop seamlessly.
  const count = Math.max(WALL_COLS * 8, p.length);
  for (let i = 0; i < count * 2; i++) {
    const t = h('i', {});
    t.style.backgroundImage = `url("${posterUrl(p[i % p.length]!)}")`;
    el.append(t);
  }
  return el;
}

export function createLoginScreen(d: LoginDeps): LoginScreen {
  const card = h('div', { class: 'tide-lg-card', role: 'main' });
  const brand = h('div', { class: 'tide-lg-brand' });
  brand.innerHTML = JF_LOGO;
  brand.append(h('div', {}, d.config.serverName || 'Jellyfin', h('small', {}, 'Jellyfin')));
  const el = h('div', { class: 'tide-lg' }, wall(d.config), h('div', { class: 'tide-lg-shade' }), brand, card);
  let state: LoginState = 'profiles';

  const btn = (cls: string, lg: string, ...kids: (Node | string)[]) =>
    h('button', { class: cls, type: 'button', 'data-lg': lg }, ...kids);
  const back = (text: string, to: () => void) => {
    const b = btn('tide-lg-lnk tide-lg-back', 'back', icon('arrow_back'), text);
    b.addEventListener('click', to);
    return b;
  };
  const footer = () => {
    const nodes: Node[] = [];
    const disc = d.stock.disclaimer();
    if (disc) nodes.push(h('div', { class: 'tide-lg-disc' }, disc));
    if (d.stock.canSelectServer()) {
      const s = btn('tide-lg-lnk', 'server', icon('dns'), 'Change server');
      s.addEventListener('click', () => d.stock.selectServer());
      nodes.push(s);
    }
    return nodes;
  };
  const show = (s: LoginState, ...nodes: (Node | null)[]) => {
    state = s;
    card.dataset.state = s;
    card.replaceChildren(h('div', { class: 'tide-lg-in' }, ...nodes.filter((n): n is Node => !!n)));
  };
  const signIn = (n: string, pw: string, rem: boolean) => d.stock.signIn(n, pw, rem).then((r) => (r.ok ? null : r.error));
  const home = () => (d.users.length ? profiles() : manual());

  function profiles(): void {
    const grid = h('div', { class: 'tide-lg-grid', role: 'list' }, ...d.users.map((u) => {
      const b = h('button', { class: 'tide-lg-person', type: 'button', 'data-user': u.Id, role: 'listitem' }, avatar(u, 80), h('span', {}, u.Name));
      b.addEventListener('click', () => password(u));
      return b;
    }));
    grid.addEventListener('keydown', (e) => {
      const dir = { ArrowRight: 1, ArrowDown: 4, ArrowLeft: -1, ArrowUp: -4 }[e.key];
      if (!dir) return;
      const all = [...grid.querySelectorAll<HTMLElement>('.tide-lg-person')];
      const i = all.indexOf(document.activeElement as HTMLElement);
      const next = all[Math.min(all.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
      if (next) { e.preventDefault(); next.focus(); }
    });
    const other = btn('tide-lg-btn g', 'other', icon('person_add'), 'Other user');
    other.addEventListener('click', () => manual());
    const qc = d.quickConnect ? btn('tide-lg-btn g', 'qc', icon('devices'), 'Quick Connect') : null;
    qc?.addEventListener('click', () => void quickConnect());
    show('profiles', h('h2', {}, 'Who’s watching?'), grid, h('div', { class: 'tide-lg-actions' }, other, qc), ...footer());
  }

  function password(u: PublicUser): void {
    show('password', h('div', { class: 'tide-lg-who' }, avatar(u, 92), h('b', {}, u.Name)),
      credentialsForm({ user: u.Name, remember: true, onSubmit: signIn, onForgot: (n) => forgot(n) }),
      back('Other profiles', () => profiles()), ...footer());
  }

  function manual(): void {
    const qc = d.quickConnect && !d.users.length ? btn('tide-lg-btn g', 'qc', icon('devices'), 'Quick Connect') : null;
    qc?.addEventListener('click', () => void quickConnect());
    show('manual', h('h2', {}, 'Sign in'),
      credentialsForm({ user: null, remember: true, onSubmit: signIn, onForgot: (n) => forgot(n) }),
      qc ? h('div', { class: 'tide-lg-actions' }, qc) : null,
      d.users.length ? back('Profiles', () => profiles()) : null, ...footer());
  }

  async function quickConnect(): Promise<void> {
    show('qc', h('h2', {}, 'Quick Connect'), h('div', { class: 'tide-lg-wait' }, h('span', { class: 'tide-lg-spin' }), 'Getting a code…'));
    const code = await d.stock.startQuickConnect();
    if (state !== 'qc') return;
    const leave = back('Back', () => { d.stock.cancelQuickConnect(); home(); });
    if (!code) {
      show('qc', h('h2', {}, 'Quick Connect'), h('div', { class: 'tide-lg-err' }, icon('error'), 'Quick Connect isn’t available right now.'), leave);
      return;
    }
    show('qc', h('h2', {}, 'Quick Connect'),
      h('p', { class: 'tide-lg-msg' }, 'On a device where you’re signed in, open your profile → ', h('b', {}, 'Quick Connect'), ' and enter this code.'),
      h('div', { class: 'tide-lg-code', 'aria-label': `Code ${code}` }, ...code.split('').map((c) => h('b', {}, c))),
      h('div', { class: 'tide-lg-wait' }, h('span', { class: 'tide-lg-spin' }), 'Waiting for approval…'), leave);
  }

  function forgot(prefill: string): void {
    const nameIn = h('input', { name: 'username', type: 'text', autocomplete: 'username', autocapitalize: 'off', placeholder: 'User name', 'aria-label': 'User name' }) as HTMLInputElement;
    nameIn.value = prefill;
    const err = h('div', { class: 'tide-lg-err', role: 'alert', hidden: true });
    const go = h('button', { class: 'tide-lg-btn w', type: 'submit' }, 'Send') as HTMLButtonElement;
    const form = h('form', { class: 'tide-lg-form', novalidate: true }, field(nameIn, 'person'), err, go) as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!nameIn.value.trim() || go.disabled) return;
      go.disabled = true;
      d.stock.forgotPassword(nameIn.value.trim()).then((r) => {
        if (r.pin) pin(r.message);
        else { d.stock.backToLogin(); show('forgot', h('h2', {}, 'Forgot password'), h('p', { class: 'tide-lg-msg' }, r.message), back('Back to sign in', home)); }
      }, () => { go.disabled = false; err.replaceChildren(icon('error'), 'Couldn’t reach the server. Try again.'); err.hidden = false; });
    });
    show('forgot', h('h2', {}, 'Forgot password'),
      h('p', { class: 'tide-lg-msg' }, 'Enter your user name. Jellyfin writes a PIN file on the server; whoever runs the server can give you the PIN.'),
      form, back('Back to sign in', () => { d.stock.backToLogin(); home(); }));
    setTimeout(() => nameIn.focus(), 60);
  }

  function pin(message: string): void {
    const pinIn = h('input', { name: 'pin', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: 'PIN', 'aria-label': 'PIN' }) as HTMLInputElement;
    const err = h('div', { class: 'tide-lg-err', role: 'alert', hidden: true });
    const go = h('button', { class: 'tide-lg-btn w', type: 'submit' }, 'Reset password') as HTMLButtonElement;
    const form = h('form', { class: 'tide-lg-form', novalidate: true }, field(pinIn, 'pin'), err, go) as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!pinIn.value.trim() || go.disabled) return;
      go.disabled = true;
      d.stock.submitPin(pinIn.value.trim()).then((r) => {
        go.disabled = false;
        if (r.done) { show('forgot', h('h2', {}, 'Password reset'), h('p', { class: 'tide-lg-msg' }, r.message || 'Done.'), back('Back to sign in', home)); return; }
        err.replaceChildren(icon('error'), r.message || 'That PIN didn’t work.');
        err.hidden = false;
      }, () => { go.disabled = false; });
    });
    show('pin', h('h2', {}, 'Enter the PIN'), h('p', { class: 'tide-lg-msg' }, message), form,
      back('Back to sign in', () => { d.stock.backToLogin(); home(); }));
    setTimeout(() => pinIn.focus(), 60);
  }

  function switching(p: PendingSwitch): void {
    const u = d.users.find((x) => x.Name.toLowerCase() === p.name.toLowerCase()) ?? { Id: '', Name: p.name };
    show('switching', h('div', { class: 'tide-lg-who' }, avatar(u, 92), h('b', {}, u.Name)),
      h('div', { class: 'tide-lg-wait' }, h('span', { class: 'tide-lg-spin' }), `Signing in as ${u.Name}…`));
    void d.stock.signIn(p.name, p.password, p.remember).then((r) => { if (!r.ok) home(); });
  }

  if (d.pending) switching(d.pending);
  else home();

  return {
    el,
    state: () => state,
    route(hash) {
      // The stock pages can move on by themselves (Quick Connect approved, reset finished): follow them.
      if (/^#\/login/.test(hash) && (state === 'forgot' || state === 'pin') && !card.querySelector('form')) home();
    },
    destroy() {
      if (state === 'qc') d.stock.cancelQuickConnect();
      el.remove();
    },
  };
}
```

`web/src/login/login.css`:
```css
/* Tide login (L3 poster wall). Runs before sign-in: no body.tide tokens, literal colours only. */
/* Before sign-in there is no body.tide: the box model and the icon rules (theme/tokens.css) are repeated here. */
:is(.tide-lg, .tide-sw), :is(.tide-lg, .tide-sw) *, :is(.tide-lg, .tide-sw) *::before, :is(.tide-lg, .tide-sw) *::after { box-sizing: border-box; }
:is(.tide-lg, .tide-sw) .tide-ms {
  font-family: 'Tide Symbols'; font-weight: normal; font-style: normal; line-height: 1; letter-spacing: normal; text-transform: none;
  display: inline-block; white-space: nowrap; direction: ltr; font-feature-settings: 'liga'; -webkit-font-smoothing: antialiased;
  font-variation-settings: 'FILL' 1, 'wght' 600, 'GRAD' 100, 'opsz' 24; font-size: 22px; vertical-align: middle;
}
:is(.tide-lg, .tide-sw) .tide-svg { width: 1em; height: 1em; display: inline-flex; align-items: center; justify-content: center; }
:is(.tide-lg, .tide-sw) .tide-svg > svg { width: 100%; height: 100%; fill: currentColor; }
html.tide-login #loginPage, html.tide-login #forgotPasswordPage, html.tide-login .forgotPasswordPinPage,
html.tide-login .toast, html.tide-login .dialogContainer, html.tide-login .dialogBackdrop,
html.tide-login .MuiAppBar-root, html.tide-login .skinHeader { opacity: 0 !important; pointer-events: none !important; }
html.tide-cloak :is(#loginPage, #forgotPasswordPage, .forgotPasswordPinPage) { visibility: hidden !important; }

.tide-lg { position: fixed; inset: 0; z-index: 1300; overflow: hidden; background: #000; color: #f5f5f7; font-family: 'Inter Variable', Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.tide-lg-wall { position: absolute; inset: -120px -200px; display: grid; grid-template-columns: repeat(9, 1fr); gap: 16px; opacity: .38; transform: rotate(-8deg); animation: tide-lg-drift 60s linear infinite; pointer-events: none; }
.tide-lg-wall i { aspect-ratio: 2/3; border-radius: 12px; background: center / cover #1c1c1e; }
@keyframes tide-lg-drift { from { transform: rotate(-8deg) translateY(0); } to { transform: rotate(-8deg) translateY(-50%); } }
.tide-lg-shade { position: absolute; inset: 0; background: radial-gradient(ellipse 50% 60% at 50% 50%, rgba(0,0,0,.25), rgba(0,0,0,.85)); pointer-events: none; }
.tide-lg-brand { position: absolute; left: 40px; top: 34px; display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 16px; color: #e5e5ea; }
.tide-lg-brand svg { width: 34px; height: 34px; }
.tide-lg-brand small { display: block; font-size: 12px; font-weight: 600; color: #8e8e93; }
.tide-lg-card { position: absolute; left: 50%; top: 50%; width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 40px); overflow-y: auto; transform: translate(-50%, -50%); background: #141416; border-radius: 30px; box-shadow: 0 0 0 1px #2a2a2e, 0 40px 100px rgba(0,0,0,.8); padding: 38px 40px 30px; scrollbar-width: none; }
.tide-lg-in { display: flex; flex-direction: column; gap: 22px; animation: tide-lg-in .45s cubic-bezier(.22,1,.36,1) both; }
@keyframes tide-lg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.tide-lg h2 { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -.03em; text-align: center; }
/* Up to four per row, centred (two profiles sit in the middle, not on the left). */
.tide-lg-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 18px 10px; }
.tide-lg-grid > .tide-lg-person { flex: 0 0 calc(25% - 8px); }
.tide-lg-person { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 10px 0; border: 0; border-radius: 18px; background: none; color: #d1d1d6; font-weight: 600; font-size: 14px; font-family: inherit; cursor: pointer; }
.tide-lg-person:is(:hover, :focus-visible) { background: #1c1c1e; color: #fff; outline: none; }
.tide-lg-person:focus-visible .tide-lg-av { box-shadow: 0 0 0 3px #fff; }
.tide-lg-av { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 50%; background: center / cover #2a2a2e; color: #fff; font-weight: 800; }
.tide-lg-who { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.tide-lg-who b { font-size: 22px; }
.tide-lg-actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
.tide-lg-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 54px; padding: 0 22px; border: 0; border-radius: 16px; font-weight: 700; font-size: 16px; font-family: inherit; cursor: pointer; }
.tide-lg-btn.w { background: #fff; color: #000; }
.tide-lg-btn.g { height: 46px; background: #2a2a2e; color: #fff; }
.tide-lg-btn.g:hover { background: #3a3a3c; }
.tide-lg-btn:disabled { cursor: default; }
.tide-lg-form { display: flex; flex-direction: column; gap: 12px; }
.tide-lg-form.shake { animation: tide-lg-shake .4s cubic-bezier(.22,1,.36,1); }
@keyframes tide-lg-shake { 20% { transform: translateX(-8px); } 40% { transform: translateX(7px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(2px); } }
.tide-lg-field { display: flex; align-items: center; gap: 10px; height: 54px; padding: 0 12px 0 16px; border-radius: 16px; background: #1c1c1e; box-shadow: 0 0 0 1px #2a2a2e; transition: box-shadow .2s; }
.tide-lg-field:focus-within { box-shadow: 0 0 0 2px #fff; }
.tide-lg-field > .tide-ms { color: #8e8e93; font-size: 22px; }
.tide-lg-field input { flex: 1; min-width: 0; border: 0; background: none; color: #fff; font-weight: 500; font-size: 16px; font-family: inherit; outline: none; }
.tide-lg-field input::placeholder { color: #6e6e73; }
.tide-lg-eye { display: inline-flex; padding: 4px; border: 0; background: none; color: #8e8e93; cursor: pointer; }
.tide-lg-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tide-lg-chk { display: inline-flex; align-items: center; gap: 10px; padding: 0; border: 0; background: none; color: #d1d1d6; font-weight: 600; font-size: 14px; font-family: inherit; cursor: pointer; }
.tide-lg-chk i { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 7px; background: #fff; color: #000; }
.tide-lg-chk i .tide-ms { font-size: 18px; }
.tide-lg-chk.off i { background: #2a2a2e; }
.tide-lg-chk.off i .tide-ms { visibility: hidden; }
.tide-lg-lnk { display: inline-flex; align-items: center; gap: 6px; padding: 6px 4px; border: 0; background: none; color: #a1a1a6; font-weight: 600; font-size: 14px; font-family: inherit; cursor: pointer; }
.tide-lg-lnk:hover { color: #fff; }
.tide-lg-back { align-self: center; }
.tide-lg-err { display: flex; align-items: center; gap: 6px; color: #ff6961; font-size: 14px; font-weight: 600; }
.tide-lg-msg { margin: 0; color: #a1a1a6; line-height: 1.55; text-align: center; overflow-wrap: anywhere; }
.tide-lg-msg b { color: #fff; }
.tide-lg-code { display: flex; justify-content: center; gap: 10px; }
.tide-lg-code b { display: flex; align-items: center; justify-content: center; width: 56px; height: 68px; border-radius: 14px; background: #1c1c1e; box-shadow: 0 0 0 1px #2a2a2e; font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; }
.tide-lg-wait { display: flex; align-items: center; justify-content: center; gap: 10px; color: #a1a1a6; font-size: 14px; font-weight: 600; }
.tide-lg-spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #48484a; border-top-color: currentColor; animation: tide-lg-spin .8s linear infinite; }
.tide-lg-btn.w .tide-lg-spin { border-color: #c7c7cc; border-top-color: #000; }
@keyframes tide-lg-spin { to { transform: rotate(360deg); } }
.tide-lg-disc { color: #8e8e93; font-size: 12.5px; line-height: 1.5; text-align: center; }
.tide-lg [hidden] { display: none !important; }
@media (max-width: 699px) {
  .tide-lg-card { padding: 28px 20px 22px; border-radius: 24px; }
  .tide-lg-grid > .tide-lg-person { flex-basis: calc(33.333% - 7px); }
  .tide-lg h2 { font-size: 26px; }
  .tide-lg-brand { left: 20px; top: 20px; }
  .tide-lg-code b { width: 44px; height: 56px; font-size: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .tide-lg-wall { animation: none; }
  .tide-lg-in, .tide-lg-form.shake { animation: none; }
}
```

Regenerate the icon subset. The new names are `person_add`, `devices`, `visibility`, `visibility_off`, `lock`, `pin`, `dns` and `person`.

Run: `cd web && node scripts/icons.mjs`

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run && npx tsc --noEmit -p .`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/login web/src/api/client.ts web/test/loginScreen.test.ts web/src/theme/fonts
git commit -m "feat(login): L3 poster-wall sign-in screen with profiles, password, Quick Connect and reset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mount the login screen on the sign-in routes

**Files:**
- Create: `web/src/login/index.ts`, `web/test/loginBoot.test.ts`
- Modify: `web/src/main.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3; `hold` and `release` (`boot/cloak`); `invalidate` (`api/cache`); `onLocationChange`.
- Produces: `LOGIN_ROUTE`, `isLoginRoute(hash?)`, `initLogin(deps?): () => void`, where `deps = { config, users, quickConnect }` default to the `login/api` functions.

- [ ] **Step 1: Write the failing tests**

`web/test/loginBoot.test.ts`:
```ts
import { initLogin, isLoginRoute } from '../src/login/index';
import { setPendingSwitch } from '../src/login/pending';

const CFG = { enabled: true, serverName: 'Home Media', posters: [] };
const deps = (enabled = true) => ({ config: vi.fn(async () => (enabled ? CFG : { ...CFG, enabled: false })), users: vi.fn(async () => [{ Id: 'u1', Name: 'mila' }]), quickConnect: vi.fn(async () => false) });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
let stop: (() => void) | null = null;
beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf' }; document.body.innerHTML = '<div id="loginPage" class="page"></div>'; });
afterEach(() => { stop?.(); stop = null; location.hash = ''; document.documentElement.className = ''; document.body.innerHTML = ''; });

test('isLoginRoute', () => {
  expect(isLoginRoute('#/login?serverid=x')).toBe(true);
  expect(isLoginRoute('#/forgotpassword')).toBe(true);
  expect(isLoginRoute('#/forgotpasswordpin')).toBe(true);
  expect(isLoginRoute('#/home')).toBe(false);
  expect(isLoginRoute('#/loginx')).toBe(false);
});

test('mounts on login routes when enabled; unmounts on leaving', async () => {
  location.hash = '#/login';
  const d = deps();
  stop = initLogin(d);
  await flush();
  expect(document.querySelector('.tide-lg')).not.toBeNull();
  expect(document.documentElement.classList.contains('tide-login')).toBe(true);
  location.hash = '#/home';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await flush();
  expect(document.querySelector('.tide-lg')).toBeNull();
  expect(document.documentElement.classList.contains('tide-login')).toBe(false);
  expect(d.config).toHaveBeenCalledTimes(1);
});

test('disabled or unreachable: stays out of the way', async () => {
  location.hash = '#/login';
  stop = initLogin(deps(false));
  await flush();
  expect(document.querySelector('.tide-lg')).toBeNull();
  expect(document.documentElement.classList.contains('tide-login')).toBe(false);
  expect(document.documentElement.classList.contains('tide-cloak')).toBe(false);
});

test('never mounts on other routes', async () => {
  location.hash = '#/home';
  const d = deps();
  stop = initLogin(d);
  await flush();
  expect(d.config).not.toHaveBeenCalled();
  expect(document.querySelector('.tide-lg')).toBeNull();
});

test('a pending profile switch is handed to the screen', async () => {
  // A stock form that never answers keeps the screen on "Signing in as …".
  document.body.innerHTML = '<div id="loginPage" class="page"><form class="manualLoginForm"><input id="txtManualName"><input id="txtManualPassword"></form></div>';
  document.querySelector('form')!.addEventListener('submit', (e) => e.preventDefault());
  setPendingSwitch({ name: 'mila', password: 'mila', remember: true });
  location.hash = '#/login';
  stop = initLogin(deps());
  await flush();
  expect(document.querySelector('.tide-lg-card')?.getAttribute('data-state')).toBe('switching');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run test/loginBoot.test.ts`

Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement**

`web/src/login/index.ts`:
```ts
import { hold, release } from '../boot/cloak';
import { invalidate } from '../api/cache';
import { onLocationChange } from '../router/location';
import { fetchLoginConfig, publicUsers, quickConnectEnabled, type LoginConfig, type PublicUser } from './api';
import { createLoginScreen, type LoginScreen } from './screen';
import { takePendingSwitch } from './pending';
import * as stock from './stockLogin';

export const LOGIN_ROUTE = /^#\/(login|forgotpassword|forgotpasswordpin)(\?|$)/;
export const isLoginRoute = (hash: string = location.hash): boolean => LOGIN_ROUTE.test(hash);
const HINT = 'tide:login';
const hinted = () => { try { return localStorage.getItem(HINT) !== '0'; } catch { return true; } };
const saveHint = (on: boolean) => { try { localStorage.setItem(HINT, on ? '1' : '0'); } catch { /* storage blocked */ } };

export interface LoginBootDeps { config(): Promise<LoginConfig | null>; users(): Promise<PublicUser[]>; quickConnect(): Promise<boolean> }

/** Runs from script start (before any session): Tide's sign-in screen over the stock pages, only on their routes. */
export function initLogin(deps: LoginBootDeps = { config: fetchLoginConfig, users: publicUsers, quickConnect: quickConnectEnabled }): () => void {
  let screen: LoginScreen | null = null;
  let mounting = false;
  let cfg: Promise<LoginConfig | null> | null = null;

  const unmount = () => {
    if (!screen) return;
    screen.destroy();
    screen = null;
    document.documentElement.classList.remove('tide-login');
    invalidate(); // a different user may sign in without a page reload: drop the last one's cached rows
  };
  const sync = async () => {
    if (!isLoginRoute()) { unmount(); release('login'); return; }
    if (screen) { screen.route(location.hash); return; }
    if (mounting) return;
    mounting = true;
    try {
      if (hinted()) hold('login');
      const c = await (cfg ??= deps.config());
      if (!c) cfg = null; // unreachable: try again next time
      saveHint(!!c?.enabled);
      if (!c?.enabled || !isLoginRoute()) return;
      const [users, qc] = await Promise.all([deps.users(), deps.quickConnect()]);
      if (!isLoginRoute() || screen) return;
      screen = createLoginScreen({ config: c, users, quickConnect: qc, stock, pending: takePendingSwitch() });
      document.body.append(screen.el);
      document.documentElement.classList.add('tide-login');
    } finally {
      mounting = false;
      release('login');
    }
  };
  const stop = onLocationChange(() => void sync());
  void sync();
  return () => { stop(); unmount(); };
}
```

In `web/src/main.ts`:
1. Add `import { initLogin } from './login/index';`.
2. In the bottom bootstrap block, call `initLogin();` right after `preloadFonts();` (before `void boot()`).

- [ ] **Step 4: Run tests, deploy, look**

1. Run: `cd web && npx vitest run && npx tsc --noEmit -p .`
   Expected: all pass.
2. Deploy.
3. Screenshot `/web/` logged out at 1440×900 and at 390×844. Confirm the poster wall, the card with mila and noah, and no stock form visible.

- [ ] **Step 5: Commit**

```bash
git add web/src/login/index.ts web/src/main.ts web/test/loginBoot.test.ts
git commit -m "feat(login): mount the Tide sign-in over the stock login routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Switch profile

**Files:**
- Create: `web/src/login/switchProfile.ts`, `web/test/switchProfile.test.ts`
- Modify: `web/src/main.ts`, `web/src/login/login.css` (append); icon subset

**Interfaces:**
- Consumes: `avatar` and `credentialsForm` (Task 3); `setPendingSwitch` (Task 3); `serverBase`, `getSession` (`api/client`); `ClientConfig.enableLogin`.
- Produces:
  - `SWITCH_ITEM = 'tide-switch-item'`;
  - `verifyPassword(name, password, f?: typeof fetch): Promise<'ok' | 'wrong' | 'error'>`;
  - `stockSignOut(timeoutMs?): Promise<boolean>`;
  - `openSwitchOverlay(): HTMLElement`;
  - `initSwitchProfile(cfg): () => void`.
- DOM: menu item `li.tide-switch-item`; overlay `.tide-sw` with people `[data-user]` (current has `.cur`), `[data-lg="other"]`, `[data-lg="close"]`, then the credentials form.

- [ ] **Step 1: Write the failing tests**

`web/test/switchProfile.test.ts`:
```ts
import { initSwitchProfile, openSwitchOverlay, stockSignOut, verifyPassword, SWITCH_ITEM } from '../src/login/switchProfile';
import { takePendingSwitch } from '../src/login/pending';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: 't' } as any;
let stop: (() => void) | null = null;
beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 'tok', getCurrentUserId: () => 'me' }; });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; document.documentElement.className = ''; });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

test('verifyPassword uses its own device id and ends that session; 401 = wrong', async () => {
  const calls: [string, RequestInit][] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    if (url.endsWith('/Users/AuthenticateByName')) {
      const body = JSON.parse(String(init.body));
      return body.Pw === 'mila' ? new Response(JSON.stringify({ AccessToken: 'tmp' })) : new Response('', { status: 401 });
    }
    return new Response('', { status: 204 });
  }) as any;
  expect(await verifyPassword('mila', 'nope', f)).toBe('wrong');
  expect(await verifyPassword('mila', 'mila', f)).toBe('ok');
  const auth = String((calls[1]![1].headers as Record<string, string>).Authorization);
  expect(auth).toMatch(/DeviceId="tide-switch-[a-z0-9]+"/);
  expect(calls[2]![0]).toBe('http://jf/Sessions/Logout');
  expect(String((calls[2]![1].headers as Record<string, string>).Authorization)).toContain('Token="tmp"');
  expect(await verifyPassword('mila', 'mila', vi.fn(async () => { throw new Error('offline'); }) as any)).toBe('error');
});

test('injects "Switch profile" after the first user-menu item, once', async () => {
  stop = initSwitchProfile(cfg);
  document.body.insertAdjacentHTML('beforeend', `<div id="app-user-menu"><ul role="menu"><a role="menuitem" class="MuiMenuItem-root x">Profile</a><a role="menuitem" class="MuiMenuItem-root x">Settings</a></ul></div>`);
  await flush();
  const items = [...document.querySelectorAll('#app-user-menu [role="menuitem"]')];
  expect(items[1]!.classList.contains(SWITCH_ITEM)).toBe(true);
  expect(items[1]!.textContent).toContain('Switch profile');
  document.querySelector('#app-user-menu ul')!.append(document.createElement('li'));
  await flush();
  expect(document.querySelectorAll(`.${SWITCH_ITEM}`)).toHaveLength(1);
});
afterEach(() => { stop?.(); stop = null; });

test('overlay: current user marked; wrong password keeps you signed in; right password signs out via the stock menu', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const u = String(url);
    if (u.endsWith('/Users/Public')) return new Response(JSON.stringify([{ Id: 'me', Name: 'tide' }, { Id: 'u1', Name: 'mila' }]));
    if (u.endsWith('/Users/AuthenticateByName')) return JSON.parse(String((init as RequestInit).body)).Pw === 'mila' ? new Response(JSON.stringify({ AccessToken: 'tmp' })) : new Response('', { status: 401 });
    return new Response('', { status: 204 });
  });
  const signedOut = vi.fn();
  document.body.innerHTML = `<header class="MuiAppBar-root"><button aria-controls="app-user-menu" aria-label="User Menu"></button></header>`;
  document.querySelector('[aria-controls="app-user-menu"]')!.addEventListener('click', () => {
    document.body.insertAdjacentHTML('beforeend', `<div id="app-user-menu"><ul role="menu"><li role="menuitem"><svg data-testid="LogoutIcon"></svg>Sign Out</li></ul></div>`);
    document.querySelector('#app-user-menu li')!.addEventListener('click', signedOut);
  });
  const o = openSwitchOverlay();
  await flush();
  expect(o.querySelector('[data-user="me"]')!.classList.contains('cur')).toBe(true);
  (o.querySelector('[data-user="u1"]') as HTMLElement).click();
  const pw = o.querySelector<HTMLInputElement>('input[name="password"]')!;
  pw.value = 'nope';
  o.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(o.querySelector('.tide-lg-err')!.textContent).toContain('Wrong password');
  expect(signedOut).not.toHaveBeenCalled();
  expect(takePendingSwitch()).toBeNull();
  pw.value = 'mila';
  o.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush(); await new Promise((r) => setTimeout(r, 60));
  expect(signedOut).toHaveBeenCalled();
  expect(takePendingSwitch()).toMatchObject({ name: 'mila', password: 'mila', remember: true });
});

test('overlay: picking yourself or Cancel / Esc just closes', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify([{ Id: 'me', Name: 'tide' }])));
  const o = openSwitchOverlay();
  await flush();
  (o.querySelector('[data-user="me"]') as HTMLElement).click();
  expect(o.isConnected).toBe(false);
  const o2 = openSwitchOverlay();
  await flush();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(o2.isConnected).toBe(false);
});

test('stockSignOut gives up cleanly when the menu never opens', async () => {
  expect(await stockSignOut(100)).toBe(false);
  expect(document.documentElement.classList.contains('tide-switching')).toBe(false);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run test/switchProfile.test.ts`

Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement**

`web/src/login/switchProfile.ts`:
```ts
import { getSession, serverBase } from '../api/client';
import { h, icon } from '../ui/dom';
import { avatar, credentialsForm } from './screen';
import { setPendingSwitch, takePendingSwitch } from './pending';
import type { PublicUser } from './api';
import type { ClientConfig } from '../types';

export const SWITCH_ITEM = 'tide-switch-item';

/**
 * Check a password without touching the current session: a one-time device id (re-authenticating with this device's
 * own id would revoke its token), then end that verification session at once.
 */
export async function verifyPassword(name: string, password: string, f: typeof fetch = fetch): Promise<'ok' | 'wrong' | 'error'> {
  const device = `tide-switch-${Math.random().toString(36).slice(2, 10)}`;
  const auth = `MediaBrowser Client="Tide", Device="Tide profile switch", DeviceId="${device}", Version="1"`;
  try {
    const r = await f(`${serverBase()}/Users/AuthenticateByName`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify({ Username: name, Pw: password }),
    });
    if (r.status === 401 || r.status === 403) return 'wrong';
    if (!r.ok) return 'error';
    const j = (await r.json()) as { AccessToken?: string };
    if (j.AccessToken) await f(`${serverBase()}/Sessions/Logout`, { method: 'POST', headers: { Authorization: `${auth}, Token="${j.AccessToken}"` } }).catch(() => undefined);
    return 'ok';
  } catch {
    return 'error';
  }
}

function waitFor<T>(find: () => T | null | undefined, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => { const v = find(); if (v) resolve(v); else if (Date.now() - t0 > ms) reject(new Error('timeout')); else setTimeout(tick, 25); };
    tick();
  });
}

/** Sign out the way the stock UI does (its user menu's Sign Out), with the menu hidden while Tide clicks it. */
export async function stockSignOut(timeoutMs = 3000): Promise<boolean> {
  const html = document.documentElement;
  html.classList.add('tide-switching');
  try {
    document.querySelector<HTMLElement>('.MuiAppBar-root button[aria-controls="app-user-menu"], .MuiAppBar-root button[aria-label="User Menu"]')?.click();
    const out = await waitFor(() => document.querySelector('#app-user-menu [data-testid="LogoutIcon"]')?.closest<HTMLElement>('li, [role="menuitem"]'), timeoutMs);
    out.click();
    // Keep the stock menu hidden while it closes behind the sign-out.
    setTimeout(() => html.classList.remove('tide-switching'), 800);
    return true;
  } catch {
    html.classList.remove('tide-switching');
    return false;
  }
}

async function users(): Promise<PublicUser[]> {
  try { const r = await fetch(`${serverBase()}/Users/Public`); return r.ok ? ((await r.json()) as PublicUser[]) : []; } catch { return []; }
}

export function openSwitchOverlay(): HTMLElement {
  const me = getSession()?.userId ?? '';
  const box = h('div', { class: 'tide-sw-in' }, h('div', { class: 'tide-lg-wait' }, h('span', { class: 'tide-lg-spin' })));
  const el = h('div', { class: 'tide-sw tide-lg-font', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Switch profile' }, box);
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  const cancel = () => { const b = h('button', { class: 'tide-lg-lnk', type: 'button', 'data-lg': 'close' }, icon('close'), 'Cancel'); b.addEventListener('click', close); return b; };
  const submit = async (name: string, password: string, remember: boolean): Promise<string | null> => {
    const v = await verifyPassword(name, password);
    if (v === 'wrong') return 'Wrong password. Try again.';
    if (v === 'error') return 'Couldn’t reach the server. Try again.';
    setPendingSwitch({ name, password, remember });
    if (!(await stockSignOut())) { takePendingSwitch(); return 'Couldn’t sign out. Try again.'; }
    return null;
  };
  const ask = (u: PublicUser | null) => {
    box.replaceChildren(h('div', { class: 'tide-sw-card' },
      u ? h('div', { class: 'tide-lg-who' }, avatar(u, 92), h('b', {}, u.Name)) : h('h2', {}, 'Other user'),
      credentialsForm({ user: u ? u.Name : null, remember: true, submitLabel: u ? `Switch to ${u.Name}` : 'Switch', onSubmit: submit }),
      cancel()));
  };
  void users().then((list) => {
    if (!el.isConnected) return;
    if (!list.length) { ask(null); return; }
    const people = h('div', { class: 'tide-sw-people' }, ...list.map((u) => {
      const b = h('button', { class: `tide-sw-person${u.Id === me ? ' cur' : ''}`, type: 'button', 'data-user': u.Id }, avatar(u, 110), h('span', {}, u.Name), u.Id === me ? h('small', {}, 'CURRENT') : null);
      b.addEventListener('click', () => (u.Id === me ? close() : ask(u)));
      return b;
    }));
    const other = h('button', { class: 'tide-sw-person', type: 'button', 'data-lg': 'other' }, h('span', { class: 'tide-lg-av tide-sw-add' }, icon('add')), h('span', {}, 'Other user'));
    other.addEventListener('click', () => ask(null));
    people.append(other);
    box.replaceChildren(h('h2', {}, 'Switch profile'), people, cancel());
  });
  document.body.append(el);
  return el;
}

function injectItem(): void {
  const menu = document.querySelector<HTMLElement>('#app-user-menu [role="menu"]');
  if (!menu || menu.querySelector(`.${SWITCH_ITEM}`)) return;
  const first = menu.querySelector<HTMLElement>('[role="menuitem"]');
  if (!first) return;
  const item = document.createElement('li');
  item.className = `${first.className} ${SWITCH_ITEM}`;
  item.setAttribute('role', 'menuitem');
  item.tabIndex = -1;
  item.append(
    h('div', { class: 'MuiListItemIcon-root' }, icon('switch_account')),
    h('div', { class: 'MuiListItemText-root' }, h('span', { class: 'MuiTypography-root MuiTypography-body1 MuiListItemText-primary' }, 'Switch profile')));
  item.addEventListener('click', () => {
    // Close the MUI menu (Escape on its list), then open the overlay.
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelector<HTMLElement>('#app-user-menu .MuiBackdrop-root')?.click();
    openSwitchOverlay();
  });
  first.after(item);
}

export function initSwitchProfile(cfg: ClientConfig): () => void {
  if (cfg.enableLogin === false) return () => {};
  let queued = false;
  const obs = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; injectItem(); });
  });
  obs.observe(document.body, { childList: true, subtree: true });
  injectItem();
  return () => obs.disconnect();
}
```

Append to `web/src/login/login.css`:
```css
/* Switch profile overlay (signed in) and the hidden stock menu while Tide signs out through it. */
html.tide-switching #app-user-menu { opacity: 0 !important; }
.tide-lg-font { font-family: 'Inter Variable', Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.tide-sw { position: fixed; inset: 0; z-index: 1500; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.78); color: #f5f5f7; animation: tide-lg-in .3s ease both; }
.tide-sw-in { display: flex; flex-direction: column; align-items: center; gap: 30px; }
.tide-sw h2 { margin: 0; font-size: 36px; font-weight: 800; letter-spacing: -.03em; }
.tide-sw-people { display: flex; flex-wrap: wrap; justify-content: center; gap: 30px; max-width: 900px; }
.tide-sw-person { display: flex; flex-direction: column; align-items: center; gap: 10px; border: 0; background: none; color: #d1d1d6; font-weight: 600; font-size: 15px; font-family: inherit; cursor: pointer; }
.tide-sw-person .tide-lg-av { transition: box-shadow .2s, transform .3s cubic-bezier(.22,1,.36,1); }
.tide-sw-person:is(:hover, :focus-visible) .tide-lg-av, .tide-sw-person.cur .tide-lg-av { box-shadow: 0 0 0 4px #fff; }
.tide-sw-person:is(:hover, :focus-visible) .tide-lg-av { transform: scale(1.05); }
.tide-sw-person small { color: #8e8e93; font-size: 12px; font-weight: 700; letter-spacing: .08em; }
.tide-sw-add { width: 110px; height: 110px; background: #1c1c1e !important; box-shadow: inset 0 0 0 2px #3a3a3c; color: #a1a1a6; }
.tide-sw-card { width: min(440px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: 20px; padding: 34px 36px 26px; border-radius: 28px; background: #141416; box-shadow: 0 0 0 1px #2a2a2e, 0 40px 100px rgba(0,0,0,.8); }
.tide-sw-card h2 { font-size: 28px; text-align: center; }
.tide-sw .tide-lg-who { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.tide-sw [hidden] { display: none !important; }
```
The overlay reuses the `.tide-lg-*` field, button, error and spinner rules from Task 3. Those selectors are not scoped to `.tide-lg`, so they apply in the app too.

In `web/src/main.ts`:
1. Add `import { initSwitchProfile } from './login/switchProfile';`.
2. Add `registerFeature((cfg) => void initSwitchProfile(cfg));` after the search feature.

Regenerate the icon subset: `switch_account` is new. Run `cd web && node scripts/icons.mjs`.

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run && npx tsc --noEmit -p .`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/login web/src/main.ts web/test/switchProfile.test.ts web/src/theme/fonts
git commit -m "feat(login): switch profile from the avatar menu (password verified before signing out)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end: shared sign-in helper, fixtures, login tests

**Files:**
- Create: `e2e/tests/auth.ts`, `e2e/tests/login.spec.ts`
- Modify:
  - `e2e/setup.mjs` (test profiles)
  - `e2e/tests/home.spec.ts`, `e2e/tests/details.spec.ts`, `e2e/tests/player.spec.ts`, `e2e/tests/search.spec.ts` (use the shared `login`)

- [ ] **Step 1: Shared helper and fixtures**

`e2e/tests/auth.ts`:
```ts
import type { Page } from '@playwright/test';

/** Sign in through whichever sign-in is showing: Tide's login screen (0.6.0+) or the stock page. */
export async function login(page: Page, user = 'tide', password = 'tide'): Promise<void> {
  await page.goto('/web/');
  await page.waitForSelector('.tide-lg-card, #loginPage:not(.hide) input[type=password]', { timeout: 30_000 });
  if (await page.locator('.tide-lg-card').count()) {
    const other = page.locator('.tide-lg-card [data-lg="other"]');
    if (await other.count()) await other.click();
    await page.fill('.tide-lg-card input[name="username"]', user);
    await page.fill('.tide-lg-card input[name="password"]', password);
  } else {
    const manual = page.locator('#loginPage:not(.hide) .btnManual');
    if (await manual.isVisible().catch(() => false)) await manual.click();
    await page.fill('#loginPage:not(.hide) #txtManualName', user);
    await page.fill('#loginPage:not(.hide) #txtManualPassword', password);
  }
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
}
```

In each of `home.spec.ts`, `details.spec.ts`, `player.spec.ts` and `search.spec.ts`:
1. Delete the local `async function login(page: Page) { … }`.
2. Add `import { login } from './auth';`.
3. Keep `Page` in the existing import only where it is still used.

In `e2e/setup.mjs`, after the library folders loop, add idempotent test profiles:
```js
  // Visible test profiles for the login picker: mila (password "mila") and noah (no password).
  const users = await req('/Users', { token });
  for (const [name, pw] of [['mila', 'mila'], ['noah', '']]) {
    let u = users.find((x) => x.Name === name);
    if (!u) u = await req('/Users/New', { method: 'POST', token, body: { Name: name, Password: pw } });
    const full = await req(`/Users/${u.Id}`, { token });
    if (full.Policy.IsHidden) await req(`/Users/${u.Id}/Policy`, { method: 'POST', token, body: { ...full.Policy, IsHidden: false } });
    if (!pw) await req(`/Users/${u.Id}/Password`, { method: 'POST', token, body: { ResetPassword: true } });
  }
```
If `req()` cannot handle 204 responses (empty body), make it return `null` for empty bodies. Check its implementation at the top of `setup.mjs`.

Run: `cd e2e && node -e "import('./setup.mjs').then(m => m.setup())"`

Expected: it finishes, and `curl -s localhost:8096/Users/Public` lists mila and noah.

- [ ] **Step 2: Write `e2e/tests/login.spec.ts`**

```ts
import { expect, test, type APIRequestContext } from '@playwright/test';
import { login } from './auth';

const CLIENT = 'MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1"';
const PLUGIN_ID = '7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c';
async function auth(request: APIRequestContext) {
  const r = await request.post('/Users/AuthenticateByName', { headers: { Authorization: CLIENT }, data: { Username: 'tide', Pw: 'tide' } });
  const j = await r.json();
  return { headers: { Authorization: `${CLIENT}, Token="${j.AccessToken}"` } };
}
const currentUserName = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => { const c = (window as any).ApiClient; return (await c.getCurrentUser()).Name as string; });

test('profiles over the poster wall; the stock page stays hidden', async ({ page }) => {
  await page.goto('/web/');
  await expect(page.locator('.tide-lg-card[data-state="profiles"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tide-lg-person', { hasText: 'mila' })).toBeVisible();
  await expect(page.locator('.tide-lg-person', { hasText: 'noah' })).toBeVisible();
  expect(await page.locator('.tide-lg-wall i').count()).toBeGreaterThan(0);
  await expect(page.locator('#loginPage:not(.hide)')).toHaveCSS('opacity', '0');
});

test('wrong password shows the error in the card; right password signs in', async ({ page }) => {
  await page.goto('/web/');
  await page.locator('.tide-lg-person', { hasText: 'mila' }).click();
  await page.fill('.tide-lg-card input[name="password"]', 'nope');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tide-lg-err')).toContainText('Invalid', { timeout: 15_000 });
  await page.fill('.tide-lg-card input[name="password"]', 'mila');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
  expect(await currentUserName(page)).toBe('mila');
});

test('a profile without a password signs in with an empty field', async ({ page }) => {
  await page.goto('/web/');
  await page.locator('.tide-lg-person', { hasText: 'noah' }).click();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
  expect(await currentUserName(page)).toBe('noah');
});

test('manual sign-in (Other user) works for a hidden user', async ({ page }) => {
  await login(page);
  expect(await currentUserName(page)).toBe('tide');
});

test('Quick Connect shows the six-digit code; Back returns to profiles', async ({ page }) => {
  await page.goto('/web/');
  await page.locator('.tide-lg-card [data-lg="qc"]').click();
  await expect(page.locator('.tide-lg-code b')).toHaveCount(6, { timeout: 15_000 });
  await page.locator('.tide-lg-card [data-lg="back"]').click();
  await expect(page.locator('.tide-lg-card[data-state="profiles"]')).toBeVisible();
});

test('Forgot password shows Jellyfin\'s answer and asks for the PIN', async ({ page }) => {
  await page.goto('/web/');
  await page.locator('.tide-lg-person', { hasText: 'mila' }).click();
  await page.locator('.tide-lg-card [data-lg="forgot"]').click();
  await expect(page.locator('.tide-lg-card input[name="username"]')).toHaveValue('mila');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tide-lg-card[data-state="pin"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.tide-lg-msg').first()).toContainText('server');
});

test('Switch profile: wrong password keeps you signed in; right password switches to mila', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'avatar menu');
  await login(page);
  await page.locator('.MuiAppBar-root button[aria-controls="app-user-menu"]').click();
  await page.locator('#app-user-menu .tide-switch-item').click();
  await expect(page.locator('.tide-sw')).toBeVisible();
  await page.locator('.tide-sw [data-user]', { hasText: 'mila' }).click();
  await page.fill('.tide-sw input[name="password"]', 'nope');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tide-sw .tide-lg-err')).toContainText('Wrong password', { timeout: 15_000 });
  expect(await currentUserName(page)).toBe('tide');
  await page.fill('.tide-sw input[name="password"]', 'mila');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash.startsWith('#/home') || location.hash === '' || location.hash === '#/', null, { timeout: 30_000 });
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
  await expect.poll(() => currentUserName(page), { timeout: 15_000 }).toBe('mila');
});

test('EnableLogin off: the stock sign-in is untouched', async ({ page, request }) => {
  const a = await auth(request);
  const url = `/Plugins/${PLUGIN_ID}/Configuration`;
  const original = await (await request.get(url, { headers: a.headers })).json();
  await request.post(url, { headers: a.headers, data: { ...original, EnableLogin: false } });
  try {
    await page.goto('/web/');
    await page.waitForSelector('#loginPage:not(.hide)', { timeout: 30_000 });
    await page.waitForTimeout(1500);
    await expect(page.locator('.tide-lg')).toHaveCount(0);
    await expect(page.locator('#loginPage:not(.hide) .visualLoginForm')).toBeVisible();
  } finally {
    await request.post(url, { headers: (await auth(request)).headers, data: { ...original, EnableLogin: true } });
  }
});
```

- [ ] **Step 3: Run end-to-end**

Deploy, then run: `cd e2e && npx playwright test`

Expected: everything passes, the login spec on both projects (Switch profile is desktop only).

If the `EnableLogin off` test leaves a cached config in the tab, it does not: each test has a fresh context and `sessionStorage`.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(e2e): Tide login flows, shared sign-in helper, visible test profiles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Version 0.6.0, docs, full verification

**Files:**
- Modify: `server/Jellyfin.Plugin.Tide/Jellyfin.Plugin.Tide.csproj` (`0.6.0.0` ×2), `web/package.json` and `web/package-lock.json` (lines 3 and 9: `0.6.0`), `web/src/main.ts` (`TIDE_VERSION = '0.6.0'`), `README.md`

- [ ] **Step 1: Bump the version and update the README**

1. Apply the version changes listed above.
2. Add this feature bullet to `README.md`, before **Top bar**: `- **Sign-in:** a poster-wall sign-in screen with a "Who's watching?" profile picker, Quick Connect and password reset; switch profile from the avatar menu.`
3. In **Configure**, add "the login screen" to the list of things that can be turned on or off.

- [ ] **Step 2: Run everything**

1. Run: `cd web && npx tsc --noEmit -p . && npx vitest run`
2. Run: `./scripts/dotnet test server/Jellyfin.Plugin.Tide.Tests`
3. Deploy, then run: `cd e2e && npx playwright test`

Expected: everything passes. Quote any failure verbatim.

- [ ] **Step 3: Scan for private data**

Run the private-data scan on `git diff main...HEAD` and on `git log -p main..HEAD`, using the patterns the controller keeps outside the repo. Expected: no hits.

- [ ] **Step 4: Commit**

```bash
git add server/Jellyfin.Plugin.Tide/Jellyfin.Plugin.Tide.csproj web/package.json web/package-lock.json web/src/main.ts README.md
git commit -m "chore: version 0.6.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Manual checks for the user:**
- Jellyfin Desktop and the Android app: the sign-in screen and Quick Connect approval from a phone.
- Switch profile with a real second account.
- A server that hides users: the manual form appears first.
