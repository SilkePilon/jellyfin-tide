# jellyfin-web 12.4 Modern layout: DOM facts

Recorded by `e2e/discover.mjs` against `jellyfin/jellyfin:12.4.20261026-211555` (server reports `Version: 12.4.0`),
logged in as `tide` on the home route, viewport 1440x900. Raw output: `docs/notes/web-12.4-dom.json`.

## Selectors (web/src/router/selectors.ts)

- `homeHost: '#indexPage.homePage'` matches `div#indexPage.page.mainAnimatedPage.homePage.libraryPage...`, whose
  children are `#homeTab` (holds `.sections.homeSectionsContainer`) and `#favoritesTab`. Ancestry:
  `.section0 > .homeSectionsContainer > #homeTab > #indexPage > div > .skinBody (2nd child of main) > main`.
  The app bar is neither inside `main` nor inside `#indexPage`, so hiding `#indexPage`'s children hides only the home content.
  `#indexPage` is removed from the DOM when you navigate away (checked on `#/movies`), so query it again on each home visit.
  The old default `main, [role="main"], .mainAnimatedPages` was wrong. `main` comes first, and its children include
  `.mainAnimatedPages` (legacy pages such as `#loginPage`) and the React `.skinBody`.
- `appBar: '.MuiAppBar-root'` matches `header.MuiPaper-root.MuiAppBar-root.MuiAppBar-positionFixed...`. It sits outside `main`.
- `legacyHeader: '.skinHeader'` is present (`skinHeader: true`).
- `ROUTING.hashRouting: true`: the URL after login is `http://localhost:8096/web/#/home`.
- Globals: `window.ApiClient` is an object with `serverAddress`, `accessToken`, `getCurrentUserId`, `serverId` (all functions).
  `Emby` and `Dashboard` are objects. `playbackManager` and `appRouter` are **undefined** on `window`.

## Raw JSON

```json
{
  "url": "http://localhost:8096/web/#/home",
  "hasApiClient": "object",
  "apiClientFns": [
    "serverAddress:function",
    "accessToken:function",
    "getCurrentUserId:function",
    "serverId:function"
  ],
  "globals": [
    "playbackManager:undefined",
    "Emby:object",
    "appRouter:undefined",
    "Dashboard:object"
  ],
  "appBar": "header#.MuiPaper-root.MuiPaper-elevation.MuiPaper-elevation0.MuiAppBar-root.MuiAppBar-colorTransparent.MuiAppBar-positionFixed.mui-fixed.css-1u7mpsp",
  "skinHeader": true,
  "main": "main#.MuiBox-root.css-1iogify",
  "homeCandidates": [
    "#indexPage:true",
    ".homePage:true",
    "[data-testid=home]:false",
    ".homeSectionsContainer:true",
    ".sections:true"
  ],
  "mainChildren": [
    "div#.mainAnimatedPages.skinBody",
    "div#.skinBody"
  ],
  "muiIconTestIds": [
    "FavoriteIcon",
    "MovieIcon",
    "TvIcon",
    "GroupsIcon",
    "CastIcon",
    "SearchIcon",
    "PersonIcon",
    "GroupAddIcon",
    "SettingsRemoteIcon",
    "CloseIcon",
    "AccountCircleIcon",
    "SettingsIcon",
    "DashboardIcon",
    "EditIcon",
    "PhonelinkLockIcon",
    "LogoutIcon"
  ],
  "hashRouting": true,
  "homeAncestry": [
    "div#.verticalSection.section0.emby-scroller-container",
    "div#.sections.homeSectionsContainer",
    "div#homeTab.tabContent.pageTabContent.is-active",
    "div#indexPage.page.mainAnimatedPage.homePage.libraryPage.allLibraryPage.pageWithAbsoluteTabs.withTabs",
    "div#.",
    "div#.skinBody",
    "main#.MuiBox-root.css-1iogify"
  ],
  "indexPageChildren": [
    "div#homeTab.tabContent.pageTabContent.is-active",
    "div#favoritesTab.tabContent.pageTabContent"
  ],
  "mainAnimatedPagesChildren": [
    "div#loginPage.page.standalonePage.backdropPage.mainAnimatedPage.hide"
  ],
  "appBarInsideMain": false,
  "appBarInsideIndexPage": false,
  "fontIcons": [
    "material-icons.navMenuOptionIcon.home",
    "material-icons.navMenuOptionIcon.movie",
    "material-icons.navMenuOptionIcon.tv",
    "material-icons.navMenuOptionIcon.dashboard",
    "material-icons.navMenuOptionIcon.mode_edit",
    "material-icons.navMenuOptionIcon.settings",
    "material-icons.navMenuOptionIcon.exit_to_app",
    "material-icons.arrow_back",
    "material-icons.home",
    "material-icons.menu",
    "material-icons.groups",
    "material-icons.music_note",
    "material-icons.cast",
    "material-icons.search",
    "material-icons.person",
    "material-icons.checkboxIcon.checkboxIcon-checked.check",
    "material-icons.checkboxIcon.checkboxIcon-unchecked",
    "material-icons.chevron_left",
    "material-icons.chevron_right",
    "cardImageIcon.material-icons.movie",
    "material-icons.cardOverlayButtonIcon.cardOverlayButtonIcon-hover.more_vert",
    "cardImageIcon.material-icons.tv",
    "material-icons.cardOverlayButtonIcon.cardOverlayButtonIcon-hover.play_arrow",
    "material-icons.cardOverlayButtonIcon.cardOverlayButtonIcon-hover.check.playstatebutton-icon-unplayed",
    "material-icons.cardOverlayButtonIcon.cardOverlayButtonIcon-hover.favorite"
  ],
  "afterNavToMovies": {
    "url": "http://localhost:8096/web/#/movies",
    "indexPagePresent": false,
    "indexPageHidden": null,
    "mainAnimatedPagesChildren": [
      "div#loginPage.page.standalonePage.backdropPage.mainAnimatedPage.hide"
    ]
  }
}
```
