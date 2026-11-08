import './overlays.css';
import { h, icon } from './dom';

export function menuItem(label: string, iconName: string | null, run: () => void, extra: HTMLElement | null = null): HTMLElement {
  return h('button', { class: 'tide-pop-item', type: 'button', role: 'menuitem', 'data-run': '1', onclick: (e: Event) => { e.preventDefault(); (e.currentTarget as HTMLElement).dispatchEvent(new CustomEvent('tide-pick', { bubbles: true })); run(); } },
    iconName ? icon(iconName) : null, h('span', { class: 'tide-pop-label' }, label), extra);
}

export function openPopover(anchor: HTMLElement, content: HTMLElement, opts: { align?: 'left' | 'right'; onClose?: () => void } = {}): () => void {
  const pop = h('div', { class: `tide-pop tide-pop-${opts.align ?? 'left'}`, role: 'menu' }, content);
  anchor.parentElement!.append(pop);
  anchor.setAttribute('aria-expanded', 'true');
  const items = () => [...pop.querySelectorAll<HTMLElement>('[role=menuitem]')];
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    pop.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    opts.onClose?.();
    anchor.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    if (next) { e.preventDefault(); next.focus(); }
  };
  const onDown = (e: Event) => { if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close(); };
  pop.addEventListener('tide-pick', () => close());
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  (pop.querySelector<HTMLElement>('[role=menuitem][aria-current="true"]') ?? items()[0])?.focus();
  return close;
}
