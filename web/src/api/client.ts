export interface Session { server: string; token: string; userId: string }

interface JfApiClient { serverAddress(): string; accessToken(): string; getCurrentUserId(): string; deviceId?(): string }

export function jfApiClient(): JfApiClient | null {
  return (window as unknown as { ApiClient?: JfApiClient }).ApiClient ?? null;
}

export function getSession(): Session | null {
  try {
    const c = jfApiClient();
    if (!c || typeof c.accessToken !== 'function') return null;
    const token = c.accessToken();
    if (!token) return null;
    return { server: c.serverAddress().replace(/\/$/, ''), token, userId: c.getCurrentUserId() };
  } catch {
    return null; // ApiClient mid-(re)initialisation
  }
}

/**
 * Resolve once jellyfin-web has a logged-in ApiClient.
 * - `window.ApiClient` never appears within `timeoutMs`: not jellyfin-web (or broken) -> resolve null.
 * - `ApiClient` exists but has no token (login page): keep waiting with a cheap 1 s poll plus hashchange/popstate,
 *   because jellyfin-web logs in without a page reload.
 */
export function waitForSession(timeoutMs = 10000): Promise<Session | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const finish = (s: Session | null) => {
      done = true;
      clearTimeout(timer);
      window.removeEventListener('hashchange', check);
      window.removeEventListener('popstate', check);
      resolve(s);
    };
    function check(): void {
      if (done) return;
      const s = getSession();
      if (s) return finish(s);
      const hasClient = !!jfApiClient();
      if (!hasClient && Date.now() - started >= timeoutMs) return finish(null);
      clearTimeout(timer);
      // Poll fast at first: on a normal load ApiClient appears, then gets its token a few hundred ms later, and Tide's
      // start (and the cloak) waits on that. A 1 s poll there cost up to a second on every app open. After 5 s we
      // are on the login page: back off.
      timer = setTimeout(check, Date.now() - started < 5000 ? 50 : hasClient ? 1000 : 250);
    }
    window.addEventListener('hashchange', check);
    window.addEventListener('popstate', check);
    check();
  });
}

/** Tide's own server base, from the client.js URL (".../Tide/client.js"): works behind a base URL too. */
const scriptServer: string | null = (() => {
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src ?? '';
    const m = src.match(/^(.*)\/Tide\/client\.js(\?.*)?$/);
    return m ? m[1]! : null;
  } catch { return null; }
})();

/**
 * The session jellyfin-web will restore, read from its stored credentials before its ApiClient is up (that takes
 * seconds on a cold load). Only used to start requests early; anything it fetched is keyed by user, so a stale or
 * different login just misses the cache.
 */
export function earlySession(): Session | null {
  try {
    if (!scriptServer) return null;
    const c = JSON.parse(localStorage.getItem('jellyfin_credentials') ?? 'null') as { Servers?: { AccessToken?: string; UserId?: string; DateLastAccessed?: number }[] } | null;
    const s = (c?.Servers ?? []).filter((x) => x.AccessToken && x.UserId).sort((a, b) => (b.DateLastAccessed ?? 0) - (a.DateLastAccessed ?? 0))[0];
    return s ? { server: scriptServer, token: s.AccessToken!, userId: s.UserId! } : null;
  } catch {
    return null;
  }
}

/** The live session, else the early one. */
export function anySession(): Session | null {
  return getSession() ?? earlySession();
}

/** The Jellyfin server base before anyone is signed in (login page): Tide's script URL, else jellyfin-web's ApiClient. */
export function serverBase(): string {
  return (scriptServer ?? jfApiClient()?.serverAddress?.() ?? location.origin).replace(/\/$/, '');
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function api<T>(path: string, opts: { method?: string; query?: Query; body?: unknown; timeoutMs?: number; session?: Session | null; signal?: AbortSignal } = {}): Promise<T> {
  const s = opts.session ?? getSession();
  if (!s) throw new Error('No Jellyfin session');
  const ctrl = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
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

export function imageUrl(id: string, type: string, maxWidth: number, tag?: string): string {
  return `${anySession()?.server ?? ''}/Items/${id}/Images/${type}?maxWidth=${maxWidth}&quality=88${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`;
}

export function streamUrl(id: string): string {
  const s = getSession();
  return `${s?.server ?? ''}/Videos/${id}/stream?static=true&ApiKey=${encodeURIComponent(s?.token ?? '')}`;
}
