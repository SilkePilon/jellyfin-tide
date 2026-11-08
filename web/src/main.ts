import { waitForSession } from './api/client';
import { getClientConfig } from './api/tide';
import type { ClientConfig } from './types';
import { initTheme } from './theme/index';
import { initSmoothScroll } from './theme/smoothScroll';
import { initIcons } from './icons/swap';
import { initRouter, registerTakeover } from './router/hook';
import { DETAILS_TAKEOVER } from './details/details';
import { initTabbar } from './mobile/tabbar';

export const TIDE_VERSION = '0.2.0';

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

registerFeature(initTheme);
registerFeature((cfg) => { if (cfg.enableTheme) initSmoothScroll(cfg); });
registerFeature(initIcons);
registerTakeover(DETAILS_TAKEOVER);
registerFeature((cfg) => void initRouter(cfg));
registerFeature(() => void initTabbar());

if (typeof window !== 'undefined' && !(window as unknown as { __TIDE_TEST__?: boolean }).__TIDE_TEST__) {
  void boot();
}
