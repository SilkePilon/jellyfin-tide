import { aboutFacts, castList, chooseNextUp, defaultSeason, episodeTag, epLabel, fileFacts, fmtBytes, nextInSeason, rowStartIndex, sortSeasons, subtitleSummary, youtubeId, yearSpan } from '../src/details/logic';
import type { JfItem } from '../src/types';

const s = (n: number, played = false, unplayed = 0): JfItem => ({ Id: `s${n}`, Name: n ? `Season ${n}` : 'Specials', Type: 'Season', IndexNumber: n, UserData: { Played: played, UnplayedItemCount: unplayed } });
const e = (n: number, o: Partial<JfItem> = {}): JfItem => ({ Id: `e${n}`, Name: `Ep ${n}`, Type: 'Episode', IndexNumber: n, ParentIndexNumber: 1, RunTimeTicks: 3e10, ...o });

test('seasons: specials last; default = hint, else next-up season, else first unwatched, else first', () => {
  const sorted = sortSeasons([s(0), s(1, true), s(2, false, 3), s(3, false, 10)]);
  expect(sorted.map((x) => x.IndexNumber)).toEqual([1, 2, 3, 0]);
  expect(defaultSeason(sorted, 3, null)).toBe(2);
  expect(defaultSeason(sorted, 9, null)).toBe(1); // bad hint ignored
  expect(defaultSeason(sorted, null, e(1, { ParentIndexNumber: 3 }))).toBe(2);
  expect(defaultSeason(sorted, null, null)).toBe(1);
  expect(defaultSeason(sortSeasons([s(1, true), s(2, true)]), null, null)).toBe(0);
  expect(defaultSeason(sortSeasons([s(0, false, 2), s(1, true)]), null, null)).toBe(0); // specials never default
});

test('next up: resume wins; tag and row start', () => {
  const r = e(4, { UserData: { PlaybackPositionTicks: 5 } });
  expect(chooseNextUp(r, e(5))).toBe(r);
  expect(chooseNextUp(null, e(5))?.Id).toBe('e5');
  expect(chooseNextUp(null, null)).toBeNull();
  const eps = [e(1, { UserData: { Played: true } }), e(2, { UserData: { Played: true } }), e(3), e(4)];
  expect(episodeTag(e(3), e(3))).toBe('UP NEXT');
  expect(episodeTag(e(3, { UserData: { PlaybackPositionTicks: 9 } }), e(3))).toBe('CONTINUE');
  expect(episodeTag(e(4), e(3))).toBeNull();
  expect(nextInSeason(eps, e(3))?.Id).toBe('e3');
  expect(nextInSeason(eps, null)?.Id).toBe('e3');
  expect(rowStartIndex(eps, e(3))).toBe(1);
  expect(rowStartIndex(eps.map((x) => ({ ...x, UserData: { Played: true } })), null)).toBe(0);
  expect(epLabel(e(1, { ParentIndexNumber: 3 }))).toBe('S3 E1');
});

test('formatting helpers', () => {
  expect(fmtBytes(80990828544)).toBe('75.4 GB');
  expect(fmtBytes(512 * 1024 * 1024)).toBe('512 MB');
  expect(fmtBytes(undefined)).toBeNull();
  expect(subtitleSummary(['English', 'Dutch', 'German', 'French', 'Spanish', 'Italian'])).toBe('English, Dutch +4');
  expect(subtitleSummary(['English', 'English', 'Dutch'])).toBe('English, Dutch');
  expect(youtubeId('https://www.youtube.com/watch?v=giXco2jaZ_4')).toBe('giXco2jaZ_4');
  expect(youtubeId('https://youtu.be/Klc__shdj88')).toBe('Klc__shdj88');
  expect(youtubeId('https://vimeo.com/1')).toBeNull();
  expect(yearSpan({ Id: 'x', Name: 'x', Type: 'Series', ProductionYear: 2008, Status: 'Ended', EndDate: '2015-02-18T00:00:00Z' })).toBe('2008–2015');
  expect(yearSpan({ Id: 'x', Name: 'x', Type: 'Series', ProductionYear: 2023, Status: 'Continuing' })).toBe('2023');
});

test('about facts skip empty values; movie vs series sets', () => {
  const movie = aboutFacts({
    Id: 'm', Name: 'M', Type: 'Movie', Genres: ['Action', 'Drama'], OfficialRating: 'PG-13', RunTimeTicks: 78145370000,
    PremiereDate: '2022-05-24T00:00:00Z', Studios: [{ Name: 'Paramount' }], People: [{ Id: 'p', Name: 'Joseph Kosinski', Type: 'Director' }],
  });
  expect(movie).toEqual([['Director', 'Joseph Kosinski'], ['Studio', 'Paramount'], ['Released', 'May 2022'], ['Rating', 'PG-13'], ['Genres', 'Action, Drama'], ['Runtime', '2h 10m']]);
  const series = aboutFacts({ Id: 's', Name: 'S', Type: 'Series', Status: 'Continuing', ChildCount: 3, Genres: ['Drama'] });
  expect(series).toEqual([['Status', 'Continuing'], ['Genres', 'Drama'], ['Seasons', '3']]);
});

test('file facts', () => {
  const f = fileFacts({
    Id: 'a', Size: 80990828544, MediaStreams: [
      { Type: 'Video', Codec: 'hevc', Profile: 'Main 10', Width: 3840, Height: 1608, VideoRangeType: 'HDR10' },
      { Type: 'Audio', DisplayTitle: 'Dolby TrueHD + Dolby Atmos - 7.1', IsDefault: true },
      { Type: 'Audio', DisplayTitle: 'Dolby Digital - 5.1' },
      { Type: 'Subtitle', Language: 'eng', DisplayTitle: 'English' }, { Type: 'Subtitle', Language: 'dut', DisplayTitle: 'Dutch' },
    ],
  });
  expect(f).toEqual([['Quality', '4K · HDR10'], ['Video', 'HEVC Main 10'], ['Audio', 'Dolby TrueHD + Dolby Atmos - 7.1'], ['Subtitles', 'English, Dutch'], ['Size on disk', '75.4 GB']]);
  expect(fileFacts(undefined)).toEqual([]);
  expect(fileFacts({ Id: 'b', MediaStreams: [{ Type: 'Audio', DisplayTitle: 'AAC - Stereo - Default' }] })).toEqual([['Audio', 'AAC - Stereo']]);

});

test('cast: 12 actors by default; expanded adds the rest then crew in role order', () => {
  const actors = Array.from({ length: 15 }, (_, i) => ({ Id: `a${i}`, Name: `A${i}`, Type: 'Actor', Role: `R${i}` }));
  const crew = [{ Id: 'w', Name: 'W', Type: 'Writer' }, { Id: 'p', Name: 'P', Type: 'Producer' }, { Id: 'd', Name: 'D', Type: 'Director' }, { Id: 'c', Name: 'C', Type: 'Creator' }, { Id: 'x', Name: 'X', Type: 'GuestStar' }];
  expect(castList([...crew, ...actors], false).map((p) => p.Id)).toEqual(actors.slice(0, 12).map((a) => a.Id));
  expect(castList([...crew, ...actors], true).map((p) => p.Id)).toEqual([...actors.map((a) => a.Id), 'd', 'w', 'p', 'c', 'x']);
});
