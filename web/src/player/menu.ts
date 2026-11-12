import { h } from '../ui/dom';

/** A popover above the player's control row (Settings, Subtitles). Its right edge lines up with its button's. */
export interface PlayerMenu { el: HTMLElement; open(anchor: HTMLElement | null): void; close(): void; isOpen(): boolean }

/** CSS `right` (px) for a menu in `container` whose right edge should meet `anchor`'s right edge. */
export function rightOffset(container: DOMRect, anchor: DOMRect, gutter = 16): number {
  return Math.max(gutter, Math.round(container.right - anchor.right));
}

export function createMenu(cls: string, label: string, onOpenChange: (open: boolean) => void): PlayerMenu {
  const el = h('div', { class: `tide-pmenu ${cls}`, role: 'dialog', 'aria-label': label, 'aria-hidden': 'true' });
  // Clicks inside never reach the player root (which would toggle play / close menus).
  el.addEventListener('click', (e) => e.stopPropagation());
  let open = false;
  return {
    el,
    open(anchor) {
      const box = el.parentElement;
      if (anchor && box) el.style.right = `${rightOffset(box.getBoundingClientRect(), anchor.getBoundingClientRect())}px`;
      if (open) return;
      open = true;
      el.classList.add('open');
      el.removeAttribute('aria-hidden');
      onOpenChange(true);
    },
    close() {
      if (!open) return;
      open = false;
      el.classList.remove('open');
      el.setAttribute('aria-hidden', 'true');
      onOpenChange(false);
    },
    isOpen: () => open,
  };
}
