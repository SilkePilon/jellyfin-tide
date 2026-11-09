import { api, getSession, jfApiClient } from './client';
import type { JfItem } from '../types';

export interface JfPerson { Id: string; Name: string; Role?: string; Type: string; PrimaryImageTag?: string }
export interface JfStream { Type: string; Index?: number; Title?: string; IsForced?: boolean; IsHearingImpaired?: boolean; IsExternal?: boolean; ChannelLayout?: string; Codec?: string; Profile?: string; Width?: number; Height?: number; VideoRange?: string; VideoRangeType?: string; DisplayTitle?: string; Language?: string; IsDefault?: boolean }
export interface JfSource { Id: string; Name?: string; Size?: number; MediaStreams?: JfStream[] }
export interface JfDetail extends JfItem {
  OfficialRating?: string; Taglines?: string[]; Studios?: { Name: string }[]; People?: JfPerson[];
  RemoteTrailers?: { Url?: string }[]; LocalTrailerCount?: number; PremiereDate?: string; EndDate?: string;
  Status?: string; MediaSources?: JfSource[]; ParentId?: string; SeasonId?: string;
}

export const DETAIL_FIELDS = 'People,Overview,Genres,Studios,Taglines,RemoteTrailers,LocalTrailerCount,MediaSources,MediaStreams,OfficialRating,CommunityRating,CriticRating,ProductionYear,PremiereDate,EndDate,Status,RunTimeTicks,ChildCount,ImageTags,BackdropImageTags';
const EP_FIELDS = 'Overview,RunTimeTicks,ImageTags,ParentIndexNumber,IndexNumber,SeriesId';
const CARD_FIELDS = 'Genres,DateCreated,ChildCount,ProductionYear,CommunityRating,CriticRating,RunTimeTicks,Overview';
const uid = () => getSession()?.userId ?? '';

export const getItem = (id: string) => api<JfDetail>(`/Items/${id}`, { query: { userId: uid(), Fields: DETAIL_FIELDS } });

export async function getSeasons(seriesId: string): Promise<JfItem[]> {
  return (await api<{ Items: JfItem[] }>(`/Shows/${seriesId}/Seasons`, { query: { userId: uid(), Fields: 'ImageTags,ChildCount', EnableUserData: true } })).Items ?? [];
}

export async function getEpisodes(seriesId: string, seasonId: string): Promise<JfItem[]> {
  return (await api<{ Items: JfItem[] }>(`/Shows/${seriesId}/Episodes`, { query: { userId: uid(), seasonId, Fields: EP_FIELDS, EnableUserData: true } })).Items ?? [];
}

export async function getNextUp(seriesId: string): Promise<JfItem | null> {
  const r = await api<{ Items: JfItem[] }>('/Shows/NextUp', { query: { userId: uid(), seriesId, Limit: 1, Fields: EP_FIELDS, EnableUserData: true } });
  return r.Items?.[0] ?? null;
}

export async function getResumeEpisode(seriesId: string): Promise<JfItem | null> {
  const r = await api<{ Items: JfItem[] }>('/UserItems/Resume', { query: { userId: uid(), parentId: seriesId, Limit: 1, MediaTypes: 'Video', Fields: EP_FIELDS, EnableUserData: true } });
  return r.Items?.[0] ?? null;
}

export async function getSimilar(id: string): Promise<JfItem[]> {
  return (await api<{ Items: JfItem[] }>(`/Items/${id}/Similar`, { query: { userId: uid(), Limit: 12, Fields: CARD_FIELDS, EnableUserData: true } })).Items ?? [];
}

export async function getLocalTrailerId(id: string): Promise<string | null> {
  const r = await api<{ Id: string }[]>(`/Items/${id}/LocalTrailers`, { query: { userId: uid() } });
  return r?.[0]?.Id ?? null;
}

export async function isAdmin(): Promise<boolean> {
  const c = jfApiClient() as unknown as { getCurrentUser?(): Promise<{ Policy?: { IsAdministrator?: boolean } }> } | null;
  const u = await c?.getCurrentUser?.().catch(() => null);
  return !!u?.Policy?.IsAdministrator;
}
