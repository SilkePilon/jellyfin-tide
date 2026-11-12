(window as unknown as { __TIDE_TEST__: boolean }).__TIDE_TEST__ = true;
import { invalidate } from '../src/api/cache';
import { releaseAll } from '../src/boot/cloak';
// jsdom here exposes no localStorage: a minimal in-memory one.
if (typeof globalThis.localStorage?.setItem !== 'function') {
  const m = new Map<string, string>();
  const ls = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
}
beforeEach(() => {
  invalidate();
  releaseAll();
  try { localStorage.clear(); } catch { /* none */ }
});
