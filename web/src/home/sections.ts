import './sections.css';
import { api, imageUrl } from '../api/client';
import { openDetails, play, setFavourite } from '../api/actions';
import { h, icon } from '../ui/dom';
import { toggleButton } from '../ui/toggle';
import { cached, HOME_TTL, peek } from '../api/cache';
import { backdropOf, chain, logoOf, primaryOf, sources } from '../ui/images';
import type { RenderedRow } from './rowView';
import type { RowContext, RowDef } from './rows';
import type { JfItem } from '../types';

function lazySection(section: HTMLElement, load: () => Promise<void>): () => void {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      void load();
    }
  }, { rootMargin: '600px 0px' });
  io.observe(section);
  return () => io.disconnect();
}

function logoOrTitle(item: JfItem, title: string, cls: string): HTMLElement {
  const text = () => h('span', { class: `${cls} ${cls}-text` }, title);
  const img = h('img', { class: cls, alt: title, loading: 'lazy', decoding: 'async' }) as HTMLImageElement;
  return chain(img, sources([logoOf(item, 480), item.Id, 'Logo', 480]), () => img.replaceWith(text())) ? img : text();
}

// ── New this week (bento) ─────────────────────────────────────────────────────────────────────────────────────────

export function renderBento(def: RowDef, ctx: RowContext): RenderedRow {
  const grid = h('div', { class: 'tide-bento' });
  const section = h('section', { class: 'tide-row tide-row-bento', 'data-row': def.id }, h('div', { class: 'tide-row-head' }, h('h2', { class: 'tide-row-title' }, def.title(ctx))), grid);
  let disposed = false;
  const show = (list: JfItem[]) => {
    if (list.length < 3) { section.hidden = true; return; }
    grid.dataset.count = String(list.length);
    grid.replaceChildren(...list.map((item, i) => {
      const w = i === 0 ? 1280 : 720;
      const art = h('img', { class: 'tide-bento-art', alt: '', loading: 'lazy', decoding: 'async' }) as HTMLImageElement;
      const hasArt = chain(art, sources([backdropOf(item, w), item.Id, 'Backdrop/0', w], [primaryOf(item, 720), item.Id, 'Primary', 720]), () => art.remove());
      return h('a', { class: `tide-bento-tile tide-bento-${i}`, href: '#', 'data-id': item.Id, 'aria-label': item.Name,
        onclick: (e: Event) => { e.preventDefault(); void openDetails(item.Id); } },
        h('span', { class: 'tide-card-shadow', 'aria-hidden': 'true' }),
        hasArt ? art : null, logoOrTitle(item, item.Name, 'tide-bento-logo'), h('span', { class: 'tide-chip tide-chip-w tide-bento-new' }, 'NEW'));
    }));
  };
  const ready = peek<JfItem[]>(`row:${def.id}`, HOME_TTL);
  if (ready) { show(ready.v); return { el: section, dispose: () => { disposed = true; } }; }
  const stop = lazySection(section, async () => {
    try {
      const list = await cached(`row:${def.id}`, HOME_TTL, () => def.fetch(ctx));
      if (disposed) return;
      show(list);
    } catch (e) {
      console.warn('[Tide] new this week failed', e);
      section.hidden = true;
    }
  });
  return { el: section, dispose: () => { disposed = true; stop(); } };
}

// ── Discover (constellation) ─────────────────────────────────────────────────────────────────────────────────────

export const MOODS: Record<string, string> = {
  'Science Fiction': 'Mind-bending sci-fi', 'Sci-Fi & Fantasy': 'Mind-bending sci-fi', Documentary: 'Nature, up close',
  Crime: 'Crime with a twist', Animation: 'Animated & fun', Action: 'Pure adrenaline', 'Action & Adventure': 'Pure adrenaline',
  Comedy: 'Laugh out loud', Drama: 'Gripping drama',
};
export const moodFor = (genre?: string): string => (genre && MOODS[genre]) || 'Hidden gems';

/** [x %, y %, width px, depth]. Slot 0 is the focused centre. */
export const SLOTS: [number, number, number, 'center' | 'front' | 'mid' | 'far'][] = [
  [50, 44, 250, 'center'], [18, 54, 175, 'front'], [28, 30, 140, 'mid'], [8, 26, 105, 'far'], [82, 30, 160, 'front'],
  [72, 62, 170, 'front'], [93, 64, 120, 'mid'], [64, 16, 100, 'far'], [31, 80, 100, 'far'], [6, 76, 110, 'mid'],
];
const PILL_SLOTS: Record<number, [number, number]> = { 1: [18, 86], 4: [82, 9], 5: [72, 93] };
const BASE_W = 250;

export interface DiscoverItem { item: JfItem; reason: string }

/** 3 "Because you watched", 4 top-rated unwatched, 3 random unwatched; de-duplicated; posters required. */
export async function pickDiscover(ctx: RowContext): Promise<DiscoverItem[]> {
  const q = { userId: ctx.userId, Fields: 'Genres,ProductionYear,CommunityRating,Overview', EnableUserData: true, ImageTypeLimit: 1 };
  type R = { Items: JfItem[] };
  const src = ctx.becauseOf;
  const [similar, top, random] = await Promise.all([
    src ? api<R>(`/Items/${src.SeriesId ?? src.Id}/Similar`, { query: { ...q, Limit: 8 } }).then((r) => r.Items ?? []).catch(() => []) : Promise.resolve([] as JfItem[]),
    api<R>('/Items', { query: { ...q, Recursive: true, IncludeItemTypes: 'Movie,Series', IsPlayed: false, SortBy: 'CommunityRating', SortOrder: 'Descending', Limit: 12 } }).then((r) => r.Items ?? []).catch(() => []),
    api<R>('/Items', { query: { ...q, Recursive: true, IncludeItemTypes: 'Movie,Series', IsPlayed: false, SortBy: 'Random', Limit: 12 } }).then((r) => r.Items ?? []).catch(() => []),
  ]);
  const seen = new Set<string>();
  const out: DiscoverItem[] = [];
  const take = (list: JfItem[], n: number, reason: string) => {
    for (const it of list) {
      if (n <= 0 || out.length >= SLOTS.length) break;
      if (seen.has(it.Id) || (it.ImageTags && !it.ImageTags.Primary)) continue;
      seen.add(it.Id);
      out.push({ item: it, reason });
      n--;
    }
  };
  const because = src ? `Because you watched ${src.SeriesName ?? src.Name}` : '';
  take(top, 4, 'Top rated · you haven’t watched it yet');
  if (because) take(similar, 3, because);
  take(random, 3, 'Something different');
  // Fill any shortfall from the remaining pools.
  take(top, SLOTS.length, 'Top rated · you haven’t watched it yet');
  take(random, SLOTS.length, 'Something different');
  return out;
}

function info(d: DiscoverItem): HTMLElement {
  const it = d.item;
  const meta = [it.Name, it.ProductionYear ? String(it.ProductionYear) : null, it.Genres?.[0] ?? null, it.CommunityRating ? `★ ${it.CommunityRating.toFixed(1)}` : null].filter(Boolean).join(' · ');
  return h('div', { class: 'tide-disc-info' },
    h('div', { class: 'tide-disc-reason' }, d.reason),
    h('div', { class: 'tide-disc-meta' }, meta),
    h('div', { class: 'tide-disc-btns' },
      h('button', { class: 'tide-btn tide-btn-w tide-btn-lg', type: 'button', onclick: () => void play(it.Id) }, icon('play_arrow'), 'Play'),
      h('button', { class: 'tide-btn tide-btn-lg', type: 'button', onclick: () => void openDetails(it.Id) }, icon('info'), 'More info'),
      toggleButton({ icon: 'favorite', label: 'Favourite', on: !!it.UserData?.IsFavorite, cls: 'tide-fav-toggle tide-ib-xl', save: (on) => setFavourite(it.Id, on) })));
}

export function renderDiscover(def: RowDef, ctx: RowContext): RenderedRow {
  const wrap = h('div', { class: 'tide-disc-wrap' });
  const section = h('section', { class: 'tide-row tide-row-disc', 'data-row': def.id }, h('div', { class: 'tide-row-head' }, h('h2', { class: 'tide-row-title' }, def.title(ctx))), wrap);
  let disposed = false;
  let cleanup: (() => void) | null = null;
  const show = (picks: DiscoverItem[]) => {
    if (picks.length < 5) { section.hidden = true; return; }
    cleanup = mountConstellation(wrap, picks);
  };
  const ready = peek<DiscoverItem[]>('row:discover', HOME_TTL);
  if (ready) { show(ready.v); return { el: section, dispose: () => { disposed = true; cleanup?.(); } }; }
  const stop = lazySection(section, async () => {
    const picks = await cached('row:discover', HOME_TTL, () => pickDiscover(ctx)).catch(() => [] as DiscoverItem[]);
    if (disposed) return;
    show(picks);
  });
  return { el: section, dispose: () => { disposed = true; stop(); cleanup?.(); } };
}

/** Builds the constellation (desktop) or the centre-focus carousel (phone) and returns its teardown. */
export function mountConstellation(wrap: HTMLElement, picks: DiscoverItem[]): () => void {
  const stage = h('div', { class: 'tide-disc' });
  const bgs = [h('div', { class: 'tide-disc-bg' }), h('div', { class: 'tide-disc-bg' })];
  // The blurred backdrop is masked (not covered by a black fade) so it dissolves into the ambient page background.
  const bgBox = h('div', { class: 'tide-disc-bgs', 'aria-hidden': 'true' }, ...bgs);
  let bgi = 0;
  const infoBox = h('div', { class: 'tide-disc-under' });
  const posters = picks.map((d, i) => {
    const p = h('button', { class: 'tide-disc-poster', type: 'button', 'aria-label': d.item.Name, 'data-i': i },
      h('img', { src: primaryOf(d.item, 500) || imageUrl(d.item.Id, 'Primary', 500), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }));
    return p;
  });
  const pills = Object.keys(PILL_SLOTS).map((k) => [Number(k), h('span', { class: 'tide-disc-pill' })] as const);
  stage.replaceChildren(...posters, ...pills.map(([, e]) => e));
  wrap.replaceChildren(bgBox, stage, infoBox);

  let order = picks.map((_, i) => i); // order[slot] = pick index
  const setBg = (idx: number) => {
    const next = bgs[bgi ^ 1]!;
    const it = picks[idx]!.item;
    next.style.backgroundImage = `url("${backdropOf(it, 160) || imageUrl(it.Id, 'Backdrop/0', 160)}")`;
    next.classList.add('on');
    bgs[bgi]!.classList.remove('on');
    bgi ^= 1;
  };
  const phone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 699px)').matches;

  const layout = () => {
    if (phone()) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    order.forEach((pi, slot) => {
      const s = SLOTS[slot];
      const p = posters[pi]!;
      if (!s) { p.hidden = true; return; }
      p.hidden = false;
      const [x, y, w, depth] = s;
      const scale = w / BASE_W;
      p.style.transform = `translate(${Math.round((x / 100) * W - BASE_W / 2)}px, ${Math.round((y / 100) * H - (BASE_W * 1.5) / 2)}px) scale(${scale})`;
      p.dataset.depth = depth;
      p.classList.toggle('center', slot === 0);
    });
    pills.forEach(([slot, e]) => {
      const pick = picks[order[slot] ?? -1];
      if (!pick) { e.hidden = true; return; }
      const [px, py] = PILL_SLOTS[slot]!;
      e.hidden = false;
      e.style.left = `${px}%`;
      e.style.top = `${py}%`;
      e.textContent = moodFor(pick.item.Genres?.[0]);
    });
  };

  const showInfo = (pi: number) => {
    infoBox.replaceChildren(info(picks[pi]!));
    setBg(pi);
  };

  const focus = (pi: number) => {
    const slot = order.indexOf(pi);
    if (slot <= 0) return;
    [order[0], order[slot]] = [order[slot]!, order[0]!];
    pills.forEach(([, e]) => e.classList.add('swap'));
    layout();
    showInfo(pi);
    setTimeout(() => pills.forEach(([, e]) => e.classList.remove('swap')), 300);
  };
  posters.forEach((p, i) => p.addEventListener('click', () => {
    if (phone()) {
      p.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      return;
    }
    if (p.classList.contains('center')) void openDetails(picks[i]!.item.Id);
    else focus(i);
  }));

  // Phone: centre-focus carousel. The info follows whichever poster is nearest the centre.
  let raf = 0;
  const onScroll = () => {
    if (!phone() || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const mid = stage.getBoundingClientRect().left + stage.clientWidth / 2;
      let best = 0;
      let bestD = Infinity;
      posters.forEach((p, i) => {
        const r = p.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      posters.forEach((p, i) => p.classList.toggle('center', i === best));
      if (infoBox.dataset.i !== String(best)) { infoBox.dataset.i = String(best); showInfo(best); }
    });
  };
  stage.addEventListener('scroll', onScroll, { passive: true });

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout()) : null;
  ro?.observe(stage);
  layout();
  showInfo(order[0]!);
  if (phone()) onScroll();
  return () => {
    ro?.disconnect();
    stage.removeEventListener('scroll', onScroll);
    cancelAnimationFrame(raf);
  };
}
