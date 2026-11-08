import { mountHome } from '../home/home';
import { ROUTES, SELECTORS, WEB_VERIFIED_VERSION } from './selectors';
import { onLocationChange } from './location';
import type { ClientConfig } from '../types';

export function shouldTakeOver(cfg: ClientConfig, loc: Location = location): boolean {
  return cfg.enableHome && ROUTES.isHome(loc);
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

export interface Takeover {
  id: string;
  /** Class of the root element mount() adds as a direct child of the host. */
  rootClass: string;
  matches(cfg: ClientConfig, loc: Location): boolean;
  /** Identity of what is shown (home: constant; details: item id). A change remounts even on the same host. */
  key(loc: Location): string;
  findHost(): HTMLElement | null;
  /** Resolve an unmount function, or null to decline (leave stock) for this host + key. */
  mount(host: HTMLElement, cfg: ClientConfig, loc: Location): Promise<(() => void) | null>;
}

export const HOME_TAKEOVER: Takeover = {
  id: 'home',
  rootClass: 'tide-home',
  matches: (cfg, loc) => shouldTakeOver(cfg, loc),
  key: () => 'home',
  findHost: () => document.querySelector<HTMLElement>(SELECTORS.homeHost),
  mount: (host, cfg) => mountHome(host, cfg),
};

const extra: Takeover[] = [];
export function registerTakeover(t: Takeover): void {
  if (!extra.some((x) => x.id === t.id)) extra.push(t);
}

/**
 * Mounts a takeover whenever its route is active. jellyfin-web 12.4 removes / recreates / caches page hosts, so the
 * host is re-queried on every visit and a body MutationObserver remounts when our root is detached. A host whose
 * mount threw is never retried (a recreated host is a new element and gets a fresh attempt); a declined host + key
 * is skipped until the key or host changes.
 */
export function initTakeover(t: Takeover, cfg: ClientConfig): () => void {
  let unmount: (() => void) | null = null;
  let mountedHost: HTMLElement | null = null;
  let mountedKey = '';
  let mounting = false;
  let warned = false;
  let scheduled = false;
  let disposed = false;
  const failedHosts = new WeakSet<HTMLElement>();
  const declined = new WeakMap<HTMLElement, string>();
  const active = () => t.matches(cfg, location);

  const mountedOk = () => !!(unmount && mountedHost?.isConnected && mountedKey === t.key(location)
    && mountedHost.matches(':not(.hide)') && mountedHost.querySelector(`:scope > .${t.rootClass}`));
  const canTry = (host: HTMLElement | null) => !!host && !failedHosts.has(host) && declined.get(host) !== t.key(location);

  function teardown(): void {
    const u = unmount;
    unmount = null;
    mountedHost = null;
    mountedKey = '';
    u?.();
  }

  async function sync(): Promise<void> {
    if (disposed) return;
    if (!active()) { teardown(); return; }
    if (mounting) return;
    if (unmount) {
      if (mountedOk()) return;
      teardown();
    }
    mounting = true;
    try {
      let host = t.findHost();
      for (let i = 0; !host && i < 20 && active() && !disposed; i++) {
        await new Promise((r) => setTimeout(r, 250));
        host = t.findHost();
      }
      if (!active() || disposed) return;
      if (!host) {
        if (!warned) {
          console.warn(`[Tide] ${t.id} host not found; Tide verified for web ${WEB_VERIFIED_VERSION}. Keeping stock page.`);
          void adminToast(`Tide ${t.id} is off: this Jellyfin web version is not verified (Tide supports ${WEB_VERIFIED_VERSION}). Theme stays on.`);
        }
        warned = true;
        return;
      }
      if (!canTry(host)) return;
      const key = t.key(location);
      let u: (() => void) | null;
      try {
        u = await t.mount(host, cfg, location);
      } catch (e) {
        failedHosts.add(host);
        console.error(`[Tide] ${t.id} mount failed, keeping stock page`, e);
        return;
      }
      if (!u) { declined.set(host, key); return; }
      if (disposed || !active() || !host.isConnected || t.key(location) !== key) {
        u(); // route changed or host replaced while loading
      } else {
        unmount = u;
        mountedHost = host;
        mountedKey = key;
      }
    } finally {
      mounting = false;
    }
    schedule();
  }

  function schedule(): void {
    if (scheduled || disposed) return;
    scheduled = true;
    nextFrame(() => {
      scheduled = false;
      if (mounting || disposed) return;
      const on = active();
      if (unmount ? !on || !mountedOk() : on && canTry(t.findHost())) void sync();
    });
  }

  const unsubscribe = onLocationChange(() => void sync());
  const obs = new MutationObserver(() => schedule());
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  void sync();

  return () => {
    disposed = true;
    obs.disconnect();
    unsubscribe();
    teardown();
  };
}

export function initRouter(cfg: ClientConfig): () => void {
  const stops = [HOME_TAKEOVER, ...extra].map((t) => initTakeover(t, cfg));
  return () => stops.forEach((s) => s());
}
