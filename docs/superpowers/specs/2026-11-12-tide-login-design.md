# Tide login: L3 poster wall, profile picker, switch profile

Chosen in the companion prototype (`login.html`): **L3 · Poster wall**. Posters come from the server for every visitor (the user's choice; this is visible to anyone who opens the login page). The approach is **A: Tide's screen over the stock sign-in**, which Tide drives behind the scenes.

## Global constraints (carried over)

- **Surfaces:** solid only. Card `#141416` with a `0 0 0 1px #2a2a2e` ring and a large soft shadow. Fields `#1c1c1e`. Buttons white (primary) or `#2a2a2e` (secondary). No blur or see-through panels.
- **Motion:** transform and opacity only, curve `cubic-bezier(.22,1,.36,1)`. With `prefers-reduced-motion`, nothing drifts or slides.
- **Icons:** every new icon name must be in the font subset (`node web/scripts/icons.mjs`).
- **Visibility:** `[hidden]` wins over a component's own `display`. Invisible layers get `pointer-events: none`.
- **Never hand-roll authentication:** jellyfin-web performs every sign-in, so the credential store, server selection and the Desktop / Android app integration stay stock.

## Probed stock 12.4 facts

**Login page.** `#/login?...` shows `#loginPage`, which contains:
- **Profile view** (`.visualLoginForm`, used when the server shows users): `#divUsers .card` buttons. Each card's `.cardContent` has `data-username`, `data-userid` and `data-haspw`. A user picture is the `.cardImage` background.
- **Manual form** (`.manualLoginForm`): `#txtManualName`, `#txtManualPassword`, `.chkRememberLogin` (checked by default), a submit button and `.btnCancel`.
- **Buttons:** `.btnManual`, `.btnQuick`, `.btnForgotPassword`, `.btnSelectServer` (hidden unless there are several servers).
- **Disclaimer:** `.loginDisclaimer` holds the admin's login message.

**Profile cards.** Clicking a card shows the manual form with the name filled in. `HasPassword` / `data-haspw` is always `true` in 12.x, so a password step always follows. An empty password is valid for users without one.

**Errors.** A failed sign-in shows `.toast.toastVisible` with "Invalid username or password. Please try again."

**Quick Connect.** `.btnQuick` opens `#quickConnectAlert`, whose `.text` reads "Enter code 422478 to login". The dialog polls the server and signs in by itself. It adds `dialogs` to `history.state.usr`. Escape does not close it, but `history.back()` does.

**Forgot password.** `.btnForgotPassword` goes to `#/forgotpassword`: `#forgotPasswordPage` with `#txtName`, `#btnSubmit` and `#btnCancel`. Jellyfin then answers with an alert dialog (contact admin, in-network required, or a PIN file written), and the PIN step at `#/forgotpasswordpin`.

**Public endpoints** (no token needed): `/Users/Public` (`Name`, `Id`, `PrimaryImageTag`), `/System/Info/Public` (`ServerName`), `/QuickConnect/Enabled`, and item and user images.

## 1. Running before sign-in

- **Startup:** `web/src/login/` starts at script start, independent of `boot()` (which waits for a session). It is active only on the routes `#/login`, `#/forgotpassword` and `#/forgotpasswordpin`, and it reacts to route changes.
- **Config request:** on first need it calls the new anonymous `GET /Tide/Login`, which returns `{ enabled, serverName, posters: [{ id, tag }] }`. The response is cached in `sessionStorage` for the tab.
- **Off or failed:** if `enabled` is false or the request fails, nothing changes and the stock page stays.
- **Mounting:** when enabled, Tide adds `html.tide-login` and mounts its screen over the stock page. The stock page stays in the DOM, hidden (`opacity: 0; pointer-events: none`), so Tide can drive it. The boot cloak covers the gap, so stock is never visible first.
- **Unmounting:** leaving the login routes removes Tide's screen. A signed-in boot then continues as today.
- **Admin setting:** "Tide login screen", `EnableLogin`, on by default.

## 2. Screen (L3)

**Background:** a tilted (−8°) grid of the server's posters at 2:3, radius 12, drifting slowly upward (60 s loop) at 38 % opacity under a radial dark shade. It is static with reduced motion. With no posters, it is a plain dark background.

**Top-left:** the Jellyfin logo, the server name, and "Jellyfin" in small text.

**Centre card:** 560 px wide, radius 30, padding 38/40/30. Its states:

1. **Profiles** (the server shows users)
   - "Who's watching?" above a 4-across grid of 80 px round avatars with names.
   - Avatars show the user's picture if `PrimaryImageTag` is set. Otherwise they show the initial on a solid colour derived from the name (stable per user).
   - Below the grid: "Other user" and "Quick Connect" (the latter only when `/QuickConnect/Enabled`).
   - Arrow keys move focus between profiles and Enter picks.
2. **Password step**
   - The avatar (92 px) and the name.
   - The password field: lock icon, a show/hide eye, and focus on open.
   - A white **Sign in** button, "Stay signed in" (mirrors `.chkRememberLogin`), "Forgot password?", and "Other profiles".
   - Enter signs in.
3. **Manual form:** user name and password, then the same buttons as the password step. This is the first state when the server hides users, and there "Other profiles" is not shown.
4. **Quick Connect**
   - The 6-digit code in six boxes, parsed from the stock dialog text.
   - "On a device where you're signed in, open your profile → Quick Connect and enter this code".
   - "Waiting for approval…" with a spinner, and "Back", which closes the stock dialog through `history.back()`.
5. **Forgot password**
   - User name, then Send.
   - Jellyfin's answer appears inside the card as its message text, taken from the stock alert, which stays hidden.
   - When Jellyfin asks for the PIN, a PIN field appears, driving the stock PIN page.
   - "Back" returns to the sign-in.

**Errors:** a stock toast during a Tide sign-in is hidden. Its text shows in red under the field, and the field shakes once (transform).

**Busy state:** the Sign in button shows a spinner and is disabled until the stock page navigates away or shows an error (timeout 15 s, then the error "Couldn't reach the server").

**Optional rows:** the disclaimer shows as small grey text at the bottom of the card when the stock one has text. "Change server" is a link only when stock shows `.btnSelectServer`.

**State motion:** content swaps fade in with a 8 px upward slide (.45 s).

**Phone (< 700 px):** the card takes the full width minus 16 px margins, with a 3-across grid. The wall stays.

## 3. Server: `/Tide/Login`

- **Access:** `[AllowAnonymous]`. When `EnableLogin` is false it returns `{ enabled: false }`.
- **Posters:**
  - Up to 40 random Movie and Series items that have a Primary image, from all libraries.
  - Items rated for adults (inherited parental rating value of 18 or more) are excluded.
  - Only `id` and the Primary image `tag` are sent: no titles and no other metadata.
- **Caching:** the list is cached in memory for 30 minutes.
- **Server name:** from the server configuration.

## 4. Switch profile (signed in)

**Menu item:** when the stock user menu (top-bar avatar button, MUI menu) opens, Tide inserts **"Switch profile"** right after the first item. The overlay is a dim scrim with "Switch profile":

- the `/Users/Public` profiles, with the current user marked "CURRENT";
- "Other user";
- "Cancel".

If the server hides users, it shows the user-name and password form only.

**Picking a profile:** the password step appears in the overlay, styled like the login card.

**Sign in:**
1. Tide verifies the password with `POST /Users/AuthenticateByName` under a separate one-time device id (`tide-switch-<random>`). This leaves the current session's token alone; re-authenticating with the same device id would revoke it.
2. Tide immediately ends that verification session with `POST /Sessions/Logout`.
3. **Wrong password:** an inline error, and you stay signed in.
4. **Right password:** Tide keeps `{ name, password, remember }` in memory only and triggers the stock sign-out (the user menu's "Sign out" item).
5. On the stock login page, the login takeover finds the pending switch. It shows a "Signing in as Mila…" card and fills and submits the stock manual form. The pending switch is cleared whether that succeeds or fails.

**Cancel:** closes the overlay and nothing changes.

## Testing

**Unit (vitest):**
- **Login screen:**
  - state machine (profiles, password, manual, Quick Connect, forgot, PIN);
  - avatar colour and initial;
  - poster wall from config;
  - reduced motion;
  - keyboard.
- **Stock driver** (fake `#loginPage` DOM):
  - pick a card and fill and submit the form;
  - remember checkbox;
  - toast to inline error;
  - Quick Connect code parsing and closing;
  - forgot-password message and PIN.
- **Boot:**
  - it mounts only on login routes when `enabled`;
  - it stays out when disabled or on failure;
  - it unmounts on leaving.
- **Switch profile:**
  - menu injection;
  - verify with a separate device id, then logout;
  - wrong password keeps the session;
  - the pending switch is consumed once.

**Server (xUnit):** the poster picker filters adult ratings, items without images and the limit. The login endpoint DTO, including the disabled case.

**End-to-end (local 12.4, test profiles `mila` with a password and `noah` without):**
- the profiles appear over the poster wall;
- a wrong password shows the inline error;
- `mila` signs in to Home;
- the manual form works for `tide`;
- the Quick Connect code shows as six boxes;
- the Forgot password message shows in the card;
- Switch profile from Home to `mila` (wrong password first, then right);
- with `EnableLogin` off, the stock page is unchanged.

## Out of scope

Library browse and the admin dashboard (their own sessions), multi-server management beyond the stock "Change server" link, and user creation.
