import { api } from '../api/client';
import { ROUTES } from '../router/selectors';
import type { JfItem, RowId, UserPrefs } from '../types';
import { ROW_IDS } from '../types';
export { renderRow } from './rowView';

export interface RowContext { userId: string; prefs: UserPrefs; newDays: number; genres: string[]; becauseOf?: JfItem | null; picked?: Record<string, string | null> }
export interface RowDef {
  id: RowId;
  kind: 'wide' | 'square' | 'round' | 'custom';
  title(ctx: RowContext): string;
  fetch(ctx: RowContext): Promise<JfItem[]>;
  link?: string;
}

const LIMIT = 20;
const FIELDS = 'Genres,DateCreated,ChildCount,ProductionYear,CommunityRating,CriticRating,RunTimeTicks,Overview';
type Result = { Items: JfItem[] };
const items = async (path: string, query: Record<string, string | number | boolean | undefined>) =>
  (await api<Result>(path, { query: { Limit: LIMIT, Fields: FIELDS, EnableUserData: true, ...query } })).Items ?? [];
const userItems = (ctx: RowContext, q: Record<string, string | number | boolean | undefined>) =>
  items('/Items', { userId: ctx.userId, Recursive: true, ...q });

function genreRow(id: 'genre1' | 'genre2' | 'genre3'): RowDef {
  return {
    id, kind: 'wide',
    title: (ctx) => ctx.picked?.[id] ?? '',
    fetch: (ctx) => {
      const g = ctx.picked?.[id];
      return g ? userItems(ctx, { IncludeItemTypes: 'Movie,Series', Genres: g, SortBy: 'Random' }) : Promise.resolve([]);
    },
  };
}

export const ROWS: Record<RowId, RowDef> = {
  continue: { id: 'continue', kind: 'wide', title: () => 'Continue Watching', fetch: (ctx) => items('/UserItems/Resume', { userId: ctx.userId, MediaTypes: 'Video' }) },
  nextUp: { id: 'nextUp', kind: 'wide', title: () => 'Next Up', fetch: (ctx) => items('/Shows/NextUp', { userId: ctx.userId }) },
  latestMovies: { id: 'latestMovies', kind: 'wide', link: ROUTES.movies, title: () => 'Recently Added Movies', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'Movie', SortBy: 'DateCreated', SortOrder: 'Descending' }) },
  latestShows: { id: 'latestShows', kind: 'wide', link: ROUTES.shows, title: () => 'Recently Added Shows', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'Series', SortBy: 'DateLastContentAdded', SortOrder: 'Descending' }) },
  becauseYouWatched: {
    id: 'becauseYouWatched', kind: 'wide',
    title: (ctx) => (ctx.becauseOf ? `Because you watched ${ctx.becauseOf.SeriesName ?? ctx.becauseOf.Name}` : ''),
    fetch: async (ctx) => {
      const src = ctx.becauseOf;
      if (!src) return [];
      return (await api<Result>(`/Items/${src.SeriesId ?? src.Id}/Similar`, { query: { userId: ctx.userId, Limit: LIMIT, Fields: FIELDS } })).Items ?? [];
    },
  },
  newThisWeek: { id: 'newThisWeek', kind: 'custom', title: () => 'New this week', fetch: (ctx) => newThisWeek(ctx) },
  discover: { id: 'discover', kind: 'custom', title: () => 'Discover', fetch: () => Promise.resolve([]) },
  topRated: { id: 'topRated', kind: 'wide', title: () => 'Top rated, not watched yet', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'Movie,Series', IsPlayed: false, SortBy: 'CommunityRating', SortOrder: 'Descending' }) },
  genre1: genreRow('genre1'),
  genre2: genreRow('genre2'),
  genre3: genreRow('genre3'),
  favourites: { id: 'favourites', kind: 'wide', title: () => 'Your Favourites', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'Movie,Series', IsFavorite: true, SortBy: 'SortName' }) },
  random: { id: 'random', kind: 'wide', title: () => 'Something different', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'Movie,Series', IsPlayed: false, SortBy: 'Random' }) },
  collections: { id: 'collections', kind: 'wide', title: () => 'Collections', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'BoxSet', SortBy: 'SortName' }) },
  musicAlbums: { id: 'musicAlbums', kind: 'square', link: ROUTES.music, title: () => 'Recently Added Albums', fetch: (ctx) => userItems(ctx, { IncludeItemTypes: 'MusicAlbum', SortBy: 'DateCreated', SortOrder: 'Descending' }) },
  musicArtists: { id: 'musicArtists', kind: 'round', link: ROUTES.music, title: () => 'Artists', fetch: (ctx) => items('/Artists/AlbumArtists', { userId: ctx.userId, SortBy: 'Random' }) },
};

const WEEK_MS = 7 * 864e5;

/** Movies and shows added in the last 7 days (shows by their newest episode), newest first, max 5. */
export async function newThisWeek(ctx: RowContext, now = Date.now()): Promise<JfItem[]> {
  const [movies, shows] = await Promise.all([
    userItems(ctx, { IncludeItemTypes: 'Movie', SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 10 }),
    userItems(ctx, { IncludeItemTypes: 'Series', SortBy: 'DateLastContentAdded', SortOrder: 'Descending', Limit: 10, Fields: `${FIELDS},DateLastContentAdded` }),
  ]);
  const when = (i: JfItem) => Date.parse((i as JfItem & { DateLastContentAdded?: string }).DateLastContentAdded ?? i.DateCreated ?? '') || 0;
  const hasArt = (i: JfItem) => !!(i.BackdropImageTags?.length || i.ImageTags?.Primary || (!i.ImageTags && !i.BackdropImageTags));
  return [...movies, ...shows].filter((i) => hasArt(i) && now - when(i) <= WEEK_MS).sort((a, b) => when(b) - when(a)).slice(0, 5);
}

export function visibleRows(prefs: UserPrefs): RowId[] {
  const hidden = new Set(prefs.hidden);
  const known = new Set<string>(ROW_IDS);
  return prefs.rowOrder.filter((id): id is RowId => known.has(id) && !hidden.has(id));
}

export function pickGenres(prefs: UserPrefs, available: string[], rnd: () => number = Math.random): Record<'genre1' | 'genre2' | 'genre3', string | null> {
  const keys = ['genre1', 'genre2', 'genre3'] as const;
  const out = {} as Record<(typeof keys)[number], string | null>;
  const used = new Set<string>();
  for (const k of keys) {
    const fixed = prefs.genres[k];
    if (fixed && available.includes(fixed) && !used.has(fixed)) {
      out[k] = fixed;
      used.add(fixed);
    }
  }
  const pool = available.filter((g) => !used.has(g));
  for (const k of keys) {
    if (out[k]) continue;
    if (!pool.length) { out[k] = null; continue; }
    const g = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!;
    out[k] = g;
    used.add(g);
  }
  return out;
}
