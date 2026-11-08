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
      timer = setTimeout(check, hasClient ? 1000 : 250);
    }
    window.addEventListener('hashchange', check);
    window.addEventListener('popstate', check);
    check();
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
