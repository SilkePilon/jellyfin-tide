import { createMenu, rightOffset } from '../src/player/menu';

const rect = (left: number, right: number) => ({ left, right, top: 0, bottom: 0, width: right - left, height: 0, x: left, y: 0, toJSON() {} }) as DOMRect;
afterEach(() => { document.body.innerHTML = ''; });

test('rightOffset lines the menu up with the button and keeps a gutter', () => {
  expect(rightOffset(rect(0, 1400), rect(1270, 1322))).toBe(78);
  expect(rightOffset(rect(0, 1400), rect(1380, 1398))).toBe(16);
});

test('menu: open/close toggle classes, aria and report changes once; clicks inside do not bubble', () => {
  const changes: boolean[] = [];
  const m = createMenu('tide-x', 'X', (o) => changes.push(o));
  const host = document.createElement('div');
  const outer = vi.fn();
  host.addEventListener('click', outer);
  host.append(m.el);
  document.body.append(host);
  m.open(null);
  m.open(null);
  expect(m.isOpen()).toBe(true);
  expect(m.el.classList.contains('open')).toBe(true);
  expect(m.el.hasAttribute('aria-hidden')).toBe(false);
  m.el.click();
  expect(outer).not.toHaveBeenCalled();
  m.close();
  m.close();
  expect(m.el.getAttribute('aria-hidden')).toBe('true');
  expect(changes).toEqual([true, false]);
});

test('menu: open(anchor) sets the right offset from the anchor', () => {
  const m = createMenu('tide-x', 'X', () => {});
  const host = document.createElement('div');
  host.getBoundingClientRect = () => rect(0, 1000);
  host.append(m.el);
  const btn = document.createElement('button');
  btn.getBoundingClientRect = () => rect(900, 940);
  m.open(btn);
  expect(m.el.style.right).toBe('60px');
});
