import { api, getSession } from '../api/client';
import { getItem } from '../api/item';

export interface Lang { code: string; name: string }
export interface RemoteSub { id: string; name: string; format: string; provider: string; downloads: number }
export interface Culture { Name: string; DisplayName: string; TwoLetterISOLanguageName: string; ThreeLetterISOLanguageName: string; ThreeLetterISOLanguageNames?: string[] }
export interface OnlineSubs {
  providers: string[];
  /** The user's subtitle language preference, else the UI language, else English. */
  defaultLang: Lang;
  resolveLang(q: string): Promise<Lang | null>;
  search(code: string, nameFilter?: string): Promise<RemoteSub[]>;
  /** Downloads to the item and resolves with the new subtitle stream index. */
  download(sub: RemoteSub): Promise<number>;
}
export const DOWNLOAD_WAIT_MS = 10_000;

let cultures: Promise<Culture[]> | null = null;
const getCultures = () => (cultures ??= api<Culture[]>('/Localization/Cultures').catch((e) => { cultures = null; throw e; }));

export function matchCulture(list: Culture[], q: string): Lang | null {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return null;
  const lang = (c: Culture): Lang => ({ code: c.ThreeLetterISOLanguageName, name: c.DisplayName || c.Name });
  const exact = list.find((c) => [c.TwoLetterISOLanguageName, c.ThreeLetterISOLanguageName, ...(c.ThreeLetterISOLanguageNames ?? []), c.DisplayName, c.Name]
    .some((x) => x?.toLowerCase() === s));
  if (exact) return lang(exact);
  const prefix = list.find((c) => [c.DisplayName, c.Name].some((x) => x?.toLowerCase().startsWith(s)));
  return prefix ? lang(prefix) : null;
}

export async function loadOnlineSubs(itemId: string, opts: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}): Promise<OnlineSubs | null> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const cap = await api<{ canSearch: boolean; providers: string[] }>('/Tide/Subtitles/Capability', { query: { itemId } }).catch(() => null);
  if (!cap?.canSearch) return null;
  const list = await getCultures().catch(() => [] as Culture[]);
  const pref = await api<{ Configuration?: { SubtitleLanguagePreference?: string } }>(`/Users/${getSession()?.userId ?? ''}`)
    .then((u) => u?.Configuration?.SubtitleLanguagePreference ?? '').catch(() => '');
  const ui = (typeof navigator !== 'undefined' ? navigator.language : 'en').split('-')[0] ?? 'en';
  const defaultLang = (pref ? matchCulture(list, pref) : null) ?? matchCulture(list, ui) ?? { code: 'eng', name: 'English' };
  const subtitleIndexes = async () => new Set(((await getItem(itemId)).MediaSources?.[0]?.MediaStreams ?? [])
    .filter((s) => s.Type === 'Subtitle').map((s) => s.Index ?? -1));
  return {
    providers: cap.providers,
    defaultLang,
    async resolveLang(q) { return matchCulture(await getCultures().catch(() => list), q); },
    async search(code, nameFilter) {
      type R = { Id: string; Name?: string; Format?: string; ProviderName?: string; DownloadCount?: number };
      const r = await api<R[]>(`/Items/${itemId}/RemoteSearch/Subtitles/${encodeURIComponent(code)}`, { query: { isPerfectMatch: false }, timeoutMs: 30_000 });
      const f = nameFilter?.trim().toLowerCase();
      return (r ?? [])
        .map((x) => ({ id: x.Id, name: x.Name ?? '', format: (x.Format ?? '').toUpperCase(), provider: x.ProviderName ?? '', downloads: x.DownloadCount ?? 0 }))
        .filter((x) => !f || x.name.toLowerCase().includes(f));
    },
    async download(sub) {
      const before = await subtitleIndexes();
      await api(`/Items/${itemId}/RemoteSearch/Subtitles/${encodeURIComponent(sub.id)}`, { method: 'POST', timeoutMs: 30_000 });
      const t0 = now();
      while (now() - t0 < DOWNLOAD_WAIT_MS) {
        const added = [...(await subtitleIndexes())].find((i) => !before.has(i));
        if (added !== undefined) return added;
        await sleep(1000);
      }
      throw new Error('downloaded subtitle did not appear');
    },
  };
}
