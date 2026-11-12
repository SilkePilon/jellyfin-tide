import type { JfDetail, JfStream } from '../api/item';

export interface Track { index: number; label: string; sub: string }

const CODEC: Record<string, string> = { SUBRIP: 'SRT', SRT: 'SRT', PGSSUB: 'PGS', PGS: 'PGS', DVDSUB: 'VobSub', ASS: 'ASS', SSA: 'SSA', WEBVTT: 'VTT', MOV_TEXT: 'Text', DVBSUB: 'DVB' };
const UNKNOWN = /^(undefined|und|unknown)$/i;
const CODEC_NAME = /^(aac|ac-?3|e-?ac-?3|eac3|dts(-hd)?( ma)?|truehd|flac|mp3|mp2|opus|vorbis|alac|pcm.*|dolby .*|atmos)$/i;
/** Muxer / handler names that files carry as a track Title (SoundHandler, ISO Media file produced by...). */
const JUNK_TITLE = /^(sound|video|subtitle|text|audio)\s*handler$|^(iso media|core media|gpac|lavf|mainconcept|apple|mp4|l-smash|handbrake|\(c\))/i;

/**
 * Track label + second line. "English - Dolby Digital+ - 5.1 - Default" -> English / Dolby Digital+ · 5.1.
 * Tracks without a language (Jellyfin says "Undefined") use their own Title, else "Track N".
 */
function describe(raw: JfStream, n: number): { label: string; sub: string } {
  const junk = !!raw.Title && JUNK_TITLE.test(raw.Title.trim());
  const s: JfStream = junk ? { ...raw, Title: undefined, DisplayTitle: raw.DisplayTitle?.split(' - ').filter((p) => p.trim() !== raw.Title!.trim()).join(' - ') } : raw;
  const all = (s.DisplayTitle ?? '').split(' - ').map((p) => p.trim()).filter((p) => p && !/^(default|external|forced)$/i.test(p));
  // Jellyfin leaves out the language/title part when a track has neither ("AAC - Stereo - Default"): then the first
  // part is the codec, not a name.
  const head = all[0] ?? '';
  const headless = !!head && ((!!s.Codec && head.toUpperCase() === s.Codec.toUpperCase()) || !!CODEC[head.toUpperCase()] || CODEC_NAME.test(head));
  const parts = headless ? ['', ...all] : all;
  const lang = parts[0] && !UNKNOWN.test(parts[0]) ? parts[0] : '';
  const label = lang || s.Title?.trim() || `Track ${n}`;
  const rest = parts.slice(1).map((p) => CODEC[p.toUpperCase()] ?? p);
  if (!parts.length && s.Codec) rest.push(CODEC[s.Codec.toUpperCase()] ?? s.Codec.toUpperCase());
  if (s.IsForced) rest.push('Forced');
  if (s.IsHearingImpaired && !rest.includes('SDH')) rest.push('SDH');
  if (lang && s.Title && s.Title.trim() !== lang && !rest.includes(s.Title.trim())) rest.unshift(s.Title.trim());
  return { label, sub: rest.join(' · ') };
}

/** Audio and subtitle tracks with readable labels. Full items carry streams per MediaSource; session items top-level. */
export function trackLists(item: JfDetail | null): { audio: Track[]; subtitles: Track[] } {
  if (!item) return { audio: [], subtitles: [] };
  const streams = item.MediaSources?.[0]?.MediaStreams ?? (item as JfDetail & { MediaStreams?: JfStream[] }).MediaStreams ?? [];
  const pick = (type: string) => streams.filter((s) => s.Type === type).map((s, i) => ({ index: s.Index ?? -1, ...describe(s, i + 1) }));
  return { audio: pick('Audio'), subtitles: pick('Subtitle') };
}
