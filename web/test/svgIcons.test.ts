import { icon } from '../src/ui/dom';
import { toggleButton } from '../src/ui/toggle';

test('the five key icons render as inline SVG, others stay font glyphs', () => {
  for (const n of ['favorite', 'play_arrow', 'check', 'star', 'info']) {
    const el = icon(n);
    expect(el.classList.contains('tide-svg')).toBe(true);
    expect(el.dataset.icon).toBe(n);
    expect(el.querySelector('svg path')?.getAttribute('d')).toBeTruthy();
    expect(el.textContent).toBe('');
  }
  expect(icon('tune').textContent).toBe('tune');
  expect(icon('tune').querySelector('svg')).toBeNull();
});

test('favourite toggle carries the svg heart and aria-pressed drives its fill', () => {
  const b = toggleButton({ icon: 'favorite', label: 'Favourite', on: true, cls: 'tide-fav-toggle', save: async () => {} });
  expect(b.querySelector('.tide-svg[data-icon="favorite"] svg')).not.toBeNull();
  expect(b.getAttribute('aria-pressed')).toBe('true');
});
