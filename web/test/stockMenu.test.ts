import { createStockMenu, createSubOffset, readSheet } from '../src/player/stockMenu';

type Item = { id: string; text: string; aside?: string; selected?: boolean };

/**
 * A fake of jellyfin-web 12.4's action sheet as probed: opening pushes `history.state.usr.dialogs`, Escape and
 * backdrop do nothing, `history.back()` (popstate) closes the newest sheet, clicking an item closes the sheet itself.
 */
function fakeStock(rows: Item[], subs: Record<string, Item[]>) {
  document.body.innerHTML = '<button class="btnVideoOsdSettings"></button><div class="dialogContainer"></div>';
  const container = document.querySelector('.dialogContainer')!;
  const picked: string[] = [];
  let maxOpen = 0;
  let n = 0;
  const show = (items: Item[], sub: boolean, onPick: (id: string) => void) => {
    const d = document.createElement('div');
    d.className = 'actionSheet opened';
    d.innerHTML = items.map((i) => `<button data-id="${i.id}">${sub ? `<span class="actionsheetMenuItemIcon" style="${i.selected ? '' : 'visibility:hidden;'}"></span>` : ''}<div class="actionSheetItemText">${i.text}</div>${i.aside ? `<div class="actionSheetItemAsideText">${i.aside}</div>` : ''}</button>`).join('');
    history.pushState({ usr: { dialogs: [`dlg${++n}`] } }, '');
    const close = () => { d.remove(); window.removeEventListener('popstate', close); };
    window.addEventListener('popstate', close);
    d.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-id]');
      if (!b) return;
      close();
      history.replaceState({ usr: null }, '');
      onPick(b.dataset.id!);
    });
    container.append(d);
    maxOpen = Math.max(maxOpen, document.querySelectorAll('.actionSheet.opened').length);
  };
  document.querySelector('.btnVideoOsdSettings')!.addEventListener('click', () => show(rows, false, (id) => {
    if (id === 'suboffset') {
      document.body.insertAdjacentHTML('beforeend', '<div class="subtitleSync"><input class="subtitleSyncSlider" type="range" min="-30" max="30" step="0.1" value="0"></div>');
      return;
    }
    const s = subs[id];
    if (s) setTimeout(() => show(s, true, (o) => picked.push(`${id}=${o}`)), 10);
    else picked.push(id);
  }));
  return { picked, maxOpen: () => maxOpen };
}

const ROWS: Item[] = [
  { id: 'aspectratio', text: 'Aspect Ratio', aside: 'Auto' }, { id: 'playbackrate', text: 'Playback Speed', aside: '1x' },
  { id: 'suboffset', text: 'Subtitle Offset' }, { id: 'stats', text: 'Playback Info' },
];
const SUBS = { playbackrate: [{ id: '0.5', text: '0.5x' }, { id: '1', text: '1x', selected: true }, { id: '1.5', text: '1.5x' }] };
const button = () => document.querySelector<HTMLElement>('.btnVideoOsdSettings');

afterEach(() => { document.body.innerHTML = ''; document.documentElement.className = ''; });

test('readSheet: text, aside, and the visible check marks the selected option', () => {
  document.body.innerHTML = `<div class="actionSheet opened">
    <button data-id="a"><span class="actionsheetMenuItemIcon" style="visibility:hidden;"></span><div class="actionSheetItemText">A</div></button>
    <button data-id="b"><span class="actionsheetMenuItemIcon"></span><div class="actionSheetItemText"> B </div><div class="actionSheetItemAsideText">x</div></button></div>`;
  expect(readSheet(document.querySelector('.actionSheet')!)).toEqual([
    { id: 'a', text: 'A', aside: '', selected: false }, { id: 'b', text: 'B', aside: 'x', selected: true }]);
});

test('rows(): reads the main sheet hidden, then closes it through its own history entry', async () => {
  fakeStock(ROWS, SUBS);
  const seen: boolean[] = [];
  const obs = new MutationObserver(() => seen.push(document.documentElement.classList.contains('tide-stock-hidden')));
  obs.observe(document.querySelector('.dialogContainer')!, { childList: true });
  const rows = await createStockMenu(button).rows();
  obs.disconnect();
  expect(rows.map((r) => r.id)).toEqual(['aspectratio', 'playbackrate', 'suboffset', 'stats']);
  expect(rows[1]).toEqual({ id: 'playbackrate', text: 'Playback Speed', aside: '1x', selected: false });
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every(Boolean)).toBe(true); // hidden whenever a stock sheet was in the DOM
  expect(document.querySelectorAll('.actionSheet.opened')).toHaveLength(0);
  expect(document.documentElement.classList.contains('tide-stock-hidden')).toBe(false);
});

test('options() reads a submenu with the current option; pick() clicks through; run() clicks a plain row', async () => {
  const f = fakeStock(ROWS, SUBS);
  const m = createStockMenu(button);
  const opts = await m.options('playbackrate');
  expect(opts.map((o) => [o.id, o.selected])).toEqual([['0.5', false], ['1', true], ['1.5', false]]);
  expect(document.querySelectorAll('.actionSheet.opened')).toHaveLength(0);
  await m.pick('playbackrate', '1.5');
  await m.run('stats');
  expect(f.picked).toEqual(['playbackrate=1.5', 'stats']);
  expect(f.maxOpen()).toBe(1);
});

test('calls queue: concurrent drives never overlap', async () => {
  const f = fakeStock(ROWS, SUBS);
  const m = createStockMenu(button);
  const [a, b, c] = await Promise.all([m.rows(), m.options('playbackrate'), m.rows()]);
  expect(a).toHaveLength(4);
  expect(b).toHaveLength(3);
  expect(c).toHaveLength(4);
  expect(f.maxOpen()).toBe(1);
});

test('missing button or a sheet that never opens rejects and clears the hiding class', async () => {
  document.body.innerHTML = '';
  await expect(createStockMenu(() => null, 100).rows()).rejects.toThrow();
  document.body.innerHTML = '<button class="btnVideoOsdSettings"></button>';
  await expect(createStockMenu(button, 100).rows()).rejects.toThrow('stock sheet timeout');
  expect(document.documentElement.classList.contains('tide-stock-hidden')).toBe(false);
});

test('subtitle offset: opens the stock slider once, sets value with input+change, clamps to ±30', async () => {
  fakeStock(ROWS, SUBS);
  const off = createSubOffset(createStockMenu(button));
  expect(off.get()).toBeNull();
  const events: string[] = [];
  document.addEventListener('change', (e) => events.push(`change:${(e.target as HTMLInputElement).value}`), true);
  await off.set(1.5);
  expect(off.get()).toBe(1.5);
  expect(events).toContain('change:1.5');
  await off.set(42);
  expect(off.get()).toBe(30);
  expect(document.querySelectorAll('.subtitleSync')).toHaveLength(1);
});
