import { h, icon } from './dom';

/**
 * Round icon button that reflects an on/off state (`aria-pressed`) and toggles it on click. The state flips
 * optimistically and reverts if `save` rejects. Clicks while a save is in flight are ignored.
 */
export function toggleButton(opts: {
  icon: string; label: string; on: boolean; cls?: string;
  save: (on: boolean) => Promise<void>; onChange?: (on: boolean) => void;
}): HTMLButtonElement {
  let on = opts.on;
  let busy = false;
  const btn = h('button', { class: `tide-ib tide-toggle ${opts.cls ?? ''}`.trim(), type: 'button', 'aria-label': opts.label }, icon(opts.icon)) as HTMLButtonElement;
  const render = () => btn.setAttribute('aria-pressed', String(on));
  render();
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    busy = true;
    on = !on;
    render();
    // Only user toggles animate (not items that load already on).
    btn.classList.remove('tide-just-toggled');
    void btn.offsetWidth;
    btn.classList.add('tide-just-toggled');
    setTimeout(() => btn.classList.remove('tide-just-toggled'), 450);
    opts.onChange?.(on);
    let saving: Promise<void>;
    try { saving = Promise.resolve(opts.save(on)); } catch (err) { saving = Promise.reject(err); }
    saving.catch((err: unknown) => {
      console.warn(`[Tide] ${opts.label} failed`, err);
      on = !on;
      render();
      opts.onChange?.(on);
    }).finally(() => { busy = false; });
  });
  return btn;
}
