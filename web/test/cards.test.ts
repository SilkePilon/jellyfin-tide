import { openDetails, setFavourite, setWatched } from '../src/api/actions';
import { landscapeCard, minutesLeft, posterCard, subLine } from '../src/ui/cards';
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

test('poster card resting state: NEW, quality, progress, no title overlay', () => {
  const c = posterCard(movie, { quality: { res: '4K', codec: 'HEVC' }, newDays: 14, now: NOW });
  expect(c.querySelector('.tide-chip-new')).not.toBeNull();
  expect(c.querySelector('.tide-q')?.textContent).toBe('4KHEVC');
  expect((c.querySelector('.tide-poster-progress i') as HTMLElement).style.width).toBe('60%');
  expect(c.querySelector('.tide-poster-logo')).toBeNull();
  expect(c.querySelector('.tide-card-title')?.textContent).toBe('Top Gun: Maverick');
});

test('poster card: ratings live in hover layer', () => {
  const c = posterCard(movie, { newDays: 14, now: NOW });
  const hover = c.querySelector('.tide-poster-hover')!;
  expect(hover.textContent).toContain('8.2');
  expect(hover.textContent).toContain('96%');
  expect(hover.querySelectorAll('button').length).toBe(4);
});

test('poster card corner: unwatched count, watched check, favourite', () => {
  expect(posterCard(series, { newDays: 14, now: NOW }).querySelector('.tide-corner')?.textContent).toBe('9');
  const watched = posterCard({ ...movie, UserData: { Played: true } }, { newDays: 14, now: NOW });
  expect(watched.querySelector('.tide-corner')?.textContent).toBe('check');
  const fav = posterCard({ ...movie, UserData: { IsFavorite: true } }, { newDays: 14, now: NOW });
  expect(fav.querySelector('.tide-corner')?.textContent).toBe('favorite');
});

test('not NEW when older than window', () => {
  expect(posterCard(series, { newDays: 14, now: NOW }).querySelector('.tide-chip-new')).toBeNull();
});

test('minutes left', () => {
  expect(minutesLeft(movie)).toBe(52);
});

test('landscape card for episode uses episode image + series logo', () => {
  const ep: JfItem = { Id: 'e1', Name: 'Bad Optics', Type: 'Episode', SeriesId: 's9', SeriesName: 'Lanterns', ParentIndexNumber: 1, IndexNumber: 6, RunTimeTicks: 60 * 60 * 1e7, UserData: { PlayedPercentage: 25, PlaybackPositionTicks: 15 * 60 * 1e7 } };
  const c = landscapeCard(ep);
  expect((c.querySelector('.tide-land-img') as HTMLElement).style.backgroundImage).toContain('/Items/e1/Images/Primary');
  expect(c.querySelector('img.tide-land-logo')?.getAttribute('src')).toContain('/Items/s9/Images/Logo');
  expect(c.querySelector('.tide-card-sub')?.textContent).toBe('S1 · E6 · Bad Optics · 45m left');
});

test('action button click does not open details', () => {
  const c = posterCard(movie, { newDays: 14, now: NOW });
  document.body.append(c);
  (c.querySelector('button[aria-label="Favourite"]') as HTMLElement).click();
  expect(setFavourite).toHaveBeenCalledWith('m1', true);
  expect(openDetails).not.toHaveBeenCalled();
  c.remove();
});

test('watched / favourite toggles reflect state, flip on click and update the corner badge', () => {
  const c = posterCard({ ...movie, UserData: { IsFavorite: true } }, { newDays: 14, now: NOW });
  const fav = c.querySelector<HTMLButtonElement>('button[aria-label="Favourite"]')!;
  const seen = c.querySelector<HTMLButtonElement>('button[aria-label="Mark watched"]')!;
  expect(fav.getAttribute('aria-pressed')).toBe('true');
  expect(seen.getAttribute('aria-pressed')).toBe('false');
  fav.click();
  expect(fav.getAttribute('aria-pressed')).toBe('false');
  expect(c.querySelector('.tide-corner')).toBeNull();
  seen.click();
  expect(seen.getAttribute('aria-pressed')).toBe('true');
  expect(setWatched).toHaveBeenCalledWith('m1', true);
  expect(c.querySelector('.tide-corner')?.textContent).toBe('check');
});

test('long-press reveals hover layer and swallows the following click', () => {
  vi.useFakeTimers();
  try {
    const c = posterCard(movie, { newDays: 14, now: NOW });
    document.body.append(c);
    c.dispatchEvent(new Event('touchstart'));
    vi.advanceTimersByTime(500);
    c.dispatchEvent(new Event('touchend'));
    c.click();
    expect(c.classList.contains('tide-pressed')).toBe(true);
    expect(openDetails).not.toHaveBeenCalled();
    c.click();
    expect(openDetails).toHaveBeenCalledWith('m1');
    c.remove();
  } finally {
    vi.useRealTimers();
  }
});
