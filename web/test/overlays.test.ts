import { menuItem, openPopover } from '../src/ui/popover';
import { openYouTubeModal } from '../src/ui/trailerModal';

afterEach(() => { document.body.innerHTML = ''; document.body.className = ''; });

test('popover: focus first item, arrows move, Esc closes and returns focus', () => {
  const wrap = document.createElement('div');
  const anchor = document.createElement('button');
  wrap.append(anchor);
  document.body.append(wrap);
  const ran: string[] = [];
  const list = document.createElement('div');
  list.append(menuItem('One', null, () => ran.push('1')), menuItem('Two', 'check', () => ran.push('2')));
  const onClose = vi.fn();
  openPopover(anchor, list, { onClose });
  const items = [...document.querySelectorAll<HTMLElement>('.tide-pop [role=menuitem]')];
  expect(document.activeElement).toBe(items[0]);
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(document.activeElement).toBe(items[1]);
  items[1]!.click();
  expect(ran).toEqual(['2']);
  expect(document.querySelector('.tide-pop')).toBeNull(); // picking closes
  openPopover(anchor, list, { onClose });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(document.querySelector('.tide-pop')).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(document.activeElement).toBe(anchor);
});

test('popover closes on outside pointerdown', () => {
  const wrap = document.createElement('div');
  const anchor = document.createElement('button');
  wrap.append(anchor);
  document.body.append(wrap);
  const c = document.createElement('div');
  c.append(menuItem('One', null, () => {}));
  openPopover(anchor, c);
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(document.querySelector('.tide-pop')).toBeNull();
});

test('youtube modal embeds no-cookie autoplay and closes on Esc', () => {
  openYouTubeModal('giXco2jaZ_4');
  const f = document.querySelector('.tide-trailer iframe');
  expect(f?.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/giXco2jaZ_4?autoplay=1');
  expect(document.body.classList.contains('tide-modal-open')).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(document.querySelector('.tide-trailer')).toBeNull();
  expect(document.body.classList.contains('tide-modal-open')).toBe(false);
});
