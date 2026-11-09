import { anySession } from './client';

/**
 * Short-lived in-memory cache for Home's requests. jellyfin-web unmounts Home on every navigation, so Home → details →
 * back used to refetch everything (skeleton rows, hero reloading). Within the TTL the same data renders at once.
 * Anything that changes what Home shows (play, watched, favourite, prefs, the player) calls invalidate().
 * Failed requests are dropped so the next visit retries.
 */
const store = new Map<string, { at: number; p: Promise<unknown>; done?: { v: unknown } }>();

export const HOME_TTL = 60_000;

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, now = Date.now()): Promise<T> {
  const k = `${anySession()?.userId ?? ''}:${key}`;
  const hit = store.get(k);
  if (hit && now - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = fn();
  const entry: { at: number; p: Promise<unknown>; done?: { v: unknown } } = { at: now, p };
  store.set(k, entry);
  p.then((v) => { entry.done = { v }; }, () => { if (store.get(k)?.p === p) store.delete(k); });
  return p;
}

/** The cached value if it has already resolved and is fresh: lets a view render synchronously (no skeleton frame). */
export function peek<T>(key: string, ttlMs: number, now = Date.now()): { v: T } | null {
  const hit = store.get(`${anySession()?.userId ?? ''}:${key}`);
  return hit?.done && now - hit.at < ttlMs ? (hit.done as { v: T }) : null;
}

export function invalidate(): void {
  store.clear();
}
