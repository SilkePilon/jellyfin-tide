import { fmtRuntime } from '../ui/dom';
import type { JfItem } from '../types';
import type { JfDetail, JfPerson, JfSource } from '../api/item';

const idx = (x: JfItem) => x.IndexNumber ?? 0;
const played = (x: JfItem) => !!x.UserData?.Played;
const hasPos = (x: JfItem) => (x.UserData?.PlaybackPositionTicks ?? 0) > 0;

export function sortSeasons(s: JfItem[]): JfItem[] {
  return [...s].sort((a, b) => (idx(a) === 0 ? 1e6 : idx(a)) - (idx(b) === 0 ? 1e6 : idx(b)));
}

export function chooseNextUp(resume: JfItem | null, nextUp: JfItem | null): JfItem | null {
  return resume ?? nextUp ?? null;
}

export function defaultSeason(sorted: JfItem[], hint: number | null, next: JfItem | null): number {
  const by = (n: number | null | undefined) => (n === null || n === undefined ? -1 : sorted.findIndex((x) => idx(x) === n));
  const h = by(hint);
  if (h >= 0) return h;
  const n = by(next?.ParentIndexNumber);
  if (n >= 0) return n;
  const u = sorted.findIndex((x) => idx(x) !== 0 && !played(x) && (x.UserData?.UnplayedItemCount ?? 1) > 0);
  if (u >= 0) return u;
  const first = sorted.findIndex((x) => idx(x) !== 0);
  return first >= 0 ? first : 0;
}

/** The episode the row is "up to": the global next-up when it is in this season, else the first unwatched. */
export function nextInSeason(eps: JfItem[], next: JfItem | null): JfItem | null {
  if (next) {
    const hit = eps.find((e) => e.Id === next.Id);
    if (hit) return hit;
  }
  return eps.find((e) => !played(e)) ?? null;
}

/** First card in view: the one before the next-up episode (so you see where you were), else the first. */
export function rowStartIndex(eps: JfItem[], next: JfItem | null): number {
  const n = nextInSeason(eps, next);
  const i = n ? eps.indexOf(n) : -1;
  return i > 0 ? i - 1 : 0;
}

export function episodeTag(ep: JfItem, next: JfItem | null): 'CONTINUE' | 'UP NEXT' | null {
  if (!next || ep.Id !== next.Id) return null;
  return hasPos(ep) ? 'CONTINUE' : 'UP NEXT';
}

export const epLabel = (ep: JfItem) => `S${ep.ParentIndexNumber ?? 0} E${ep.IndexNumber ?? 0}`;

export function yearSpan(item: JfDetail): string {
  const start = item.ProductionYear;
  if (!start) return '';
  const end = item.EndDate ? new Date(item.EndDate).getUTCFullYear() : null;
  return item.Type === 'Series' && item.Status === 'Ended' && end && end !== start ? `${start}–${end}` : String(start);
}

export function fmtBytes(n?: number): string | null {
  if (!n) return null;
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`;
}

export function subtitleSummary(langs: string[]): string {
  const uniq = [...new Set(langs.filter(Boolean))];
  return uniq.length <= 2 ? uniq.join(', ') : `${uniq.slice(0, 2).join(', ')} +${uniq.length - 2}`;
}

const monthYear = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const people = (p: JfPerson[] | undefined, type: string) => (p ?? []).filter((x) => x.Type === type).map((x) => x.Name).join(', ');

export function aboutFacts(item: JfDetail): [string, string][] {
  const studio = (item.Studios ?? []).map((s) => s.Name).slice(0, 2).join(', ');
  const genres = (item.Genres ?? []).join(', ');
  const facts: [string, string][] = item.Type === 'Series'
    ? [['Studio', studio], ['Status', item.Status ?? ''], ['First aired', monthYear(item.PremiereDate)], ['Rating', item.OfficialRating ?? ''],
      ['Genres', genres], ['Seasons', item.ChildCount ? String(item.ChildCount) : ''], ['Creator', people(item.People, 'Creator')]]
    : [['Director', people(item.People, 'Director')], ['Studio', studio], ['Released', monthYear(item.PremiereDate)], ['Rating', item.OfficialRating ?? ''],
      ['Genres', genres], ['Runtime', fmtRuntime(item.RunTimeTicks)?.replace(/ 0(\d)m$/, ' $1m') ?? '']];
  return facts.filter(([, v]) => !!v);
}

function resLabel(w = 0, h = 0): string {
  if (w >= 3200 || h >= 2000) return '4K';
  if (w >= 1800 || h >= 1000) return '1080p';
  if (w >= 1200 || h >= 700) return '720p';
  return h ? `${h}p` : 'SD';
}

export function fileFacts(src: JfSource | undefined): [string, string][] {
  if (!src) return [];
  const streams = src.MediaStreams ?? [];
  const v = streams.find((s) => s.Type === 'Video');
  const a = streams.find((s) => s.Type === 'Audio' && s.IsDefault) ?? streams.find((s) => s.Type === 'Audio');
  const subs = streams.filter((s) => s.Type === 'Subtitle').map((s) => s.DisplayTitle?.split(' - ')[0] ?? s.Language ?? '');
  const range = v?.VideoRangeType && v.VideoRangeType !== 'SDR' ? v.VideoRangeType : '';
  const facts: [string, string][] = [
    ['Quality', v ? [resLabel(v.Width, v.Height), range].filter(Boolean).join(' · ') : ''],
    ['Video', v ? [v.Codec?.toUpperCase(), v.Profile].filter(Boolean).join(' ') : ''],
    ['Audio', (a?.DisplayTitle ?? '').replace(/ - Default$/, '')],
    ['Subtitles', subtitleSummary(subs)],
    ['Size on disk', fmtBytes(src.Size) ?? ''],
  ];
  return facts.filter(([, val]) => !!val);
}

const CREW = ['Director', 'Writer', 'Producer', 'Creator'];
export function castList(p: JfPerson[] | undefined, expanded: boolean): JfPerson[] {
  const all = p ?? [];
  const actors = all.filter((x) => x.Type === 'Actor');
  if (!expanded) return actors.slice(0, 12);
  const rank = (t: string) => { const i = CREW.indexOf(t); return i < 0 ? CREW.length : i; };
  const crew = all.filter((x) => x.Type !== 'Actor').sort((a, b) => rank(a.Type) - rank(b.Type));
  return [...actors, ...crew];
}

export function youtubeId(url?: string): string | null {
  const m = url?.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1]! : null;
}
