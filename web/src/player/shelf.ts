import { getEpisodes, getItem, getSeasons } from '../api/item';
import { renderEpisodes } from '../details/episodes';
import { sortSeasons } from '../details/logic';
import { h } from '../ui/dom';

export interface Shelf { el: HTMLElement; open(): void; close(): void; isOpen(): boolean; setEpisode(seriesId: string, currentId: string): Promise<void>; dispose(): void }

export function createShelf(onOpenChange: (open: boolean) => void): Shelf {
  const el = h('div', { class: 'tide-pshelf', 'aria-hidden': 'true' });
  let open = false;
  let disposeRow: (() => void) | null = null;
  let key = '';
  return {
    el,
    open() { if (open) return; open = true; el.classList.add('open'); el.removeAttribute('aria-hidden'); onOpenChange(true); },
    close() { if (!open) return; open = false; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); onOpenChange(false); },
    isOpen: () => open,
    async setEpisode(seriesId, currentId) {
      if (key === `${seriesId}/${currentId}`) return;
      key = `${seriesId}/${currentId}`;
      const [seasons, cur] = await Promise.all([getSeasons(seriesId), getItem(currentId)]);
      const sorted = sortSeasons(seasons);
      const idx = Math.max(0, sorted.findIndex((s) => s.IndexNumber === cur.ParentIndexNumber));
      if (!sorted[idx]) return;
      const eps = await getEpisodes(seriesId, sorted[idx]!.Id);
      disposeRow?.();
      const row = renderEpisodes(seriesId, sorted, idx, null, eps, { synopsis: false, current: { id: currentId, tag: 'NOW PLAYING' } });
      disposeRow = row.dispose;
      el.replaceChildren(row.el);
    },
    dispose() { disposeRow?.(); },
  };
}
