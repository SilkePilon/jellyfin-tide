import { TIDE_VERSION } from '../src/main';

test('version is set', () => {
  expect(TIDE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
