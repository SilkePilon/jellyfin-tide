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
// Features observe document.body for the life of the page and are never torn down. When a test file ends, jsdom's
// teardown removes the page's nodes, and their observer callbacks would then run after `document` and `location` are
// gone ("document is not defined"). Disconnect every observer a test file created before that happens.
const observers = new Set<MutationObserver>();
const NativeObserver = globalThis.MutationObserver;
globalThis.MutationObserver = class extends NativeObserver {
  constructor(cb: MutationCallback) {
    super(cb);
    observers.add(this);
  }
};
afterAll(() => {
  for (const o of observers) o.disconnect();
  observers.clear();
});
