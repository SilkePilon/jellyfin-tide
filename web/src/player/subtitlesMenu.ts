import { h, icon } from '../ui/dom';
import { createMenu, type PlayerMenu } from './menu';
import type { Track } from './tracks';
import type { Lang, OnlineSubs, RemoteSub } from './onlineSubs';

export type SubSize = 'S' | 'M' | 'L' | 'XL';
export const SIZES: SubSize[] = ['S', 'M', 'L', 'XL'];
export const TIMING_STEP = 0.1;

export interface SubtitlesDeps {
  tracks(): { list: Track[]; current: number | null };
  /** null = Off. */
  pick(index: number | null): void;
  size(): SubSize;
  setSize(s: SubSize): void;
  /** Stock subtitle offset (player/stockMenu.ts createSubOffset), null when not offered. */
  timing: { available(): Promise<boolean>; get(): number | null; set(seconds: number): Promise<void> } | null;
  online(): OnlineSubs | null;
  /** A downloaded subtitle arrived as stream `index`: the player restarts playback with it. */
  onDownloaded(index: number): void;
  onOpenChange(open: boolean): void;
}
export interface SubtitlesMenu extends PlayerMenu { refresh(): void }

export function filterTracks(list: Track[], q: string): Track[] {
  const s = q.trim().toLowerCase();
  return s ? list.filter((t) => `${t.label} ${t.sub}`.toLowerCase().includes(s)) : list;
}
export function shortName(t: Track): string {
  const tag = /\bForced\b/.test(t.sub) ? 'Forced' : /\bSDH\b/.test(t.sub) ? 'SDH' : '';
  return tag ? `${t.label} · ${tag}` : t.label;
}
export const fmtOffset = (s: number): string => `${s > 0 ? '+' : ''}${s.toFixed(1)} s`;

type Attrs = Record<string, string>;

export function createSubtitlesMenu(d: SubtitlesDeps): SubtitlesMenu {
  const menu = createMenu('tide-pmsub', 'Subtitles', d.onOpenChange);
  const input = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search subtitles' }) as HTMLInputElement;
  const clear = h('button', { class: 'tide-pmsub-clear', type: 'button', 'aria-label': 'Clear', hidden: true }, icon('close'));
  const body = h('div', { class: 'tide-pm-list tide-pmsub-body' });
  const sizes = h('div', { class: 'tide-pmsub-chips' }, ...SIZES.map((s) => h('button', { type: 'button', 'data-size': s }, s)));
  const out = h('output', {}, fmtOffset(0));
  const timingRow = h('div', { class: 'tide-pmsub-row', hidden: true }, h('span', {}, 'Timing'),
    h('div', { class: 'tide-pmsub-step' },
      h('button', { type: 'button', 'data-sync': '-1', 'aria-label': 'Subtitles earlier' }, icon('remove')), out,
      h('button', { type: 'button', 'data-sync': '1', 'aria-label': 'Subtitles later' }, icon('add'))));
  const foot = h('div', { class: 'tide-pmsub-foot' }, h('div', { class: 'tide-pmsub-row' }, h('span', {}, 'Size'), sizes), timingRow);
  menu.el.append(h('div', { class: 'tide-pmsub-search' }, icon('search'), input, clear), body, foot);

  let state: 'idle' | 'loading' | 'done' | 'error' = 'idle';
  let results: RemoteSub[] = [];
  let lang: Lang | null = null;
  const dl = new Map<string, 'busy' | 'ok' | 'err'>();
  let colFile = false;
  let colOnline = false;
  let lastKey = '';

  const row = (attrs: Attrs, label: string, sub: string, on: boolean, right: Node = icon('check', 'tide-pm-ck')) =>
    h('button', { class: `tide-pm-opt${on ? ' on' : ''}`, type: 'button', ...attrs },
      h('span', { class: 'tide-pm-lb' }, label, sub ? h('small', {}, sub) : null), right);
  const head = (key: 'file' | 'online', label: string, n: string, col: boolean, cur: string) =>
    h('button', { class: `tide-pmsub-hd${col ? ' col' : ''}`, type: 'button', 'data-col': key, 'aria-expanded': String(!col) },
      label, h('span', { class: 'tide-pmsub-n' }, n), h('span', { class: 'tide-pmsub-cur' }, cur), icon('expand_more'));
  const find = (text: string) => h('button', { class: 'tide-pm-opt', type: 'button', 'data-find': '' },
    icon('travel_explore', 'tide-pm-ic'), h('span', { class: 'tide-pm-lb' }, text));
  const status = (r: RemoteSub): Node => {
    const s = dl.get(r.id);
    if (s === 'busy') return h('span', { class: 'tide-pm-spin' });
    if (s === 'ok') return icon('check_circle', 'tide-pmsub-ok');
    if (s === 'err') return icon('error', 'tide-pmsub-err');
    return h('span', { class: 'tide-pmsub-dl' }, icon('download'));
  };
  const detail = (r: RemoteSub) => [r.name, r.format, r.provider, r.downloads ? `${r.downloads.toLocaleString('en-US')} downloads` : '']
    .filter(Boolean).join(' · ');

  const renderBody = () => {
    const { list, current } = d.tracks();
    const online = d.online();
    const q = input.value.trim();
    clear.hidden = !q;
    input.placeholder = online ? 'Search tracks or online' : 'Search languages';
    const shown = filterTracks(list, q);
    // Section headers only exist once there is a second (online) section; before that it is a plain list.
    const sections = !!online && (q !== '' || state !== 'idle');
    const cur = list.find((t) => t.index === current);
    const nodes: Node[] = [];
    if (!q) nodes.push(row({ 'data-sub': '-1' }, 'Off', '', current === null));
    if (sections) nodes.push(head('file', 'IN THIS FILE', String(shown.length), colFile, current === null ? 'Off' : cur ? shortName(cur) : ''));
    if (!sections || !colFile) {
      const sec = h('div', { class: 'tide-pmsub-sec' }, ...shown.map((t) => row({ 'data-sub': String(t.index) }, t.label, t.sub, t.index === current)));
      if (q && !shown.length) sec.append(h('div', { class: 'tide-pm-empty' }, `No “${q}” track in this file.`));
      nodes.push(sec);
    }
    if (online && !sections) nodes.push(find('Find subtitles online'));
    if (online && sections) {
      nodes.push(head('online', `ONLINE · ${online.providers.join(', ').toUpperCase()}`, state === 'done' ? String(results.length) : '…',
        colOnline, [...dl.values()].includes('ok') ? 'Downloaded' : ''));
      if (!colOnline) {
        const sec = h('div', { class: 'tide-pmsub-sec' });
        if (state === 'idle') sec.append(find(`Search online for “${q}”`));
        else if (state === 'loading') sec.append(h('div', { class: 'tide-pm-opt' }, h('span', { class: 'tide-pm-spin' }), h('span', { class: 'tide-pm-lb' }, 'Searching…')));
        else if (state === 'error') sec.append(h('div', { class: 'tide-pm-empty' }, 'Online search failed.'), find('Search again'));
        else if (!results.length) sec.append(h('div', { class: 'tide-pm-empty' }, `No ${lang?.name ?? ''} subtitles found.`.replace('No  ', 'No ')));
        else sec.append(...results.map((r) => row({ 'data-dl': r.id }, lang?.name ?? r.name,
          dl.get(r.id) === 'err' ? 'Couldn’t download. Try another.' : detail(r), false, status(r))));
        nodes.push(sec);
      }
    }
    body.replaceChildren(...nodes);
  };
  const renderFoot = () => {
    sizes.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === d.size()));
    out.textContent = fmtOffset(d.timing?.get() ?? 0);
  };
  const searchOnline = async () => {
    const online = d.online();
    if (!online || state === 'loading') return;
    const q = input.value.trim();
    state = 'loading';
    colFile = true;
    colOnline = false;
    dl.clear();
    renderBody();
    try {
      const resolved = q ? await online.resolveLang(q) : null;
      lang = resolved ?? online.defaultLang;
      results = await online.search(lang.code, q && !resolved ? q : undefined);
      state = 'done';
    } catch {
      state = 'error';
    }
    renderBody();
  };
  const download = async (id: string) => {
    const online = d.online();
    const r = results.find((x) => x.id === id);
    if (!online || !r || dl.get(id) === 'busy' || dl.get(id) === 'ok') return;
    dl.set(id, 'busy');
    renderBody();
    try {
      const index = await online.download(r);
      dl.set(id, 'ok');
      renderBody();
      d.onDownloaded(index);
    } catch {
      dl.set(id, 'err');
      renderBody();
    }
  };

  input.addEventListener('input', () => { state = 'idle'; results = []; dl.clear(); colFile = false; colOnline = false; renderBody(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && d.online() && input.value.trim()) { e.preventDefault(); void searchOnline(); }
  });
  clear.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });
  menu.el.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-sub], [data-col], [data-find], [data-dl], [data-size], [data-sync]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.sub !== undefined) { const i = Number(ds.sub); d.pick(i < 0 ? null : i); renderBody(); return; }
    if (ds.col) { if (ds.col === 'file') colFile = !colFile; else colOnline = !colOnline; renderBody(); return; }
    if (ds.find !== undefined) { void searchOnline(); return; }
    if (ds.dl) { void download(ds.dl); return; }
    if (ds.size) { d.setSize(ds.size as SubSize); renderFoot(); return; }
    if (ds.sync && d.timing) {
      const v = Math.round(((d.timing.get() ?? 0) + Number(ds.sync) * TIMING_STEP) * 10) / 10;
      out.textContent = fmtOffset(v);
      d.timing.set(v).then(renderFoot, () => { timingRow.hidden = true; });
    }
  });

  const key = () => JSON.stringify([d.tracks(), !!d.online()]);
  return {
    el: menu.el,
    open(anchor) {
      lastKey = key();
      renderBody();
      renderFoot();
      menu.open(anchor);
      if (d.timing) d.timing.available().then((ok) => { timingRow.hidden = !ok; }, () => { timingRow.hidden = true; });
      setTimeout(() => input.focus(), 50);
    },
    close: menu.close,
    isOpen: menu.isOpen,
    refresh() {
      if (!menu.isOpen()) return;
      const k = key();
      if (k === lastKey) return;
      lastKey = k;
      renderBody();
    },
  };
}
