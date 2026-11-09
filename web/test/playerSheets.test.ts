import { createSettingsSheet, streamsToSheet } from '../src/player/settingsSheet';
import { createShelf } from '../src/player/shelf';

beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' }; });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

test('streamsToSheet lists audio and subtitles with labels', () => {
  const d = streamsToSheet({ Id: 'e', Name: 'E', Type: 'Episode', MediaSources: [{ Id: 'm', MediaStreams: [
    { Type: 'Video', Codec: 'hevc' }, { Type: 'Audio', Index: 1, DisplayTitle: 'English - Dolby Digital+ - 5.1 - Default', Language: 'eng' } as any,
    { Type: 'Audio', Index: 2, DisplayTitle: 'Dutch - AAC - Stereo', Language: 'dut' } as any,
    { Type: 'Subtitle', Index: 3, DisplayTitle: 'English - SDH', Language: 'eng' } as any] }] });
  expect(d.audio).toEqual([{ index: 1, label: 'English', sub: 'Dolby Digital+ · 5.1' }, { index: 2, label: 'Dutch', sub: 'AAC · Stereo' }]);
  expect(d.subtitles).toEqual([{ index: 3, label: 'English', sub: 'SDH' }]);
});

test('sheet: three columns, picks call back and mark current, stays open', () => {
  const picks: string[] = [];
  const s = createSettingsSheet((k, v) => picks.push(`${k}=${v}`), () => {});
  document.body.append(s.el);
  s.setData({ audio: [{ index: 1, label: 'English', sub: '5.1' }, { index: 2, label: 'Dutch', sub: 'Stereo' }], subtitles: [{ index: 3, label: 'English', sub: '' }],
    audioIndex: 1, subtitleIndex: null, quality: ['Auto', '1080p'], qualityCur: 'Auto', speed: 1, subSize: 'M' });
  s.open();
  expect(s.isOpen()).toBe(true);
  const audio = [...s.el.querySelectorAll<HTMLElement>('[data-kind="audio"]')];
  expect(audio.map((a) => a.classList.contains('on'))).toEqual([true, false]);
  audio[1]!.click();
  expect(picks).toEqual(['audio=2']);
  expect(audio[1]!.classList.contains('on')).toBe(true);
  s.el.querySelector<HTMLElement>('[data-kind="subtitles"][data-value="-1"]')!.click();
  s.el.querySelector<HTMLElement>('[data-kind="speed"][data-value="1.5"]')!.click();
  s.el.querySelector<HTMLElement>('[data-kind="quality"][data-value="1080p"]')!.click();
  expect(picks).toEqual(['audio=2', 'subtitles=-1', 'speed=1.5', 'quality=1080p']);
  expect(s.isOpen()).toBe(true);
  s.close();
  expect(s.isOpen()).toBe(false);
});

test('shelf opens the current season with NOW PLAYING and no synopsis', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/Seasons')) return new Response(JSON.stringify({ Items: [{ Id: 's1', Name: 'Season 1', Type: 'Season', IndexNumber: 1, ChildCount: 2 }] }));
    if (u.includes('/Episodes')) return new Response(JSON.stringify({ Items: [
      { Id: 'a', Name: 'A', Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 1, IndexNumber: 1, Overview: 'x' },
      { Id: 'b', Name: 'B', Type: 'Episode', SeriesId: 'ser', ParentIndexNumber: 1, IndexNumber: 2, Overview: 'y' }] }));
    return new Response(JSON.stringify({ Id: 'b', Name: 'B', Type: 'Episode', ParentIndexNumber: 1 }));
  });
  const changes: boolean[] = [];
  const sh = createShelf((o) => changes.push(o));
  document.body.append(sh.el);
  await sh.setEpisode('ser', 'b');
  sh.open();
  expect(sh.isOpen()).toBe(true);
  expect(sh.el.querySelector('[data-id="b"] .tide-wide-tag')?.textContent).toBe('NOW PLAYING');
  expect(sh.el.querySelector('.tide-wide-syn')).toBeNull();
  sh.close();
  expect(changes).toEqual([true, false]);
});

test('subtitle labels: unknown language uses title or Track N, codec names are readable, forced/SDH marked', () => {
  const d = streamsToSheet({ Id: 'e', Name: 'E', Type: 'Episode', MediaSources: [{ Id: 'm', MediaStreams: [
    { Type: 'Subtitle', Index: 3, DisplayTitle: 'Undefined - PGSSUB', Codec: 'PGSSUB' },
    { Type: 'Subtitle', Index: 4, DisplayTitle: 'Undefined - PGSSUB', Title: 'Commentary', Codec: 'PGSSUB' },
    { Type: 'Subtitle', Index: 5, DisplayTitle: 'English - SUBRIP - Forced', Codec: 'subrip', IsForced: true },
    { Type: 'Subtitle', Index: 6, DisplayTitle: 'Dutch - PGSSUB', Codec: 'PGSSUB', IsHearingImpaired: true }] }] });
  expect(d.subtitles).toEqual([
    { index: 3, label: 'Track 1', sub: 'PGS' },
    { index: 4, label: 'Commentary', sub: 'PGS' },
    { index: 5, label: 'English', sub: 'SRT · Forced' },
    { index: 6, label: 'Dutch', sub: 'PGS · SDH' }]);
});

test('settings sheet keeps its DOM (focus, hover) when the same data arrives again', async () => {
  const { createSettingsSheet } = await import('../src/player/settingsSheet');
  const sheet = createSettingsSheet(() => {}, () => {});
  const d = { audio: [{ index: 1, label: 'English', sub: '' }], subtitles: [], audioIndex: 1, subtitleIndex: null, quality: ['Auto'], qualityCur: 'Auto', speed: 1, subSize: 'M' as const };
  sheet.setData(d);
  const first = sheet.el.querySelector('[data-kind="audio"]');
  sheet.setData({ ...d });
  expect(sheet.el.querySelector('[data-kind="audio"]')).toBe(first);
  sheet.setData({ ...d, speed: 2 });
  expect(sheet.el.querySelector('[data-kind="audio"]')).not.toBe(first);
});

test('audio labels: no language/title shows "Track N" with the codec, muxer handler names are not titles', () => {
  const d = streamsToSheet({ Id: 'm', Name: 'M', Type: 'Movie', MediaSources: [{ Id: 'm', MediaStreams: [
    { Type: 'Audio', Index: 1, DisplayTitle: 'AAC - Stereo - Default', Codec: 'aac', Language: 'und' },
    { Type: 'Audio', Index: 2, DisplayTitle: 'SoundHandler - AAC - Stereo - Default', Title: 'SoundHandler', Codec: 'aac', Language: 'und' },
    { Type: 'Audio', Index: 3, DisplayTitle: 'English - AAC - Stereo - Default', Codec: 'aac', Language: 'eng' },
    { Type: 'Audio', Index: 4, DisplayTitle: 'Director’s commentary - English - AC3 - Stereo', Title: 'Director’s commentary', Codec: 'ac3', Language: 'eng' }] }] } as never);
  expect(d.audio.map((a) => [a.label, a.sub])).toEqual([
    ['Track 1', 'AAC · Stereo'],
    ['Track 2', 'AAC · Stereo'],
    ['English', 'AAC · Stereo'],
    ['Director’s commentary', 'English · AC3 · Stereo']]);
});
