import { existsSync, readFileSync, statSync } from 'node:fs';
import { usedIconNames } from '../scripts/icons.mjs';

test('subset icon font covers every icon name in src (run `node scripts/icons.mjs` after adding an icon)', () => {
  const committed = JSON.parse(readFileSync('src/theme/fonts/tide-symbols.json', 'utf8')) as string[];
  expect(committed).toEqual(usedIconNames());
});

test('subset font is small and present', () => {
  expect(existsSync('src/theme/fonts/tide-symbols.woff2')).toBe(true);
  expect(statSync('src/theme/fonts/tide-symbols.woff2').size).toBeLessThan(200 * 1024);
});
