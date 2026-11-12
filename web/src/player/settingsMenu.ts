import { h, icon } from '../ui/dom';
import { createMenu, type PlayerMenu } from './menu';
import type { StockMenu, StockOption } from './stockMenu';
import type { Track } from './tracks';

export const ROW_ICONS: Record<string, string> = {
  audio: 'graphic_eq', aspectratio: 'aspect_ratio', playbackrate: 'speed', quality: 'high_quality', repeatmode: 'repeat', stats: 'info',
};
/** Stock rows Tide shows elsewhere: the subtitle offset is "Timing" in the subtitles menu. */
export const HIDDEN_ROWS = new Set(['suboffset']);
export const BACK_MS = 220;

export interface SettingsDeps {
  stock: StockMenu;
  audio(): { tracks: Track[]; current: number | null };
  pickAudio(index: number): void;
  /** Whether the stock Playback info overlay (`.playerStats`) is showing. */
  statsOn(): boolean;
  /** Fallback: the visible stock settings dialog. */
  openStock(): void;
  onOpenChange(open: boolean): void;
}
export interface SettingsMenu extends PlayerMenu {
  /** Leave a submenu (Esc). False when already at the main list. */
  back(): boolean;
}

type Attrs = Record<string, string>;

export function createSettingsMenu(d: SettingsDeps): SettingsMenu {
  const menu = createMenu('tide-pmset', 'Playback settings', d.onOpenChange);
  const mainList = h('div', { class: 'tide-pm-list' });
  const main = h('div', { class: 'tide-pmset-pane tide-pmset-main' }, h('h6', { class: 'tide-pm-h6' }, 'SETTINGS'), mainList);
  const subTitle = h('b', {});
  const subList = h('div', { class: 'tide-pm-list' });
  const backBtn = h('button', { class: 'tide-pmset-back', type: 'button', 'aria-label': 'Back' }, icon('chevron_left'));
  const sub = h('div', { class: 'tide-pmset-pane tide-pmset-sub' }, h('div', { class: 'tide-pmset-subhd' }, backBtn, subTitle), subList);
  const panes = h('div', { class: 'tide-pmset-panes' }, main, sub);
  menu.el.append(panes);

  let rows: StockOption[] = [];
  let failed = false;
  let drilled: string | null = null;
  let gen = 0;

  const opt = (attrs: Attrs, iconName: string | null, label: string, small: string, right: Node[], on = false) =>
    h('button', { class: `tide-pm-opt${on ? ' on' : ''}`, type: 'button', ...attrs },
      iconName ? icon(iconName, 'tide-pm-ic') : null,
      h('span', { class: 'tide-pm-lb' }, label, small ? h('small', {}, small) : null), ...right);
  const chevron = () => icon('chevron_right', 'tide-pm-chev');
  const check = () => icon('check', 'tide-pm-ck');
  const audioValue = () => {
    const a = d.audio();
    const t = a.tracks.find((x) => x.index === a.current);
    return t ? [t.label, t.sub.split(' · ').pop()].filter(Boolean).join(' · ') : '';
  };
  /** The box keeps the main list's height; submenus scroll inside it (transform-only slide). */
  const measure = () => {
    main.style.position = 'static';
    const hgt = main.offsetHeight;
    main.style.position = '';
    if (hgt > 0) panes.style.setProperty('--tide-pm-h', `${hgt}px`);
  };
  const renderMain = () => {
    const items: HTMLElement[] = [];
    if (d.audio().tracks.length) items.push(opt({ 'data-go': 'audio' }, ROW_ICONS.audio!, 'Audio', '', [h('span', { class: 'tide-pm-val' }, audioValue()), chevron()]));
    for (const r of rows) {
      if (HIDDEN_ROWS.has(r.id)) continue;
      if (r.id === 'stats') {
        const on = d.statsOn();
        items.push(opt({ 'data-toggle': 'stats', role: 'switch', 'aria-checked': String(on) }, ROW_ICONS.stats!, r.text, '', [h('span', { class: 'tide-pm-toggle' }, h('i', {}))], on));
        continue;
      }
      items.push(opt({ 'data-go': r.id }, ROW_ICONS[r.id] ?? 'tune', r.text, '', [h('span', { class: 'tide-pm-val' }, r.aside), chevron()]));
    }
    if (failed) items.push(opt({ 'data-stock': '' }, 'open_in_new', 'Open default menu', '', []));
    mainList.replaceChildren(...items);
    measure();
  };
  const refresh = async () => {
    const g = ++gen;
    try {
      const r = await d.stock.rows();
      if (g !== gen) return;
      rows = r;
      failed = false;
    } catch {
      if (g !== gen) return;
      failed = true;
    }
    renderMain();
  };
  const showSub = (title: string, nodes: HTMLElement[]) => { subTitle.textContent = title; subList.replaceChildren(...nodes); };
  const back = (): boolean => {
    if (!drilled) return false;
    drilled = null;
    menu.el.classList.remove('drill');
    return true;
  };
  const drill = async (id: string) => {
    drilled = id;
    menu.el.classList.add('drill');
    if (id === 'audio') {
      const a = d.audio();
      showSub('Audio', a.tracks.map((t) => opt({ 'data-pick': String(t.index) }, null, t.label, t.sub, [check()], t.index === a.current)));
      return;
    }
    const title = rows.find((r) => r.id === id)?.text ?? '';
    showSub(title, [h('div', { class: 'tide-pm-wait' }, h('span', { class: 'tide-pm-spin' }))]);
    try {
      const options = await d.stock.options(id);
      if (drilled !== id) return;
      showSub(title, options.map((o) => opt({ 'data-pick': o.id }, null, o.text, o.aside, [check()], o.selected)));
    } catch {
      if (drilled !== id) return;
      failed = true;
      back();
      renderMain();
    }
  };

  menu.el.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-go], [data-pick], [data-toggle], [data-stock], .tide-pmset-back');
    if (!t) return;
    if (t.matches('.tide-pmset-back')) { back(); return; }
    if (t.dataset.go) { void drill(t.dataset.go); return; }
    if (t.dataset.stock !== undefined) { menu.close(); back(); d.openStock(); return; }
    if (t.dataset.toggle === 'stats') {
      d.stock.run('stats').then(() => setTimeout(renderMain, 300), () => { failed = true; renderMain(); });
      return;
    }
    const id = drilled;
    const pick = t.dataset.pick;
    if (!id || pick === undefined) return;
    subList.querySelectorAll('.tide-pm-opt').forEach((x) => x.classList.toggle('on', x === t));
    if (id === 'audio') d.pickAudio(Number(pick));
    else d.stock.pick(id, pick).then(refresh, () => { failed = true; renderMain(); });
    renderMain();
    setTimeout(() => { if (drilled === id) back(); }, BACK_MS);
  });

  return {
    el: menu.el,
    open(anchor) { back(); renderMain(); menu.open(anchor); void refresh(); },
    close() { menu.close(); back(); },
    isOpen: menu.isOpen,
    back,
  };
}
