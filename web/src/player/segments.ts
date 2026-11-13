import { api } from '../api/client';
import type { ClientConfig } from '../types';

/** Media segments the skip pill offers (Jellyfin's own skip button covers the same types). Outro is the end card's. */
export type SkipKind = 'intro' | 'recap' | 'preview' | 'commercial';
export interface Skip { kind: SkipKind; start: number; end: number }
export interface Segments { skips: Skip[]; credits: number | null }

const KINDS: Record<string, SkipKind> = { Intro: 'intro', Recap: 'recap', Preview: 'preview', Commercial: 'commercial' };
export const SKIP_LABEL: Record<SkipKind, string> = {
  intro: 'Skip intro', recap: 'Skip recap', preview: 'Skip preview', commercial: 'Skip commercial',
};

export const skipAt = (segs: Segments, position: number): Skip | null =>
  segs.skips.find((k) => position >= k.start && position < k.end) ?? null;

/** Segments from any provider (Intro Skipper or another plugin); credits fall back to the setting without an Outro. */
export async function loadSegments(itemId: string, duration: number, cfg: Pick<ClientConfig, 'creditsFallbackSeconds'>): Promise<Segments> {
  const fallback = duration > 0 ? Math.max(0, duration - (cfg.creditsFallbackSeconds ?? 35)) : null;
  try {
    const r = await api<{ Items?: { Type: string; StartTicks: number; EndTicks: number }[] }>(`/MediaSegments/${itemId}`);
    const items = r?.Items ?? [];
    const s = (t: number) => Math.round(t / 1e7);
    const skips = items
      .flatMap((x): Skip[] => {
        const kind = KINDS[x.Type];
        return kind && x.EndTicks > x.StartTicks ? [{ kind, start: s(x.StartTicks), end: s(x.EndTicks) }] : [];
      })
      .sort((a, b) => a.start - b.start);
    const outro = items.find((x) => x.Type === 'Outro');
    return { skips, credits: outro ? s(outro.StartTicks) : fallback };
  } catch {
    return { skips: [], credits: fallback };
  }
}
