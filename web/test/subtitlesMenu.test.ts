import { createSubtitlesMenu, filterTracks, fmtOffset, shortName, type SubSize } from '../src/player/subtitlesMenu';
import type { OnlineSubs } from '../src/player/onlineSubs';

const TRACKS = [
  { index: 3, label: 'English', sub: 'PGS' }, { index: 4, label: 'English', sub: 'Forced · PGS' }, { index: 5, label: 'Dutch', sub: 'PGS' },
];
function setup(opts: { online?: OnlineSubs | null; timingOk?: boolean } = {}) {
  let current: number | null = 4;
  let size: SubSize = 'M';
  let offset: number | null = null;
  const deps = {
    tracks: () => ({ list: [...TRACKS], current }),
    pick: vi.fn((i: number | null) => { current = i; }),
    size: () => size, setSize: vi.fn((s: SubSize) => { size = s; }),
    timing: { available: vi.fn(async () => opts.timingOk ?? true), get: () => offset, set: vi.fn(async (s: number) => { offset = s; }) },
    online: () => opts.online ?? null,
    onDownloaded: vi.fn(),
    onOpenChange: vi.fn(),
  };
  const m = createSubtitlesMenu(deps);
  document.body.append(m.el);
  m.open(null);
  const input = m.el.querySelector<HTMLInputElement>('.tide-pmsub-search input')!;
  const type = (v: string) => { input.value = v; input.dispatchEvent(new Event('input')); };
  const ids = () => [...m.el.querySelectorAll<HTMLElement>('[data-sub]')].map((e) => e.dataset.sub);
  return { m, deps, input, type, ids };
}
const online = (): OnlineSubs => ({
  providers: ['Open Subtitles'], defaultLang: { code: 'eng', name: 'English' },
  resolveLang: vi.fn(async (q: string) => (q.toLowerCase().startsWith('dut') ? { code: 'dut', name: 'Dutch' } : null)),
  search: vi.fn(async () => [{ id: 'os-1', name: 'Silo.S03E01', format: 'SRT', provider: 'Open Subtitles', downloads: 1200 }]),
  download: vi.fn(async () => 9),
});
const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => { document.body.innerHTML = ''; });

test('helpers', () => {
  expect(filterTracks(TRACKS, 'forced').map((t) => t.index)).toEqual([4]);
  expect(filterTracks(TRACKS, '  ').length).toBe(3);
  expect(shortName(TRACKS[1]!)).toBe('English · Forced');
  expect(fmtOffset(0)).toBe('0.0 s');
  expect(fmtOffset(1.5)).toBe('+1.5 s');
  expect(fmtOffset(-0.2)).toBe('-0.2 s');
});

test('plain list without online search: Off + tracks, current checked, filtering hides Off, empty message', () => {
  const { m, type, ids } = setup();
  expect(ids()).toEqual(['-1', '3', '4', '5']);
  expect(m.el.querySelector('[data-sub="4"]')!.classList.contains('on')).toBe(true);
  expect(m.el.querySelector('[data-col], [data-find]')).toBeNull();
  expect(m.el.querySelector<HTMLInputElement>('input')!.placeholder).toBe('Search languages');
  type('dutch');
  expect(ids()).toEqual(['5']);
  type('zzz');
  expect(m.el.querySelector('.tide-pm-empty')?.textContent).toBe('No “zzz” track in this file.');
});

test('picking a track or Off calls pick and moves the check', () => {
  const { m, deps } = setup();
  m.el.querySelector<HTMLElement>('[data-sub="5"]')!.click();
  expect(deps.pick).toHaveBeenLastCalledWith(5);
  expect(m.el.querySelector('[data-sub="5"]')!.classList.contains('on')).toBe(true);
  m.el.querySelector<HTMLElement>('[data-sub="-1"]')!.click();
  expect(deps.pick).toHaveBeenLastCalledWith(null);
});

test('online: Find collapses the file tracks and lists results; headers toggle; typing re-expands', async () => {
  const o = online();
  const { m, type, ids } = setup({ online: o });
  expect(m.el.querySelector<HTMLInputElement>('input')!.placeholder).toBe('Search tracks or online');
  m.el.querySelector<HTMLElement>('[data-find]')!.click();
  await flush();
  expect(o.search).toHaveBeenCalledWith('eng', undefined);
  const file = m.el.querySelector<HTMLElement>('[data-col="file"]')!;
  expect(file.classList.contains('col')).toBe(true);
  expect(file.querySelector('.tide-pmsub-cur')?.textContent).toBe('English · Forced');
  expect(ids()).toEqual(['-1']);
  expect(m.el.querySelector('[data-col="online"] .tide-pmsub-n')?.textContent).toBe('1');
  expect(m.el.querySelector('[data-dl="os-1"]')).not.toBeNull();
  file.click();
  expect(ids()).toEqual(['-1', '3', '4', '5']);
  m.el.querySelector<HTMLElement>('[data-col="online"]')!.click();
  expect(m.el.querySelector('[data-dl="os-1"]')).toBeNull();
  type('dut');
  expect(m.el.querySelector('[data-col="file"]')!.classList.contains('col')).toBe(false);
  expect(m.el.querySelector('[data-find]')?.textContent).toContain('Search online for “dut”');
});

test('online: typed language is resolved; a non-language filters by name in the default language', async () => {
  const o = online();
  const { m, type } = setup({ online: o });
  type('dutch');
  m.el.querySelector<HTMLElement>('[data-find]')!.click();
  await flush();
  expect(o.search).toHaveBeenLastCalledWith('dut', undefined);
  type('1080p');
  m.el.querySelector<HTMLElement>('[data-find]')!.click();
  await flush();
  expect(o.search).toHaveBeenLastCalledWith('eng', '1080p');
});

test('download: busy, then done and onDownloaded(index); failure marks the row', async () => {
  const o = online();
  const { m, deps } = setup({ online: o });
  m.el.querySelector<HTMLElement>('[data-find]')!.click();
  await flush();
  m.el.querySelector<HTMLElement>('[data-dl="os-1"]')!.click();
  await flush();
  expect(o.download).toHaveBeenCalled();
  expect(deps.onDownloaded).toHaveBeenCalledWith(9);
  expect(m.el.querySelector('[data-col="online"] .tide-pmsub-cur')?.textContent).toBe('Downloaded');
  (o.download as any).mockImplementationOnce(async () => { throw new Error('x'); });
  (o.search as any).mockImplementationOnce(async () => [{ id: 'os-2', name: 'B', format: 'SRT', provider: 'Open Subtitles', downloads: 0 }]);
  m.el.querySelector<HTMLInputElement>('input')!.dispatchEvent(new Event('input'));
  m.el.querySelector<HTMLElement>('[data-find]')!.click();
  await flush();
  m.el.querySelector<HTMLElement>('[data-dl="os-2"]')!.click();
  await flush();
  expect(m.el.querySelector('[data-dl="os-2"] small')?.textContent).toBe('Couldn’t download. Try another.');
});

test('footer: size chips and Timing steps of 0.1 s; Timing hidden when not available', async () => {
  const { m, deps } = setup();
  m.el.querySelector<HTMLElement>('[data-size="XL"]')!.click();
  expect(deps.setSize).toHaveBeenCalledWith('XL');
  expect(m.el.querySelector('[data-size="XL"]')!.classList.contains('on')).toBe(true);
  await flush();
  const timing = m.el.querySelector<HTMLElement>('output')!.closest<HTMLElement>('.tide-pmsub-row')!;
  expect(timing.hidden).toBe(false);
  m.el.querySelector<HTMLElement>('[data-sync="1"]')!.click();
  await flush();
  expect(deps.timing.set).toHaveBeenCalledWith(0.1);
  expect(m.el.querySelector('output')!.textContent).toBe('+0.1 s');
  const off = setup({ timingOk: false });
  await flush();
  expect(off.m.el.querySelector('output')!.closest<HTMLElement>('.tide-pmsub-row')!.hidden).toBe(true);
});

test('refresh() re-renders only when the tracks or the current pick changed', () => {
  const { m } = setup();
  const before = m.el.querySelector('[data-sub="3"]');
  m.refresh();
  expect(m.el.querySelector('[data-sub="3"]')).toBe(before);
});
