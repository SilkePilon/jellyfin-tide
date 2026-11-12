import './search.css';
import { getSession, imageUrl } from '../api/client';
import { openDetails, play } from '../api/actions';
import { getNextUp } from '../api/item';
import { fmtRuntime, h, icon } from '../ui/dom';
import { CHIPS, genreTitles, groupHints, PLAYABLE, searchHints, topGenres, type Chip, type GenreTile, type Hint } from './searchApi';
import { addRecent, loadRecent, removeRecent } from './recent';

export const DEBOUNCE_MS = 120;
const CACHE_MAX = 20;
export const TYPE_LABEL: Record<string, string> = {
  Movie: 'Movie', Series: 'Show', Episode: 'Episode', Person: 'Person', MusicArtist: 'Artist', MusicAlbum: 'Album', Audio: 'Song', BoxSet: 'Collection', Playlist: 'Playlist',
};
export interface SearchDialog { el: HTMLElement; open(): void; close(): void; isOpen(): boolean }
export interface SearchDeps {
  search?: (q: string, signal?: AbortSignal) => Promise<Hint[]>;
  genres?: () => Promise<GenreTile[]>;
  genreTitles?: (id: string) => Promise<Hint[]>;
  userId?: () => string;
}

export function subline(x: Hint): string {
  const year = x.ProductionYear ? String(x.ProductionYear) : '';
  const join = (...p: (string | null | undefined)[]) => p.filter(Boolean).join(' · ');
  switch (x.Type) {
    case 'Movie': return join(year, fmtRuntime(x.RunTimeTicks));
    case 'Series': return join(year, x.ChildCount ? `${x.ChildCount} season${x.ChildCount === 1 ? '' : 's'}` : '');
    case 'Episode': return join(x.Series, x.ParentIndexNumber != null && x.IndexNumber != null ? `S${x.ParentIndexNumber} E${x.IndexNumber}` : '', fmtRuntime(x.RunTimeTicks));
    case 'MusicAlbum': return join(x.AlbumArtist ?? x.Artists?.[0], year);
    case 'Audio': return join(x.AlbumArtist ?? x.Artists?.[0], x.Album);
    default: return join(TYPE_LABEL[x.Type], year);
  }
}

function highlight(text: string, q: string): (string | HTMLElement)[] {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  return i < 0 ? [text] : [text.slice(0, i), h('mark', {}, text.slice(i, i + q.length)), text.slice(i + q.length)];
}

function thumb(x: Hint, big = false): HTMLElement {
  const kind = x.Type === 'Episode' ? 'ep' : x.Type === 'Person' || x.Type === 'MusicArtist' ? 'pe' : ['MusicAlbum', 'Audio', 'Playlist'].includes(x.Type) ? 'sq' : 'po';
  const el = h('i', { class: `tide-sd-th ${kind}` });
  const id = x.Type === 'Audio' && x.AlbumId ? x.AlbumId : x.Id;
  const tag = x.Type === 'Audio' && x.AlbumId ? x.AlbumPrimaryImageTag : x.PrimaryImageTag;
  if (tag) el.style.backgroundImage = `url("${imageUrl(id, 'Primary', big ? 300 : 160, tag)}")`;
  return el;
}

const keyHint = (keys: string[], label: string) => h('span', {}, ...keys.map((k) => h('kbd', {}, k)), ` ${label}`);

export function createSearchDialog(deps: SearchDeps = {}): SearchDialog {
  const search = deps.search ?? searchHints;
  const genres = deps.genres ?? topGenres;
  const titlesOf = deps.genreTitles ?? genreTitles;
  const uid = deps.userId ?? (() => getSession()?.userId ?? '');

  const input = h('input', { class: 'tide-sd-q', type: 'text', placeholder: 'Search movies, shows, episodes, people, music', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search' }) as HTMLInputElement;
  const clear = h('button', { class: 'tide-sd-clear', type: 'button', 'aria-label': 'Clear', hidden: true }, icon('close'));
  const esc = h('kbd', { class: 'tide-sd-esc' }, 'Esc');
  const chipsBox = h('div', { class: 'tide-sd-chips' });
  const body = h('div', { class: 'tide-sd-body' });
  const foot = h('div', { class: 'tide-sd-foot' }, keyHint(['↑', '↓'], 'move'), keyHint(['Enter'], 'open'), keyHint(['Shift', 'Enter'], 'play'), h('span', { class: 'tide-sd-sp' }), keyHint(['Esc'], 'close'));
  const scrim = h('div', { class: 'tide-sd-scrim' });
  const panel = h('div', { class: 'tide-sd', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search' },
    h('div', { class: 'tide-sd-in' }, icon('search'), input, clear, esc), chipsBox, body, foot);
  const el = h('div', { class: 'tide-sd-wrap', 'aria-hidden': 'true' }, scrim, panel);

  let open = false;
  let chip: Chip = 'all';
  let hints: Hint[] = [];
  let order: Hint[] = [];
  let sel = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctrl: AbortController | null = null;
  let genre: { id: string; name: string } | null = null;
  let tiles: GenreTile[] | null = null;
  let returnFocus: HTMLElement | null = null;
  const cache = new Map<string, Hint[]>();

  const row = (x: Hint, i: number, q: string) => h('button', { class: `tide-sd-row${i === sel ? ' sel' : ''}`, type: 'button', 'data-i': String(i) },
    thumb(x), h('span', { class: 'tide-sd-tt' }, h('b', {}, ...highlight(x.Name, q)), h('small', {}, subline(x))),
    h('span', { class: 'tide-sd-ty' }, TYPE_LABEL[x.Type] ?? x.Type), icon('arrow_forward', 'tide-sd-go'));

  const renderEmpty = () => {
    const recent = loadRecent(uid());
    const nodes: Node[] = [];
    if (recent.length) {
      nodes.push(h('div', { class: 'tide-sd-hd' }, 'RECENT'), ...recent.map((r) => h('div', { class: 'tide-sd-recent', role: 'button', tabindex: '0', 'data-recent': r },
        icon('history'), h('span', { class: 'tide-sd-rl' }, r), h('button', { class: 'tide-sd-rx', type: 'button', 'aria-label': `Remove ${r}`, 'data-recent-x': r }, icon('close')))));
    }
    if (tiles?.length) {
      nodes.push(h('div', { class: 'tide-sd-hd' }, 'BROWSE'), h('div', { class: 'tide-sd-genres' }, ...tiles.map((t) => {
        const tile = h('button', { class: 'tide-sd-gt', type: 'button', 'data-genre': t.id, 'data-name': t.name }, h('span', {}, t.name));
        if (t.image) tile.style.backgroundImage = `url("${t.image}")`;
        return tile;
      })));
    }
    order = [];
    chipsBox.replaceChildren();
    body.replaceChildren(...nodes);
  };

  const render = () => {
    const q = input.value.trim();
    clear.hidden = !q;
    esc.hidden = !!q;
    if (!q && !genre) { renderEmpty(); return; }
    if (genre) {
      order = hints;
      chipsBox.replaceChildren();
      body.replaceChildren(h('div', { class: 'tide-sd-hd' }, genre.name.toUpperCase()), ...hints.map((x, i) => row(x, i, '')));
      return;
    }
    const g = groupHints(hints, chip);
    chipsBox.replaceChildren(...CHIPS.filter((c) => c.id === 'all' || g.counts[c.id] > 0).map((c) =>
      h('button', { class: `tide-sd-chip${c.id === chip ? ' on' : ''}`, type: 'button', 'data-chip': c.id }, c.label, h('span', { class: 'tide-sd-n' }, String(g.counts[c.id] ?? 0)))));
    if (!hints.length) { order = []; body.replaceChildren(h('div', { class: 'tide-sd-empty' }, `No results for “${q}”.`)); return; }
    order = [...(g.top ? [g.top] : []), ...g.groups.flatMap((x) => x.items)];
    sel = Math.min(sel, Math.max(0, order.length - 1));
    const nodes: Node[] = [];
    let i = 0;
    if (g.top) {
      const t = g.top;
      nodes.push(h('div', { class: 'tide-sd-hd' }, 'TOP RESULT'), h('div', { class: `tide-sd-row tide-sd-top${sel === 0 ? ' sel' : ''}`, role: 'button', tabindex: '-1', 'data-i': '0' },
        thumb(t, true), h('span', { class: 'tide-sd-tt' }, h('b', {}, ...highlight(t.Name, q)), h('small', {}, [TYPE_LABEL[t.Type], subline(t)].filter(Boolean).join(' · '))),
        PLAYABLE.has(t.Type) ? h('button', { class: 'tide-sd-play', type: 'button', 'data-play': '0' }, icon('play_arrow'), 'Play') : null));
      i = 1;
    }
    for (const grp of g.groups) {
      if (chip === 'all') nodes.push(h('div', { class: 'tide-sd-hd' }, grp.title.toUpperCase()));
      for (const x of grp.items) nodes.push(row(x, i++, q));
    }
    body.replaceChildren(...nodes);
  };

  const updateSel = () => {
    body.querySelectorAll<HTMLElement>('[data-i]').forEach((r) => r.classList.toggle('sel', Number(r.dataset.i) === sel));
    body.querySelector<HTMLElement>('.sel')?.scrollIntoView?.({ block: 'nearest' });
  };

  const runSearch = (q: string) => {
    const hit = cache.get(q);
    if (hit) { hints = hit; sel = 0; render(); return; }
    ctrl?.abort();
    const c = new AbortController();
    ctrl = c;
    search(q, c.signal).then((r) => {
      cache.set(q, r);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
      if (c.signal.aborted || input.value.trim() !== q) return;
      hints = r;
      sel = 0;
      render();
    }).catch(() => { /* aborted or offline: keep the last results */ });
  };

  const close = () => {
    if (!open) return;
    open = false;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('tide-sd-on');
    ctrl?.abort();
    if (timer) clearTimeout(timer);
    returnFocus?.focus?.();
  };

  const activate = async (x: Hint | undefined, playIt: boolean) => {
    if (!x) return;
    const q = input.value.trim();
    if (q) addRecent(uid(), q);
    close();
    if (playIt && PLAYABLE.has(x.Type)) {
      if (x.Type === 'Series') {
        const nu = await getNextUp(x.Id).catch(() => null);
        void play(nu?.Id ?? x.Id);
      } else void play(x.Id);
      return;
    }
    openDetails(x.Id);
  };

  input.addEventListener('input', () => {
    genre = null;
    chip = 'all';
    sel = 0;
    const q = input.value.trim();
    if (timer) clearTimeout(timer);
    if (!q) { ctrl?.abort(); hints = []; render(); return; }
    timer = setTimeout(() => runSearch(q), DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!order.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + order.length) % order.length;
      updateSel();
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); void activate(order[sel], e.shiftKey); }
  });
  clear.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });
  scrim.addEventListener('click', close);
  panel.addEventListener('click', (e) => {
    const t = e.target as Element;
    const x = t.closest<HTMLElement>('[data-recent-x]');
    if (x) { e.stopPropagation(); removeRecent(uid(), x.dataset.recentX!); render(); input.focus(); return; }
    const r = t.closest<HTMLElement>('[data-recent]');
    if (r) { input.value = r.dataset.recent!; input.dispatchEvent(new Event('input')); input.focus(); return; }
    const gt = t.closest<HTMLElement>('[data-genre]');
    if (gt) {
      const g = { id: gt.dataset.genre!, name: gt.dataset.name ?? '' };
      genre = g;
      hints = [];
      sel = 0;
      titlesOf(g.id).then((list) => { if (genre?.id === g.id) { hints = list; render(); } }).catch(() => {});
      render();
      input.focus();
      return;
    }
    const c = t.closest<HTMLElement>('[data-chip]');
    if (c) { chip = c.dataset.chip as Chip; sel = 0; render(); input.focus(); return; }
    const p = t.closest<HTMLElement>('[data-play]');
    if (p) { void activate(order[Number(p.dataset.play)], true); return; }
    const rowEl = t.closest<HTMLElement>('[data-i]');
    if (rowEl) void activate(order[Number(rowEl.dataset.i)], false);
  });
  body.addEventListener('mousemove', (e) => {
    const r = (e.target as Element).closest<HTMLElement>('[data-i]');
    if (r && Number(r.dataset.i) !== sel) { sel = Number(r.dataset.i); updateSel(); }
  });
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.preventDefault(); close(); } });

  return {
    el,
    open() {
      if (open) return;
      open = true;
      returnFocus = document.activeElement as HTMLElement | null;
      input.value = '';
      chip = 'all';
      hints = [];
      genre = null;
      sel = 0;
      render();
      el.classList.add('open');
      el.removeAttribute('aria-hidden');
      document.documentElement.classList.add('tide-sd-on');
      if (!tiles) genres().then((t) => { tiles = t; if (open && !input.value.trim() && !genre) render(); }).catch(() => { tiles = []; });
      setTimeout(() => input.focus(), 30);
    },
    close,
    isOpen: () => open,
  };
}
