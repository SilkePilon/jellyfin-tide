import { openDetails, play, setFavourite } from '../src/api/actions';
import { episodeSub, hoverLine, minutesLeft, progressRing, subLine, wideCard } from '../src/ui/cards';
import { qualityBadge } from '../src/ui/quality';
import type { JfItem } from '../src/types';

vi.mock('../src/api/actions', () => ({ openDetails: vi.fn(), play: vi.fn(), setFavourite: vi.fn(), setWatched: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 't', getCurrentUserId: () => 'u' };
});

const NOW = Date.parse('2026-11-08T12:00:00Z');
const movie: JfItem = {
  Id: 'm1', Name: 'Top Gun: Maverick', Type: 'Movie', ProductionYear: 2022, Genres: ['Action', 'Drama'],
  RunTimeTicks: 130 * 60 * 1e7, CommunityRating: 8.158, CriticRating: 96, DateCreated: '2026-11-01T00:00:00Z',
  UserData: { PlayedPercentage: 60, PlaybackPositionTicks: 78 * 60 * 1e7 },
};
const series: JfItem = { Id: 's1', Name: 'Silo', Type: 'Series', ProductionYear: 2023, Genres: ['Drama'], ChildCount: 3, DateCreated: '2024-01-01T00:00:00Z', UserData: { UnplayedItemCount: 9 } };

test('quality badge: poster form shows res + codec only', () => {
  const b = qualityBadge({ res: '4K', codec: 'HEVC', range: 'HDR10', audio: 'Atmos' }, false)!;
  expect([...b.children].map((c) => c.textContent)).toEqual(['4K', 'HEVC']);
});

test('quality badge: full form includes range and audio, omits null range', () => {
  const b = qualityBadge({ res: '1080p', codec: 'H.264', range: null, audio: '5.1' }, true)!;
  expect([...b.children].map((c) => c.textContent)).toEqual(['1080p', 'H.264', '5.1']);
});

test('sub line for movie and series', () => {
  expect(subLine(movie)).toBe('2022 · Action · 2h 10m');
  expect(subLine(series)).toBe('2023 · Drama · 3 seasons');
});

test('minutes left', () => {
  expect(minutesLeft(movie)).toBe(52);
});

test('wide card: artwork + logo, no text under the card', () => {
  const c = wideCard(series);
  expect(c.classList.contains('tide-wide')).toBe(true);
  expect(c.querySelector<HTMLImageElement>('.tide-wide-art')?.src).toContain('/Items/s1/Images/Backdrop/0');
  expect(c.querySelector<HTMLImageElement>('img.tide-wide-logo')?.src).toContain('/Items/s1/Images/Logo');
  expect(c.querySelector('.tide-card-title, .tide-card-sub')).toBeNull();
  // details live in the hover layer only
  expect(c.querySelector('.tide-wide-info .tide-wide-title')?.textContent).toBe('Silo');
  expect(c.querySelector('.tide-wide-sub')?.textContent).toBe('2023 · Drama · 3 seasons');
});

test('hover line: rating first for titles, episode form for episodes, time left when resuming', () => {
  expect(hoverLine(movie)).toBe('★ 8.2 · 2022 · Action · 2h 10m · 52m left');
  const ep: JfItem = { Id: 'e1', Name: 'Bad Optics', Type: 'Episode', SeriesId: 's9', SeriesName: 'Lanterns', ParentIndexNumber: 1, IndexNumber: 6, RunTimeTicks: 60 * 60 * 1e7, UserData: { PlayedPercentage: 25, PlaybackPositionTicks: 15 * 60 * 1e7 } };
  expect(hoverLine(ep)).toBe('S1 · E6 · Bad Optics · 45m left');
});

test('episode card: episode still as art, series logo and title', () => {
  const ep: JfItem = { Id: 'e1', Name: 'Bad Optics', Type: 'Episode', SeriesId: 's9', SeriesName: 'Lanterns', ParentIndexNumber: 1, IndexNumber: 6 };
  const c = wideCard(ep);
  expect(c.querySelector<HTMLImageElement>('.tide-wide-art')?.src).toContain('/Items/e1/Images/Primary');
  expect(c.querySelector<HTMLImageElement>('img.tide-wide-logo')?.src).toContain('/Items/s9/Images/Logo');
  expect(c.querySelector('.tide-wide-title')?.textContent).toBe('Lanterns');
});

test('progress ring only for resumable items; it is the play control', () => {
  const c = wideCard(movie);
  expect(c.classList.contains('tide-wide-progress')).toBe(true);
  const ring = c.querySelector<HTMLElement>('.tide-wide-ring')!;
  expect(ring.querySelector('.tide-ring-arc')?.getAttribute('stroke-dashoffset')).toBe('35.18');
  expect(c.querySelector('.tide-wide-play')).toBeNull();
  ring.click();
  expect(play).toHaveBeenCalledWith('m1');
  expect(openDetails).not.toHaveBeenCalled();
  const plain = wideCard(series);
  expect(plain.querySelector('.tide-wide-ring')).toBeNull();
  expect(plain.querySelector('.tide-wide-play')).not.toBeNull();
});

test('progress ring clamps and renders track + arc', () => {
  const r = progressRing(150);
  expect(r.querySelector('.tide-ring-track')).not.toBeNull();
  expect(r.querySelector('.tide-ring-arc')?.getAttribute('stroke-dashoffset')).toBe('0.00');
});

test('favourite toggle reflects state and only animates on user toggles', () => {
  vi.mocked(setFavourite).mockResolvedValue(undefined);
  const c = wideCard({ ...series, UserData: { IsFavorite: true } });
  const fav = c.querySelector<HTMLButtonElement>('.tide-fav-toggle')!;
  expect(fav.getAttribute('aria-pressed')).toBe('true');
  expect(fav.classList.contains('tide-just-toggled')).toBe(false);
  fav.click();
  expect(fav.getAttribute('aria-pressed')).toBe('false');
  expect(setFavourite).toHaveBeenCalledWith('s1', false);
  expect(openDetails).not.toHaveBeenCalled();
  expect(fav.classList.contains('tide-just-toggled')).toBe(true);
});

test('card click opens details, but not right after a drag-to-scroll', () => {
  const track = document.createElement('div');
  const c = wideCard(series);
  track.append(c);
  document.body.append(track);
  c.click();
  expect(openDetails).toHaveBeenCalledTimes(1);
  track.dataset.tideDragged = '1';
  c.click();
  expect(openDetails).toHaveBeenCalledTimes(1);
  track.remove();
});

test('long-press reveals the hover layer and swallows the following click', () => {
  vi.useFakeTimers();
  try {
    const c = wideCard(series);
    c.dispatchEvent(new Event('touchstart'));
    vi.advanceTimersByTime(500);
    c.dispatchEvent(new Event('touchend'));
    c.click();
    expect(c.classList.contains('tide-pressed')).toBe(true);
    expect(openDetails).not.toHaveBeenCalled();
    c.click();
    expect(openDetails).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});


const ep = { Id: 'e3', Name: 'A Dark Web', Type: 'Episode', SeriesId: 'ser', IndexNumber: 3, ParentIndexNumber: 3, RunTimeTicks: 48 * 6e8, Overview: 'Juliette takes control.' };

test('episode mode: kicker + title at rest, no logo, synopsis on hover, click plays', () => {
  vi.clearAllMocks();
  const c = wideCard(ep, { episode: { tag: null } });
  expect(c.querySelector('img.tide-wide-logo, .tide-wide-logo-text')).toBeNull();
  expect(c.querySelector('.tide-wide-ep-k')?.textContent).toBe('EPISODE 3');
  expect(c.querySelector('.tide-wide-ep-n')?.textContent).toBe('A Dark Web');
  expect(c.querySelector('.tide-wide-title')?.textContent).toBe('3. A Dark Web');
  expect(c.querySelector('.tide-wide-sub')?.textContent).toBe('48m');
  expect(c.querySelector('.tide-wide-syn')?.textContent).toBe('Juliette takes control.');
  expect(c.querySelector<HTMLImageElement>('.tide-wide-art')!.src).toContain('/Items/e3/Images/Primary');
  c.click();
  expect(play).toHaveBeenCalledWith('e3');
  expect(openDetails).not.toHaveBeenCalled();
});

test('episode mode: tags, watched check, specials, resume ring', () => {
  expect(wideCard(ep, { episode: { tag: 'UP NEXT' } }).querySelector('.tide-wide-tag')?.textContent).toBe('UP NEXT');
  const watched = wideCard({ ...ep, UserData: { Played: true } }, { episode: { tag: null } });
  expect(watched.querySelector('.tide-wide-done')).not.toBeNull();
  expect(watched.querySelector('.tide-wide-sub')?.textContent).toBe('48m · Watched');
  expect(wideCard({ ...ep, ParentIndexNumber: 0 }, { episode: { tag: null } }).querySelector('.tide-wide-ep-k')?.textContent).toBe('SPECIAL');
  const part = wideCard({ ...ep, UserData: { PlaybackPositionTicks: 36 * 6e8 } }, { episode: { tag: 'CONTINUE' } });
  expect(part.querySelector('.tide-wide-ring')).not.toBeNull();
  expect(episodeSub({ ...ep, UserData: { PlaybackPositionTicks: 36 * 6e8 } })).toBe('48m · 12m left');
});

test('episode mode: synopsis can be turned off and tags are free text', () => {
  const ep2 = { Id: 'e9', Name: 'X', Type: 'Episode', SeriesId: 's', IndexNumber: 2, ParentIndexNumber: 1, RunTimeTicks: 6e9, Overview: 'Long text' };
  const c = wideCard(ep2, { episode: { tag: 'NOW PLAYING', synopsis: false } });
  expect(c.querySelector('.tide-wide-syn')).toBeNull();
  expect(c.querySelector('.tide-wide-tag')?.textContent).toBe('NOW PLAYING');
});
