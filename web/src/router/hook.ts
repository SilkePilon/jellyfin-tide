import { mountHome } from '../home/home';
import { ROUTES, SELECTORS, WEB_VERIFIED_VERSION } from './selectors';
import { onLocationChange } from './location';
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
  const c = (window as unknown as { ApiClient?: { getCurrentUser?(): Promise<{ Policy?: { IsAdministrator?: boolean } }> } }).ApiClient;
  const user = await c?.getCurrentUser?.().catch(() => null);
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

const nextFrame = (cb: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb);
  else setTimeout(cb, 16);
};

/**
 * Mounts Tide home whenever the home route is active. jellyfin-web 12.4 removes `#indexPage` when leaving home and
 * recreates it on return (and may replace it while on home), so the host is re-queried on every visit and a body
 * MutationObserver remounts when our root is detached. Returns a disposer (used by tests).
 */
export function initRouter(cfg: ClientConfig): () => void {
  let unmount: (() => void) | null = null;
  let mountedHost: HTMLElement | null = null;
  let mounting = false;
  let warned = false;
  let scheduled = false;
  let disposed = false;
  /** Hosts whose mount threw: never retried (a recreated #indexPage is a new element and gets a fresh attempt). */
  const failedHosts = new WeakSet<HTMLElement>();

  const mountedOk = () => !!(unmount && mountedHost?.isConnected && mountedHost.querySelector(':scope > .tide-home'));

  function teardown(): void {
    const u = unmount;
    unmount = null;
    mountedHost = null;
    u?.();
  }

  async function sync(): Promise<void> {
    if (disposed) return;
    if (!shouldTakeOver(cfg)) {
      teardown();
      return;
    }
    if (mounting) return;
    if (unmount) {
      if (mountedOk()) return;
      teardown(); // host replaced or our root wiped: remount below
    }
    mounting = true;
    try {
      let host = findHost();
      for (let i = 0; !host && i < 20 && shouldTakeOver(cfg) && !disposed; i++) {
        await new Promise((r) => setTimeout(r, 250));
        host = findHost();
      }
      if (!shouldTakeOver(cfg) || disposed) return;
      if (host && failedHosts.has(host)) return;
      if (!host) {
        if (!warned) {
          console.warn(`[Tide] home host not found; Tide verified for web ${WEB_VERIFIED_VERSION}. Keeping stock home.`);
          void adminToast(`Tide home is off: this Jellyfin web version is not verified (Tide supports ${WEB_VERIFIED_VERSION}). Theme stays on.`);
        }
        warned = true;
        return;
      }
      let u: () => void;
      try {
        u = await mountHome(host, cfg);
      } catch (e) {
        failedHosts.add(host);
        console.error('[Tide] home mount failed, keeping stock home', e);
        return;
      }
      if (disposed || !shouldTakeOver(cfg) || !host.isConnected) {
        u(); // route changed or host replaced while loading
      } else {
        unmount = u;
        mountedHost = host;
      }
    } finally {
      mounting = false;
    }
    schedule(); // state may have changed while we were mounting
  }

  const canTry = (host: HTMLElement | null) => !!host && !failedHosts.has(host);

  function schedule(): void {
    if (scheduled || disposed) return;
    scheduled = true;
    nextFrame(() => {
      scheduled = false;
      if (mounting || disposed) return;
      const onHome = shouldTakeOver(cfg);
      if (unmount ? !onHome || !mountedOk() : onHome && canTry(findHost())) void sync();
    });
  }

  const onNav = () => void sync();
  const unsubscribe = onLocationChange(onNav);
  const obs = new MutationObserver(() => schedule());
  obs.observe(document.body, { childList: true, subtree: true });
  void sync();

  return () => {
    disposed = true;
    obs.disconnect();
    unsubscribe();
    teardown();
  };
}
