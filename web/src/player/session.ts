import { api, jfApiClient } from '../api/client';
import type { JfDetail } from '../api/item';

export interface NowPlaying {
  sessionId: string; item: JfDetail;
  audioIndex: number | null; subtitleIndex: number | null; playMethod: string | null;
  transcode: { videoCodec?: string; audioCodec?: string; width?: number; height?: number; completion?: number; reasons?: string[] } | null;
}

type Raw = { Id?: string; NowPlayingItem?: JfDetail; PlayState?: { AudioStreamIndex?: number; SubtitleStreamIndex?: number; PlayMethod?: string };
  TranscodingInfo?: { VideoCodec?: string; AudioCodec?: string; Width?: number; Height?: number; CompletionPercentage?: number; TranscodeReasons?: string[] } };

export function parseSession(s: unknown): NowPlaying | null {
  const r = s as Raw;
  if (!r?.Id || !r.NowPlayingItem) return null;
  const ps = r.PlayState ?? {};
  const t = r.TranscodingInfo;
  const idx = (n?: number) => (n === undefined || n === null || n < 0 ? null : n);
  return {
    sessionId: r.Id, item: r.NowPlayingItem,
    audioIndex: idx(ps.AudioStreamIndex), subtitleIndex: idx(ps.SubtitleStreamIndex), playMethod: ps.PlayMethod ?? null,
    transcode: t ? { videoCodec: t.VideoCodec, audioCodec: t.AudioCodec, width: t.Width, height: t.Height, completion: t.CompletionPercentage, reasons: t.TranscodeReasons } : null,
  };
}

export function pollSession(cb: (n: NowPlaying | null) => void, ms = 2000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      const deviceId = jfApiClient()?.deviceId?.();
      const list = await api<unknown[]>('/Sessions', { query: { deviceId } });
      if (!stopped) cb(parseSession(list?.[0]) ?? null);
    } catch { if (!stopped) cb(null); }
    if (!stopped) timer = setTimeout(tick, ms);
  };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
