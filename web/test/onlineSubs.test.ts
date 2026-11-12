import { loadOnlineSubs, matchCulture } from '../src/player/onlineSubs';

const CULTURES = [
  { Name: 'English', DisplayName: 'English', TwoLetterISOLanguageName: 'en', ThreeLetterISOLanguageName: 'eng', ThreeLetterISOLanguageNames: ['eng'] },
  { Name: 'Dutch', DisplayName: 'Dutch', TwoLetterISOLanguageName: 'nl', ThreeLetterISOLanguageName: 'dut', ThreeLetterISOLanguageNames: ['dut', 'nld'] },
  { Name: 'French', DisplayName: 'French', TwoLetterISOLanguageName: 'fr', ThreeLetterISOLanguageName: 'fre', ThreeLetterISOLanguageNames: ['fre', 'fra'] },
];
let itemStreams: number[][] = [];
function mock(cap: { canSearch: boolean; providers: string[] }, pref = 'dut') {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const u = String(url);
    calls.push(`${(init as RequestInit | undefined)?.method ?? 'GET'} ${u.replace('http://jf', '')}`);
    if (u.includes('/Tide/Subtitles/Capability')) return new Response(JSON.stringify(cap));
    if (u.includes('/Localization/Cultures')) return new Response(JSON.stringify(CULTURES));
    if (u.includes('/Users/u')) return new Response(JSON.stringify({ Configuration: { SubtitleLanguagePreference: pref } }));
    if (u.includes('/RemoteSearch/Subtitles/') && (init as RequestInit | undefined)?.method === 'POST') return new Response('');
    if (u.includes('/RemoteSearch/Subtitles/')) return new Response(JSON.stringify([
      { Id: 'os-1', Name: 'Silo.S03E01.1080p.WEB', Format: 'srt', ProviderName: 'Open Subtitles', DownloadCount: 1200 },
      { Id: 'os-2', Name: 'Silo S03E01 hearing impaired', Format: 'srt', ProviderName: 'Open Subtitles', DownloadCount: 30 }]));
    if (u.includes('/Items/e1')) {
      const idx = itemStreams.shift() ?? [3];
      return new Response(JSON.stringify({ Id: 'e1', Name: 'E', Type: 'Episode', MediaSources: [{ Id: 'm', MediaStreams: idx.map((i) => ({ Type: 'Subtitle', Index: i })) }] }));
    }
    return new Response('{}');
  });
  return calls;
}
beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' }; });
afterEach(() => vi.restoreAllMocks());

test('matchCulture: codes, names, prefixes; nothing for one letter or unknown', () => {
  expect(matchCulture(CULTURES, 'nl')).toEqual({ code: 'dut', name: 'Dutch' });
  expect(matchCulture(CULTURES, 'NLD')).toEqual({ code: 'dut', name: 'Dutch' });
  expect(matchCulture(CULTURES, 'english')).toEqual({ code: 'eng', name: 'English' });
  expect(matchCulture(CULTURES, 'fren')).toEqual({ code: 'fre', name: 'French' });
  expect(matchCulture(CULTURES, 'e')).toBeNull();
  expect(matchCulture(CULTURES, 'silo')).toBeNull();
});

test('no capability: null (the menu shows no online part)', async () => {
  mock({ canSearch: false, providers: [] });
  expect(await loadOnlineSubs('e1')).toBeNull();
});

test('default language from the user preference; search maps and filters results', async () => {
  const calls = mock({ canSearch: true, providers: ['Open Subtitles'] });
  const o = (await loadOnlineSubs('e1'))!;
  expect(o.providers).toEqual(['Open Subtitles']);
  expect(o.defaultLang).toEqual({ code: 'dut', name: 'Dutch' });
  const all = await o.search('eng');
  expect(all[0]).toEqual({ id: 'os-1', name: 'Silo.S03E01.1080p.WEB', format: 'SRT', provider: 'Open Subtitles', downloads: 1200 });
  expect(calls.some((c) => c.startsWith('GET /Items/e1/RemoteSearch/Subtitles/eng?isPerfectMatch=false'))).toBe(true);
  expect((await o.search('eng', 'hearing')).map((r) => r.id)).toEqual(['os-2']);
  expect(await o.resolveLang('french')).toEqual({ code: 'fre', name: 'French' });
});

test('download: POST, then wait for the new subtitle stream and return its index', async () => {
  const calls = mock({ canSearch: true, providers: ['Open Subtitles'] });
  itemStreams = [[3], [3], [3, 7]];
  const o = (await loadOnlineSubs('e1', { sleep: async () => {} }))!;
  expect(await o.download({ id: 'os-1', name: '', format: 'SRT', provider: '', downloads: 0 })).toBe(7);
  expect(calls).toContain('POST /Items/e1/RemoteSearch/Subtitles/os-1');
});

test('download: gives up after DOWNLOAD_WAIT_MS when no new stream appears', async () => {
  mock({ canSearch: true, providers: ['Open Subtitles'] });
  itemStreams = [];
  let t = 0;
  const o = (await loadOnlineSubs('e1', { now: () => t, sleep: async () => { t += 4000; } }))!;
  await expect(o.download({ id: 'os-1', name: '', format: '', provider: '', downloads: 0 })).rejects.toThrow('did not appear');
});
