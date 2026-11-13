import { earlySession, waitForSession } from './api/client';
import { getClientConfig } from './api/tide';
import type { ClientConfig } from './types';
import { initTheme } from './theme/index';
import { initSmoothScroll } from './theme/smoothScroll';
import { initScrollingState } from './theme/scrolling';
import { initIcons } from './icons/swap';
import { initRouter, registerTakeover } from './router/hook';
import { DETAILS_TAKEOVER } from './details/details';
import { initPlayLoading, PLAYER_TAKEOVER } from './player/player';
import { initTabbar } from './mobile/tabbar';
import { initSearch } from './search/index';
import { initLogin } from './login/index';
import { initSwitchProfile } from './login/switchProfile';
import { preloadFonts, readHint, release, releaseAll, saveHint, startBootCloak, wouldTakeOver } from './boot/cloak';
import { onLocationChange } from './router/location';
import { ROUTES } from './router/selectors';
import { homeData, prefetchHome } from './home/home';

export const TIDE_VERSION = '0.6.1';

export type Feature = (cfg: ClientConfig) => void;
const features: Feature[] = [];
export function registerFeature(f: Feature): void {
  features.push(f);
}

const CFG_KEY = 'tide:config';

function cachedConfig(): ClientConfig | null {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) ?? 'null') as ClientConfig | null; } catch { return null; }
}

/**
 * The config from the last visit lets Tide start without waiting for /Tide/ClientConfig (one round trip less before
 * anything Tide shows up). It is refreshed in the background; a changed config applies on the next load.
 */
async function loadConfig(): Promise<ClientConfig> {
  const fresh = getClientConfig().then((c) => {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch { /* storage blocked */ }
    saveHint({ home: c.enableHome, details: c.enableDetails !== false });
    return c;
  });
  const old = cachedConfig();
  if (old && old.version === TIDE_VERSION) {
    fresh.catch(() => { try { localStorage.removeItem(CFG_KEY); } catch { /* storage blocked */ } });
    return old;
  }
  return fresh;
}

export async function boot(): Promise<void> {
  // Leaving for a route Tide does not take over (login, a library...) ends the boot cloak at once.
  const stopWatch = onLocationChange(() => { if (!wouldTakeOver(readHint())) release('boot'); });
  try {
    const session = await waitForSession(10000);
    if (!session) { releaseAll(); return; } // stock UI untouched
    let cfg: ClientConfig;
    try {
      cfg = await loadConfig();
    } catch (e) {
      console.warn('[Tide] config unavailable, staying out of the way', e);
      releaseAll();
      return;
    }
    // On Home: start its data requests now, while jellyfin-web is still rendering the page.
    if (cfg.enableHome && ROUTES.isHome()) void homeData();
    await runFeatures(cfg);
  } finally {
    stopWatch();
    release('boot'); // the router holds the cloak itself while a takeover mounts
  }
}

async function runFeatures(cfg: ClientConfig): Promise<void> {
  document.body.classList.add('tide');
  for (const f of features) {
    try {
      f(cfg);
    } catch (e) {
      console.error('[Tide] feature failed', e);
    }
  }
}

registerFeature(initTheme);
registerFeature((cfg) => { if (cfg.enableTheme) initSmoothScroll(cfg); });
registerFeature(() => void initScrollingState());
registerFeature(initIcons);
registerTakeover(DETAILS_TAKEOVER);
registerTakeover(PLAYER_TAKEOVER);
registerFeature((cfg) => void initPlayLoading(cfg));
registerFeature((cfg) => void initRouter(cfg));
registerFeature(() => void initTabbar());
registerFeature((cfg) => void initSearch(cfg));
registerFeature((cfg) => void initSwitchProfile(cfg));

if (typeof window !== 'undefined' && !(window as unknown as { __TIDE_TEST__?: boolean }).__TIDE_TEST__) {
  startBootCloak();
  preloadFonts();
  // Before any session: Tide's sign-in screen on the stock login routes.
  initLogin();
  // Cold start on Home: start Home's data now with the stored login, not seconds later once jellyfin-web is up.
  const early = earlySession();
  if (early && readHint().home && ROUTES.isHome()) prefetchHome(early);
  void boot();
}
