import { api } from '../api/client';
import type { ClientConfig } from '../types';

export interface Segments { intro: [number, number] | null; credits: number | null }

export async function loadSegments(itemId: string, duration: number, cfg: Pick<ClientConfig, 'introSkipper' | 'creditsFallbackSeconds'>): Promise<Segments> {
  const fallback = duration > 0 ? Math.max(0, duration - (cfg.creditsFallbackSeconds ?? 35)) : null;
  if (!cfg.introSkipper) return { intro: null, credits: fallback };
  try {
    const r = await api<{ Items?: { Type: string; StartTicks: number; EndTicks: number }[] }>(`/MediaSegments/${itemId}`);
    const items = r?.Items ?? [];
    const s = (t: number) => Math.round(t / 1e7);
    const intro = items.find((x) => x.Type === 'Intro');
    const outro = items.find((x) => x.Type === 'Outro');
    return { intro: intro ? [s(intro.StartTicks), s(intro.EndTicks)] : null, credits: outro ? s(outro.StartTicks) : fallback };
  } catch {
    return { intro: null, credits: fallback };
  }
}
