/** Single source of truth for jellyfin-web 12.4 Modern-layout DOM hooks. Update from docs/notes/web-12.4-dom.md. */
export const WEB_VERIFIED_VERSION = '12.4';

export const SELECTORS = {
  /**
   * Element whose children are the stock home page; Tide hides children and mounts beside them.
   * 12.4: the React home route renders `div#indexPage.homePage` (children: #homeTab, #favoritesTab) inside the
   * second `main > .skinBody`. It is outside the app bar and is unmounted when leaving home, so re-query it per visit.
   */
  homeHost: '#indexPage.homePage',
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
