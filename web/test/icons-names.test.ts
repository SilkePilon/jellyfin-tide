import { readFileSync } from 'node:fs';
import { FONT_ICON_RENAMES, MUI_ICON_MAP } from '../src/icons/map';

const valid = new Set(readFileSync('scripts/material-symbols-names.txt', 'utf8').split('\n').filter(Boolean));

test('name list loaded', () => {
  expect(valid.size).toBeGreaterThan(1000);
});
test('every MUI_ICON_MAP value is a real Material Symbol', () => {
  const bad = Object.entries(MUI_ICON_MAP).filter(([, v]) => !valid.has(v));
  expect(bad).toEqual([]);
});
test('every FONT_ICON_RENAMES value is a real Material Symbol', () => {
  const bad = Object.entries(FONT_ICON_RENAMES).filter(([, v]) => !valid.has(v));
  expect(bad).toEqual([]);
});
