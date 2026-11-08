export const ROW_IDS = [
  'continue', 'nextUp', 'newThisWeek', 'latestMovies', 'topRated', 'discover', 'latestShows', 'becauseYouWatched',
  'genre1', 'genre2', 'genre3', 'favourites', 'random', 'collections', 'musicAlbums', 'musicArtists',
] as const;
export type RowId = (typeof ROW_IDS)[number];

export interface Quality { res: string; codec: string; range?: string | null; audio?: string | null }

export type HeroReason = 'resume' | 'nextEpisode' | 'newEpisode' | 'new' | 'topRated';

export interface HeroItem {
  id: string; type: 'Movie' | 'Series'; reason: HeroReason; name: string; year?: number | null;
  genres: string[]; officialRating?: string | null; communityRating?: number | null; criticRating?: number | null;
  runtimeMinutes?: number | null; seasonCount?: number | null; overview: string;
  episode?: { id: string; season: number; number: number; name: string } | null;
  progress?: { percent: number; minutesLeft: number } | null;
  quality?: Quality | null; hasLogo: boolean; hasThumb: boolean; isFavorite: boolean; youtube: string[]; playTargetId: string;
}

export interface UserPrefs { rowOrder: string[]; hidden: string[]; genres: Record<string, string | null>; edited: boolean }

export interface ClientConfig {
  enableTheme: boolean; enableIcons: boolean; enableHome: boolean; enableTrailers: boolean;
  heroSlotSeconds: number; newDays: number; version: string;
  /** Admin defaults (normalised server-side): what "Reset to default" and a fresh user get. */
  defaultRowOrder?: string[]; defaultHiddenRows?: string[];
}

/** Admin defaults from ClientConfig, falling back to the built-in order when the server is older. */
export function defaultPrefs(cfg: Pick<ClientConfig, 'defaultRowOrder' | 'defaultHiddenRows'>): UserPrefs {
  const order = cfg.defaultRowOrder?.length ? [...cfg.defaultRowOrder] : [...ROW_IDS];
  return { rowOrder: order, hidden: [...(cfg.defaultHiddenRows ?? [])], genres: {}, edited: false };
}

export interface HomeResponse { hero: HeroItem[]; prefs: UserPrefs; config: ClientConfig }

/** Subset of Jellyfin's BaseItemDto (PascalCase, as returned by stock endpoints). */
export interface JfItem {
  Id: string; Name: string; Type: string; ProductionYear?: number; Genres?: string[];
  CommunityRating?: number; CriticRating?: number; RunTimeTicks?: number; ChildCount?: number;
  SeriesId?: string; SeriesName?: string; ParentIndexNumber?: number; IndexNumber?: number;
  DateCreated?: string; ImageTags?: Record<string, string>; BackdropImageTags?: string[];
  ParentBackdropItemId?: string; AlbumArtist?: string; Overview?: string;
  UserData?: { Played?: boolean; PlayedPercentage?: number; UnplayedItemCount?: number; IsFavorite?: boolean; PlaybackPositionTicks?: number };
}
