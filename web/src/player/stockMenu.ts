/**
 * Drives the stock 12.4 settings action sheet (`.btnVideoOsdSettings`) while it is hidden, so Tide's settings menu
 * offers exactly what the default player offers on this device (Jellyfin Desktop lists more aspect ratios than web).
 * Probed facts: docs/notes/web-12.4-player.md ("Stock settings sheet").
 */
export interface StockOption { id: string; text: string; aside: string; selected: boolean }
export interface StockMenu {
  /** Main rows (aspectratio, playbackrate, quality, repeatmode, suboffset, stats, ...). */
  rows(): Promise<StockOption[]>;
  /** A row's submenu options; `selected` marks the current one. */
  options(rowId: string): Promise<StockOption[]>;
  pick(rowId: string, optionId: string): Promise<void>;
  /** Click a row that has no submenu (stats, suboffset). */
  run(rowId: string): Promise<void>;
}
export interface SubOffset { get(): number | null; set(seconds: number): Promise<void> }

export const SHEET_TIMEOUT_MS = 1500;
const OPEN = '.actionSheet.opened';

export function readSheet(sheet: Element): StockOption[] {
  return [...sheet.querySelectorAll<HTMLElement>('[data-id]')].map((el) => {
    const mark = el.querySelector<HTMLElement>('.actionsheetMenuItemIcon');
    return {
      id: el.dataset.id ?? '',
      text: (el.querySelector('.actionSheetItemText')?.textContent ?? '').trim(),
      aside: (el.querySelector('.actionSheetItemAsideText')?.textContent ?? '').trim(),
      selected: !!mark && mark.style.visibility !== 'hidden',
    };
  });
}

function waitFor<T>(find: () => T | null | undefined, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const v = find();
      if (v) { resolve(v); return; }
      if (Date.now() - t0 > timeoutMs) { reject(new Error('stock sheet timeout')); return; }
      setTimeout(tick, 25);
    };
    tick();
  });
}

const openSheets = () => [...document.querySelectorAll(OPEN)];
const newest = (except: Element[]) => openSheets().find((s) => !except.includes(s)) ?? null;
const hasDialogEntry = () => !!(history.state as { usr?: { dialogs?: unknown[] } | null } | null)?.usr?.dialogs?.length;

export function createStockMenu(button: () => HTMLElement | null, timeoutMs = SHEET_TIMEOUT_MS): StockMenu {
  let chain: Promise<unknown> = Promise.resolve();
  const queued = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => undefined);
    return p;
  };
  const gone = (sheet: Element) => waitFor(() => (!sheet.isConnected || !sheet.matches(OPEN) ? true : null), timeoutMs);
  /** Close without picking, only through the history entry the sheet added itself (never leaves #/video). */
  const dismiss = async (sheet: Element) => {
    if (sheet.isConnected && sheet.matches(OPEN) && hasDialogEntry()) history.back();
    await gone(sheet).catch(() => undefined);
  };
  /** One hidden drive: every sheet it opened and left open is dismissed afterwards. */
  const drive = <T>(fn: (track: (s: Element) => Element) => Promise<T>): Promise<T> => queued(async () => {
    const mine: Element[] = [];
    document.documentElement.classList.add('tide-stock-hidden');
    try {
      return await fn((s) => { mine.push(s); return s; });
    } finally {
      for (const s of mine.reverse()) await dismiss(s);
      document.documentElement.classList.remove('tide-stock-hidden');
    }
  });
  const openMain = async (): Promise<Element> => {
    const before = openSheets();
    const b = button();
    if (!b) throw new Error('stock settings button missing');
    b.click();
    return waitFor(() => newest(before), timeoutMs);
  };
  const click = (sheet: Element, id: string) => {
    const item = [...sheet.querySelectorAll<HTMLElement>('[data-id]')].find((x) => x.dataset.id === id);
    if (!item) throw new Error(`stock option ${id} missing`);
    item.click();
  };
  const openSub = async (track: (s: Element) => Element, rowId: string): Promise<Element> => {
    const main = track(await openMain());
    click(main, rowId);
    return track(await waitFor(() => newest([main]), timeoutMs));
  };
  return {
    rows: () => drive(async (track) => readSheet(track(await openMain()))),
    options: (rowId) => drive(async (track) => readSheet(await openSub(track, rowId))),
    pick: (rowId, optionId) => drive(async (track) => {
      const sub = await openSub(track, rowId);
      click(sub, optionId);
      await gone(sub);
    }),
    run: (rowId) => drive(async (track) => {
      const main = track(await openMain());
      click(main, rowId);
      await gone(main);
    }),
  };
}

/** Tide's subtitle "Timing": drives the stock offset slider (opened once via the `suboffset` row, kept hidden). */
export function createSubOffset(menu: StockMenu): SubOffset {
  const slider = () => document.querySelector<HTMLInputElement>('.subtitleSync .subtitleSyncSlider');
  return {
    get: () => { const s = slider(); return s ? Number(s.value) || 0 : null; },
    async set(seconds) {
      if (!slider()) {
        await menu.run('suboffset');
        await waitFor(slider, SHEET_TIMEOUT_MS);
      }
      const s = slider()!;
      const v = Math.max(Number(s.min || -30), Math.min(Number(s.max || 30), Math.round(seconds * 10) / 10));
      s.value = String(v);
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };
}
