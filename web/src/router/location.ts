/**
 * Route-change notifications. React Router (jellyfin-web 12.4) navigates with history.pushState/replaceState, which
 * fire neither `hashchange` nor `popstate`. While anyone is subscribed we patch both once and dispatch
 * `tide:locationchange`; the patch is removed when the last subscriber leaves (if nobody re-patched on top of us).
 */
export const LOCATION_EVENT = 'tide:locationchange';

let subscribers = 0;
let restore: (() => void) | null = null;

function patch(): () => void {
  const h = history;
  const origPush = h.pushState;
  const origReplace = h.replaceState;
  const wrap = (orig: History['pushState']): History['pushState'] => {
    const fn = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = orig.apply(this, args);
      window.dispatchEvent(new Event(LOCATION_EVENT));
      return r;
    };
    return fn;
  };
  const push = wrap(origPush);
  const replace = wrap(origReplace);
  h.pushState = push;
  h.replaceState = replace;
  return () => {
    if (h.pushState === push) h.pushState = origPush;
    if (h.replaceState === replace) h.replaceState = origReplace;
  };
}

/** Calls `cb` on hashchange, popstate and history push/replace. Returns an unsubscribe function. */
export function onLocationChange(cb: () => void): () => void {
  if (subscribers++ === 0) restore = patch();
  const events = ['hashchange', 'popstate', LOCATION_EVENT];
  events.forEach((e) => window.addEventListener(e, cb));
  let done = false;
  return () => {
    if (done) return;
    done = true;
    events.forEach((e) => window.removeEventListener(e, cb));
    if (--subscribers === 0) {
      restore?.();
      restore = null;
    }
  };
}
