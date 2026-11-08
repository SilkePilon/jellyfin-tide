import { api, getSession, jfApiClient } from './client';
import { ROUTES } from '../router/selectors';

export function openDetails(id: string): void {
  location.hash = ROUTES.details(id).replace(/^#/, '');
}

/** This browser's own Jellyfin session id (the session registered for ApiClient.deviceId()). */
async function ownSessionId(): Promise<string | null> {
  const deviceId = jfApiClient()?.deviceId?.();
  if (!deviceId) return null;
  const sessions = await api<{ Id: string; DeviceId?: string }[]>('/Sessions', { query: { deviceId } });
  return sessions.find((x) => x.DeviceId === deviceId)?.Id ?? sessions[0]?.Id ?? null;
}

async function resumeTicks(id: string): Promise<number> {
  try {
    const ud = await api<{ PlaybackPositionTicks?: number; Played?: boolean }>(`/UserItems/${id}/UserData`, { query: { userId: getSession()?.userId } });
    return !ud?.Played && ud?.PlaybackPositionTicks ? ud.PlaybackPositionTicks : 0;
  } catch {
    return 0;
  }
}

/**
 * Start playback in this browser. 12.4's web client has no global playbackManager, so Tide sends its own session a
 * PlayNow command (the same path as remote control); jellyfin-web receives it over its websocket and opens the
 * stock player. Resumable items start at their saved position. Falls back to the details page on any failure.
 */
export async function play(id: string, startPositionTicks?: number): Promise<void> {
  try {
    window.dispatchEvent(new CustomEvent('tide:play', { detail: { id } }));
    const sessionId = await ownSessionId();
    if (!sessionId) throw new Error('own session not found');
    const ticks = startPositionTicks ?? (await resumeTicks(id));
    await api(`/Sessions/${sessionId}/Playing`, {
      method: 'POST',
      query: { playCommand: 'PlayNow', itemIds: id, startPositionTicks: ticks > 0 ? ticks : undefined },
    });
  } catch (e) {
    console.warn('[Tide] play failed, opening details', e);
    openDetails(id);
  }
}

export async function setWatched(id: string, on: boolean): Promise<void> {
  const s = getSession();
  await api(`/UserPlayedItems/${id}`, { method: on ? 'POST' : 'DELETE', query: { userId: s?.userId } });
}

export async function setFavourite(id: string, on: boolean): Promise<void> {
  const s = getSession();
  await api(`/UserFavoriteItems/${id}`, { method: on ? 'POST' : 'DELETE', query: { userId: s?.userId } });
}
/** Shuffle-play a series / collection in this browser (same PlayNow path as play()). */
export async function playShuffle(id: string): Promise<void> {
  try {
    const sessionId = await ownSessionId();
    if (!sessionId) throw new Error('own session not found');
    await api(`/Sessions/${sessionId}/Playing`, { method: 'POST', query: { playCommand: 'PlayShuffle', itemIds: id } });
  } catch (e) {
    console.warn('[Tide] shuffle failed', e);
  }
}

export async function refreshItem(id: string): Promise<void> {
  await api(`/Items/${id}/Refresh`, { method: 'POST', query: { Recursive: true, MetadataRefreshMode: 'Default', ImageRefreshMode: 'Default' } });
}
