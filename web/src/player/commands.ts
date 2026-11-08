import { api } from '../api/client';
import type { Bridge } from './bridge';

/** Verdicts from docs/notes/web-12.4-player.md: all honoured in 12.4. false = go straight to the stock dialog. */
const HONOURED = { audio: true, subtitles: true, quality: true };

export type SettingKind = 'audio' | 'subtitles' | 'quality' | 'speed';
export const QUALITY_BITRATES = { Auto: 120e6, '4K': 120e6, '1080p': 20e6, '720p': 8e6, '480p': 3e6 } as const;
const HEIGHT: Record<string, number> = { '4K': 2160, '1080p': 1080, '720p': 720, '480p': 480 };

export function qualityChoices(sourceHeight: number): (keyof typeof QUALITY_BITRATES)[] {
  return (['Auto', '4K', '1080p', '720p', '480p'] as const).filter((q) => q === 'Auto' || HEIGHT[q]! <= sourceHeight);
}

const STOCK: Record<Exclude<SettingKind, 'speed'>, 'audio' | 'subtitles' | 'settings'> = { audio: 'audio', subtitles: 'subtitles', quality: 'settings' };

/**
 * Apply a playback setting. Audio / subtitles / quality go through session commands, applied optimistically: 12.4
 * honours them, but the session only reflects the change with the next progress report (~10 s, see
 * docs/notes/web-12.4-player.md), so there is nothing quick to confirm against. Only a failed POST falls back to the
 * stock dialog. Speed is not a session command in 12.4: set it on the web <video>, or open the stock settings.
 */
export async function applySetting(kind: SettingKind, value: string, ctx: { sessionId: string; bridge: Pick<Bridge, 'video' | 'openStock'> }): Promise<'command' | 'fallback'> {
  if (kind === 'speed') {
    const v = ctx.bridge.video();
    if (v) { v.playbackRate = Number(value); return 'command'; }
    ctx.bridge.openStock('settings');
    return 'fallback';
  }
  if (!HONOURED[kind]) { ctx.bridge.openStock(STOCK[kind]); return 'fallback'; }
  const cmd = kind === 'audio' ? { Name: 'SetAudioStreamIndex', Arguments: { Index: value } }
    : kind === 'subtitles' ? { Name: 'SetSubtitleStreamIndex', Arguments: { Index: value } }
      : { Name: 'SetMaxStreamingBitrate', Arguments: { MaxBitrate: String(QUALITY_BITRATES[value as keyof typeof QUALITY_BITRATES] ?? value) } };
  try {
    await api(`/Sessions/${ctx.sessionId}/Command`, { method: 'POST', body: cmd });
    return 'command';
  } catch (e) {
    console.warn('[Tide] player command failed, opening the stock dialog', e);
    ctx.bridge.openStock(STOCK[kind]);
    return 'fallback';
  }
}
