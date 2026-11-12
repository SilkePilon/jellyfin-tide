import { h, icon } from '../ui/dom';
import type { JfDetail, JfStream } from '../api/item';

export interface SheetData { audio: { index: number; label: string; sub: string }[]; subtitles: { index: number; label: string; sub: string }[]; audioIndex: number | null; subtitleIndex: number | null; quality: string[]; qualityCur: string; speed: number; subSize: 'S' | 'M' | 'L' | 'XL' }
export interface SettingsSheet { el: HTMLElement; open(): void; close(): void; isOpen(): boolean; setData(d: SheetData): void; dispose(): void }
type Kind = 'audio' | 'subtitles' | 'quality' | 'speed' | 'subSize';

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

export function streamsToSheet(item: JfDetail): Pick<SheetData, 'audio' | 'subtitles'> {
  // Full items carry streams per MediaSource; session NowPlayingItems carry them top-level.
  const streams = item.MediaSources?.[0]?.MediaStreams ?? (item as JfDetail & { MediaStreams?: JfStream[] }).MediaStreams ?? [];
  const pick = (type: string) => streams.filter((s) => s.Type === type).map((s, i) => ({ index: s.Index ?? -1, ...describe(s, i + 1) }));
  return { audio: pick('Audio'), subtitles: pick('Subtitle') };
}

export function createSettingsSheet(onPick: (kind: Kind, value: string) => void, onOpenChange: (open: boolean) => void): SettingsSheet {
  const el = h('div', { class: 'tide-pset', role: 'dialog', 'aria-label': 'Playback settings', 'aria-hidden': 'true' });
  let open = false;
  let last = '';
  const opt = (kind: Kind, value: string, label: string, sub: string, on: boolean) =>
    h('button', { class: `tide-pset-opt${on ? ' on' : ''}`, type: 'button', 'data-kind': kind, 'data-value': value }, h('span', {}, label, sub ? h('small', {}, sub) : null), icon('check', 'tide-pset-ck'));
  const chip = (kind: Kind, value: string, label: string, on: boolean) =>
    h('button', { class: `tide-pset-chip${on ? ' on' : ''}`, type: 'button', 'data-kind': kind, 'data-value': value }, label);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]');
    if (!t) return;
    const kind = t.dataset.kind as Kind;
    el.querySelectorAll(`[data-kind="${kind}"]`).forEach((x) => x.classList.toggle('on', x === t));
    onPick(kind, t.dataset.value!);
  });
  return {
    el,
    open() { if (open) return; open = true; el.classList.add('open'); el.removeAttribute('aria-hidden'); onOpenChange(true); },
    close() { if (!open) return; open = false; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); onOpenChange(false); },
    isOpen: () => open,
    setData(d) {
      // Called on every 2 s session poll: rebuilding an open sheet would drop hover / keyboard focus.
      const key = JSON.stringify(d);
      if (key === last) return;
      last = key;
      el.replaceChildren(
        h('div', { class: 'tide-pset-col' }, h('h5', {}, 'AUDIO'), ...d.audio.map((a) => opt('audio', String(a.index), a.label, a.sub, a.index === d.audioIndex))),
        h('div', { class: 'tide-pset-col' }, h('h5', {}, 'SUBTITLES'), opt('subtitles', '-1', 'Off', '', d.subtitleIndex === null),
          ...d.subtitles.map((s) => opt('subtitles', String(s.index), s.label, s.sub, s.index === d.subtitleIndex))),
        h('div', { class: 'tide-pset-col' },
          h('h5', {}, 'QUALITY'), h('div', { class: 'tide-pset-chips' }, ...d.quality.map((q) => chip('quality', q, q, q === d.qualityCur))),
          h('h5', {}, 'SPEED'), h('div', { class: 'tide-pset-chips' }, ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((x) => chip('speed', String(x), `${x}×`, x === d.speed))),
          h('h5', {}, 'SUBTITLE SIZE'), h('div', { class: 'tide-pset-chips' }, ...(['S', 'M', 'L', 'XL'] as const).map((x) => chip('subSize', x, x, x === d.subSize)))));
    },
    dispose() { /* nothing */ },
  };
}
