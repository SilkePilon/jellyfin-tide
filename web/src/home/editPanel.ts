import { h, icon } from '../ui/dom';
import { ROWS } from './rows';
import type { RowId, UserPrefs } from '../types';
import { ROW_IDS } from '../types';

export function moveRow(order: string[], from: number, to: number): string[] {
  const next = [...order];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

const LABELS: Partial<Record<RowId, string>> = { genre1: 'Genre row 1', genre2: 'Genre row 2', genre3: 'Genre row 3', becauseYouWatched: 'Because you watched…' };

function labelFor(id: string, prefs: UserPrefs): string {
  const fixed = LABELS[id as RowId];
  if (fixed) return fixed;
  const def = ROWS[id as RowId];
  return def?.title({ userId: '', prefs, newDays: 0, genres: [] }) || id;
}

/**
 * Opens the edit-home dialog. `defaults` are the admin defaults used by "Reset to default".
 * Returns `close`, which removes the overlay AND the document keydown listener (call it on unmount).
 */
export function openEditPanel(prefs: UserPrefs, genres: string[], onSave: (p: UserPrefs) => void, defaults: UserPrefs = { rowOrder: [...ROW_IDS], hidden: [], genres: {}, edited: false }): () => void {
  document.querySelector('.tide-edit-overlay')?.remove();
  // Keep known row ids only; append any missing ones so every row can be shown again.
  const known = new Set<string>(ROW_IDS);
  let order = prefs.rowOrder.filter((id) => known.has(id));
  for (const id of ROW_IDS) if (!order.includes(id)) order.push(id);
  const hidden = new Set(prefs.hidden);
  const picked: Record<string, string | null> = { ...prefs.genres };
  const list = h('ol', { class: 'tide-edit-list' });
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let dragFrom: number | null = null;
  const focusables = () => [...panel.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !(el as HTMLButtonElement).disabled);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !panel.contains(active))) { e.preventDefault(); first.focus(); }
    }
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (opener?.isConnected) opener.focus();
  };
  const inRange = (n: number) => Number.isInteger(n) && n >= 0 && n < order.length;

  function render(): void {
    list.replaceChildren(...order.map((id, i) => {
      const label = labelFor(id, prefs);
      const toggle = h('input', { type: 'checkbox', 'aria-label': `Show ${label}` }) as HTMLInputElement;
      toggle.checked = !hidden.has(id);
      toggle.onchange = () => { if (toggle.checked) hidden.delete(id); else hidden.add(id); };
      const genreSel = id.startsWith('genre')
        ? (() => {
            const s = h('select', { 'aria-label': `${label} genre` }, h('option', { value: '' }, 'Random'), ...genres.map((g) => h('option', { value: g }, g))) as HTMLSelectElement;
            s.value = picked[id] ?? '';
            s.onchange = () => { picked[id] = s.value || null; };
            return s;
          })()
        : null;
      const li = h('li', { class: 'tide-edit-item', draggable: 'true', 'data-i': i },
        icon('drag_indicator', 'tide-edit-handle'), h('span', { class: 'tide-edit-label' }, label), genreSel,
        h('button', { class: 'tide-ib', 'aria-label': `Move ${label} up`, onclick: () => { if (i > 0) { order = moveRow(order, i, i - 1); render(); } } }, icon('arrow_upward')),
        h('button', { class: 'tide-ib', 'aria-label': `Move ${label} down`, onclick: () => { if (i < order.length - 1) { order = moveRow(order, i, i + 1); render(); } } }, icon('arrow_downward')),
        h('label', { class: 'tide-switch' }, toggle, h('span')));
      li.addEventListener('dragstart', (e) => {
        dragFrom = i;
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragend', () => { dragFrom = null; });
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = dragFrom;
        dragFrom = null;
        if (from !== null && from !== i && inRange(from) && inRange(i)) { order = moveRow(order, from, i); render(); }
      });
      return li;
    }));
  }

  const panel = h('aside', { class: 'tide-edit-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Edit home' },
    h('header', {}, h('h2', {}, 'Edit home'), h('button', { class: 'tide-ib', 'aria-label': 'Close', onclick: close }, icon('close'))),
    list,
    h('footer', {},
      h('button', { class: 'tide-btn', onclick: () => {
        order = defaults.rowOrder.filter((id) => known.has(id));
        for (const id of ROW_IDS) if (!order.includes(id)) order.push(id);
        hidden.clear();
        defaults.hidden.forEach((id) => hidden.add(id));
        Object.keys(picked).forEach((k) => (picked[k] = null));
        render();
      } }, 'Reset to default'),
      h('button', { class: 'tide-btn tide-btn-w', onclick: () => { onSave({ rowOrder: order, hidden: [...hidden], genres: picked, edited: true }); close(); } }, 'Save')));
  const overlay = h('div', { class: 'tide-edit-overlay', onclick: (e: Event) => { if (e.target === overlay) close(); } }, panel);
  render();
  document.body.append(overlay);
  document.addEventListener('keydown', onKey, true);
  panel.querySelector<HTMLElement>('header button')?.focus();
  return close;
}
