import { api, getSession, imageUrl } from '../api/client';
import type { JfItem } from '../types';

/** Subset of Jellyfin's SearchHint (GET /Search/Hints), also used for genre browse results. */
export interface Hint {
  Id: string; Name: string; Type: string; ProductionYear?: number; RunTimeTicks?: number;
  Series?: string; IndexNumber?: number; ParentIndexNumber?: number; PrimaryImageTag?: string;
  AlbumArtist?: string; Album?: string; AlbumId?: string; AlbumPrimaryImageTag?: string; Artists?: string[]; ChildCount?: number;
}
export type Chip = 'all' | 'movies' | 'shows' | 'episodes' | 'people' | 'music' | 'collections' | 'playlists';
export const CHIPS: { id: Chip; label: string; types: string[] }[] = [
  { id: 'all', label: 'All', types: [] },
  { id: 'movies', label: 'Movies', types: ['Movie'] },
  { id: 'shows', label: 'Shows', types: ['Series'] },
  { id: 'episodes', label: 'Episodes', types: ['Episode'] },
  { id: 'people', label: 'People', types: ['Person'] },
  { id: 'music', label: 'Music', types: ['MusicArtist', 'MusicAlbum', 'Audio'] },
  { id: 'collections', label: 'Collections', types: ['BoxSet'] },
  { id: 'playlists', label: 'Playlists', types: ['Playlist'] },
];
const chip = (id: Chip) => CHIPS.find((c) => c.id === id)!;
/** Result groups in display order (spec 2: Shows, Movies, Episodes, People, Music, Collections, Playlists). */
export const GROUPS = (['shows', 'movies', 'episodes', 'people', 'music', 'collections', 'playlists'] as const)
  .map((id) => ({ id, title: chip(id).label, types: chip(id).types }));
export const PER_GROUP = 6;
/** Shift+Enter / the Play button: video types only (music opens its page). */
export const PLAYABLE = new Set(['Movie', 'Episode', 'Series']);
export interface Grouped { top: Hint | null; groups: { id: Chip; title: string; items: Hint[] }[]; counts: Record<Chip, number> }

export function groupHints(hints: Hint[], selected: Chip): Grouped {
  const counts = { all: hints.length } as Record<Chip, number>;
  for (const g of GROUPS) counts[g.id] = hints.filter((x) => g.types.includes(x.Type)).length;
  if (selected !== 'all') {
    const c = chip(selected);
    return { top: null, groups: [{ id: selected, title: c.label, items: hints.filter((x) => c.types.includes(x.Type)) }], counts };
  }
  const [top = null, ...rest] = hints;
  const groups = GROUPS.map((g) => ({ id: g.id as Chip, title: g.title, items: rest.filter((x) => g.types.includes(x.Type)).slice(0, PER_GROUP) }))
    .filter((g) => g.items.length > 0);
  return { top, groups, counts };
}

/** With includeItemTypes set, Jellyfin only returns people / artists when Person / MusicArtist are listed too. */
export const SEARCH_TYPES = 'Movie,Series,Episode,Person,MusicArtist,MusicAlbum,Audio,BoxSet,Playlist';

export async function searchHints(q: string, signal?: AbortSignal): Promise<Hint[]> {
  const r = await api<{ SearchHints?: Hint[] }>('/Search/Hints', {
    query: { searchTerm: q, limit: 40, includePeople: true, includeArtists: true, includeMedia: true, includeItemTypes: SEARCH_TYPES, userId: getSession()?.userId },
    signal,
  });
  return r?.SearchHints ?? [];
}

export interface GenreTile { id: string; name: string; image: string | null }

/** The n genres with the most movies and shows; each tile shows a random backdrop from that genre. */
export async function topGenres(n = 6): Promise<GenreTile[]> {
  const userId = getSession()?.userId;
  const r = await api<{ Items?: { Id: string; Name: string; ChildCount?: number }[] }>('/Genres', { query: { userId, Recursive: true, IncludeItemTypes: 'Movie,Series' } });
  const top = [...(r?.Items ?? [])].sort((a, b) => (b.ChildCount ?? 0) - (a.ChildCount ?? 0)).slice(0, n);
  return Promise.all(top.map(async (g) => {
    const it = await api<{ Items?: { Id: string; BackdropImageTags?: string[] }[] }>('/Items', {
      query: { userId, Recursive: true, GenreIds: g.Id, IncludeItemTypes: 'Movie,Series', ImageTypes: 'Backdrop', SortBy: 'Random', Limit: 1 },
    }).catch(() => null);
    const pick = it?.Items?.[0];
    return { id: g.Id, name: g.Name, image: pick ? imageUrl(pick.Id, 'Backdrop/0', 500, pick.BackdropImageTags?.[0]) : null };
  }));
}

export async function genreTitles(genreId: string): Promise<Hint[]> {
  const r = await api<{ Items?: JfItem[] }>('/Items', {
    query: { userId: getSession()?.userId, Recursive: true, GenreIds: genreId, IncludeItemTypes: 'Movie,Series', SortBy: 'CommunityRating', SortOrder: 'Descending', Limit: 40 },
  });
  return (r?.Items ?? []).map((i) => ({ Id: i.Id, Name: i.Name, Type: i.Type, ProductionYear: i.ProductionYear, RunTimeTicks: i.RunTimeTicks, PrimaryImageTag: i.ImageTags?.Primary, ChildCount: i.ChildCount }));
}
