import { serverBase } from '../api/client';

export interface LoginPoster { id: string; tag: string }
export interface LoginConfig { enabled: boolean; serverName: string | null; posters: LoginPoster[] }
export interface PublicUser { Id: string; Name: string; PrimaryImageTag?: string | null }
const CACHE = 'tide:login-config';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${serverBase()}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
  return (await r.json()) as T;
}

/** Anonymous Tide login data; cached for the tab (the posters stay the same while you sign in and out). */
export async function fetchLoginConfig(): Promise<LoginConfig | null> {
  try { const c = sessionStorage.getItem(CACHE); if (c) return JSON.parse(c) as LoginConfig; } catch { /* storage blocked */ }
  try {
    const c = await get<LoginConfig>('/Tide/Login');
    try { sessionStorage.setItem(CACHE, JSON.stringify(c)); } catch { /* storage blocked */ }
    return c;
  } catch {
    return null;
  }
}
export const publicUsers = (): Promise<PublicUser[]> => get<PublicUser[]>('/Users/Public').catch(() => []);
export const quickConnectEnabled = (): Promise<boolean> => get<boolean>('/QuickConnect/Enabled').catch(() => false);
export const posterUrl = (p: LoginPoster, w = 300): string =>
  `${serverBase()}/Items/${p.id}/Images/Primary?maxWidth=${w}&quality=80&tag=${encodeURIComponent(p.tag)}`;
export const userImageUrl = (u: Pick<PublicUser, 'Id' | 'PrimaryImageTag'>, w = 200): string | null =>
  u.PrimaryImageTag ? `${serverBase()}/Users/${u.Id}/Images/Primary?maxWidth=${w}&quality=90&tag=${encodeURIComponent(u.PrimaryImageTag)}` : null;
