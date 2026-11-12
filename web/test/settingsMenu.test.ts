import { createSettingsMenu, BACK_MS } from '../src/player/settingsMenu';
import type { StockMenu } from '../src/player/stockMenu';

const ROWS = [
  { id: 'aspectratio', text: 'Aspect Ratio', aside: 'Auto', selected: false },
  { id: 'playbackrate', text: 'Playback Speed', aside: '1x', selected: false },
  { id: 'suboffset', text: 'Subtitle Offset', aside: '', selected: false },
  { id: 'stats', text: 'Playback Info', aside: '', selected: false },
  { id: 'futurething', text: 'Future Thing', aside: 'On', selected: false },
];
function setup(over: Partial<StockMenu> = {}) {
  const stock: StockMenu = {
    rows: vi.fn(async () => ROWS),
    options: vi.fn(async () => [{ id: '1', text: '1x', aside: '', selected: true }, { id: '1.5', text: '1.5x', aside: '', selected: false }]),
    pick: vi.fn(async () => {}), run: vi.fn(async () => {}), ...over,
  };
  let audioCur: number | null = 1;
  let stats = false;
  const deps = {
    stock,
    audio: () => ({ tracks: [{ index: 1, label: 'English', sub: 'AAC · 5.1' }, { index: 2, label: 'Dutch', sub: 'AAC · Stereo' }], current: audioCur }),
    pickAudio: vi.fn((i: number) => { audioCur = i; }),
    statsOn: () => stats,
    openStock: vi.fn(),
    onOpenChange: vi.fn(),
  };
  const m = createSettingsMenu(deps);
  document.body.append(m.el);
  return { m, deps, stock, setStats: (v: boolean) => { stats = v; } };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

test('main list: Audio first, then the stock rows in stock order; subtitle offset is not a settings row', async () => {
  const { m } = setup();
  m.open(null);
  await flush();
  const ids = [...m.el.querySelectorAll<HTMLElement>('.tide-pmset-main [data-go], .tide-pmset-main [data-toggle]')].map((e) => e.dataset.go ?? e.dataset.toggle);
  expect(ids).toEqual(['audio', 'aspectratio', 'playbackrate', 'stats', 'futurething']);
  expect(m.el.querySelector('[data-go="audio"] .tide-pm-val')?.textContent).toBe('English · 5.1');
  expect(m.el.querySelector('[data-go="playbackrate"] .tide-pm-val')?.textContent).toBe('1x');
  expect(m.el.querySelector('[data-go="futurething"] .tide-pm-ic')?.textContent).toBe('tune'); // unknown ids still work
});

test('drill into a stock row, pick an option: stock.pick, rows re-read, back to the main list after 220 ms', async () => {
  const { m, stock } = setup();
  m.open(null);
  await flush();
  m.el.querySelector<HTMLElement>('[data-go="playbackrate"]')!.click();
  expect(m.el.classList.contains('drill')).toBe(true);
  await flush();
  const opts = [...m.el.querySelectorAll<HTMLElement>('.tide-pmset-sub [data-pick]')];
  expect(opts.map((o) => [o.dataset.pick, o.classList.contains('on')])).toEqual([['1', true], ['1.5', false]]);
  vi.useFakeTimers();
  opts[1]!.click();
  expect(stock.pick).toHaveBeenCalledWith('playbackrate', '1.5');
  await vi.advanceTimersByTimeAsync(BACK_MS + 10);
  expect(m.el.classList.contains('drill')).toBe(false);
  expect(stock.rows).toHaveBeenCalledTimes(2);
});

test('audio submenu uses Tide tracks and pickAudio', async () => {
  const { m, deps } = setup();
  m.open(null);
  m.el.querySelector<HTMLElement>('[data-go="audio"]')!.click();
  m.el.querySelector<HTMLElement>('.tide-pmset-sub [data-pick="2"]')!.click();
  expect(deps.pickAudio).toHaveBeenCalledWith(2);
  expect(m.el.querySelector('[data-go="audio"] .tide-pm-val')?.textContent).toBe('Dutch · Stereo');
});

test('Playback info is a toggle that runs the stock row', async () => {
  const { m, stock, setStats } = setup();
  m.open(null);
  await flush();
  const t = m.el.querySelector<HTMLElement>('[data-toggle="stats"]')!;
  expect(t.getAttribute('aria-checked')).toBe('false');
  setStats(true);
  t.click();
  expect(stock.run).toHaveBeenCalledWith('stats');
  await new Promise((r) => setTimeout(r, 350));
  expect(m.el.querySelector('[data-toggle="stats"]')!.getAttribute('aria-checked')).toBe('true');
});

test('back(): false at the main list, true (and returns) inside a submenu; close resets', async () => {
  const { m } = setup();
  m.open(null);
  expect(m.back()).toBe(false);
  m.el.querySelector<HTMLElement>('[data-go="audio"]')!.click();
  expect(m.back()).toBe(true);
  expect(m.el.classList.contains('drill')).toBe(false);
  m.el.querySelector<HTMLElement>('[data-go="audio"]')!.click();
  m.close();
  expect(m.el.classList.contains('drill')).toBe(false);
});

test('stock failure: shows "Open default menu", which opens the stock dialog', async () => {
  const { m, deps } = setup({ rows: vi.fn(async () => { throw new Error('stock sheet timeout'); }) });
  m.open(null);
  await flush();
  const b = m.el.querySelector<HTMLElement>('[data-stock]')!;
  expect(b.textContent).toContain('Open default menu');
  b.click();
  expect(deps.openStock).toHaveBeenCalled();
  expect(m.isOpen()).toBe(false);
});
