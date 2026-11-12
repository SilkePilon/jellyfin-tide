import { trackLists } from '../src/player/tracks';

test('trackLists: audio and subtitles with readable labels', () => {
  const d = trackLists({ Id: 'e', Name: 'E', Type: 'Episode', MediaSources: [{ Id: 'm', MediaStreams: [
    { Type: 'Video', Codec: 'hevc' }, { Type: 'Audio', Index: 1, DisplayTitle: 'English - Dolby Digital+ - 5.1 - Default', Language: 'eng' },
    { Type: 'Audio', Index: 2, DisplayTitle: 'Dutch - AAC - Stereo', Language: 'dut' },
    { Type: 'Subtitle', Index: 3, DisplayTitle: 'Undefined - PGSSUB', Codec: 'PGSSUB' },
    { Type: 'Subtitle', Index: 5, DisplayTitle: 'English - SUBRIP - Forced', Codec: 'subrip', IsForced: true }] }] });
  expect(d.audio).toEqual([{ index: 1, label: 'English', sub: 'Dolby Digital+ · 5.1' }, { index: 2, label: 'Dutch', sub: 'AAC · Stereo' }]);
  expect(d.subtitles).toEqual([{ index: 3, label: 'Track 1', sub: 'PGS' }, { index: 5, label: 'English', sub: 'SRT · Forced' }]);
});

test('trackLists: no item, or session items with top-level MediaStreams', () => {
  expect(trackLists(null)).toEqual({ audio: [], subtitles: [] });
  const d = trackLists({ Id: 'e', Name: 'E', Type: 'Movie', MediaStreams: [{ Type: 'Subtitle', Index: 4, DisplayTitle: 'Dutch - SRT' }] } as any);
  expect(d.subtitles).toEqual([{ index: 4, label: 'Dutch', sub: 'SRT' }]);
});
