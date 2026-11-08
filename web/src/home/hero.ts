import './hero.css';
import { api, imageUrl, streamUrl } from '../api/client';
import { openDetails, play, setFavourite } from '../api/actions';
import { fmtRuntime, h, icon } from '../ui/dom';
import { toggleButton } from '../ui/toggle';
import { progressRing } from '../ui/cards';
import type { ClientConfig, HeroItem } from '../types';

export type TrailerSource = { kind: 'local'; url: string } | { kind: 'youtube'; id: string };

const START_DELAY = 3000;
const LOAD_TIMEOUT = 6000;
const YT_ORIGIN = 'https://www.youtube-nocookie.com';

export function reasonLine(item: HeroItem): { chip: string | null; episode: string | null; button: string } {
  const ep = item.episode;
  const epText = ep ? `S${ep.season} · E${ep.number} “${ep.name}”` : null;
  switch (item.reason) {
    case 'resume': return { chip: null, episode: epText, button: 'Resume' };
    case 'newEpisode': return { chip: 'NEW EPISODE', episode: epText, button: ep ? `Play S${ep.season} E${ep.number}` : 'Play' };
    case 'nextEpisode': return { chip: null, episode: epText, button: ep ? `Play S${ep.season} E${ep.number}` : 'Play' };
    case 'new': return { chip: 'NEW', episode: null, button: 'Play' };
    default: return { chip: null, episode: null, button: 'Play' };
  }
}

export function trailerSources(item: HeroItem, local: string[]): TrailerSource[] {
  return [...local.map((id) => ({ kind: 'local' as const, url: streamUrl(id) })), ...item.youtube.map((id) => ({ kind: 'youtube' as const, id }))];
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function saveData(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || (!!c.effectiveType && c.effectiveType !== '4g'));
}

const PHONE_QUERY = '(max-width: 699px)';

function isPhone(): boolean {
  return typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches;
}

/** Same format as the cards' sub line: "1h 44m", or "9m" under an hour. */
export function runtime(min: number): string {
  return fmtRuntime(min * 6e8) ?? '';
}

/** Phone meta: one line. NEW chip, rating, year, first genre, runtime or seasons. No age rating, no quality badge. */
export function phoneMeta(item: HeroItem, chip: string | null): HTMLElement {
  const parts: Node[] = [];
  let first = true;
  const add = (n: Node) => {
    if (!first) parts.push(h('span', { class: 'tide-hero-dot' }, '·'));
    first = false;
    parts.push(n);
  };
  if (chip === 'NEW') parts.push(h('span', { class: 'tide-chip tide-chip-w' }, 'NEW'));
  if (item.communityRating) add(h('span', {}, icon('star', 'tide-star'), ` ${item.communityRating.toFixed(1)}`));
  if (item.year) add(h('span', {}, String(item.year)));
  if (item.genres[0]) add(h('span', {}, item.genres[0]));
  if (item.runtimeMinutes) add(h('span', {}, runtime(item.runtimeMinutes)));
  else if (item.seasonCount) add(h('span', {}, `${item.seasonCount} season${item.seasonCount === 1 ? '' : 's'}`));
  return h('div', { class: 'tide-hero-meta-ph' }, ...parts);
}

/** Phone uses the Thumb image (a wider-subject crop) when the server says the item has one; otherwise the Backdrop. */
export function backgroundUrl(item: Pick<HeroItem, 'id' | 'hasThumb'>, phone = isPhone()): string {
  return phone && item.hasThumb ? imageUrl(item.id, 'Thumb', 1280) : imageUrl(item.id, 'Backdrop/0', 1920);
}

/** Desktop meta (X1): one quiet line, "2022 · Action · 2h 10m · ★ 8.2". Quality lives on the detail page. */
export function desktopMeta(item: HeroItem, chip: string | null): HTMLElement {
  const facts = [
    item.year ? h('span', {}, String(item.year)) : null,
    item.genres[0] ? h('span', {}, item.genres[0]) : null,
    item.runtimeMinutes ? h('span', {}, runtime(item.runtimeMinutes))
      : item.seasonCount ? h('span', {}, `${item.seasonCount} season${item.seasonCount === 1 ? '' : 's'}`) : null,
    item.communityRating ? h('span', {}, icon('star', 'tide-star'), ` ${item.communityRating.toFixed(1)}`) : null,
  ].filter((n): n is HTMLElement => !!n);
  const dotted: Node[] = [];
  facts.forEach((n, i) => { if (i) dotted.push(h('span', { class: 'tide-hero-dot', 'aria-hidden': 'true' }, '·')); dotted.push(n); });
  return h('div', { class: 'tide-hero-meta' }, chip === 'NEW' ? h('span', { class: 'tide-chip tide-chip-w' }, 'NEW') : null, ...dotted);
}

function slide(item: HeroItem, idx: number): HTMLElement {
  const r = reasonLine(item);
  const bg = h('div', { class: 'tide-hero-bg' });
  bg.style.backgroundImage = `url("${backgroundUrl(item)}")`;
  const title = () => h('div', { class: 'tide-hero-title' }, item.name);
  const logo = item.hasLogo ? h('img', { class: 'tide-hero-logo', src: imageUrl(item.id, 'Logo', 800), alt: item.name }) : title();
  if (logo instanceof HTMLImageElement) logo.onerror = () => logo.replaceWith(title());
  const meta = desktopMeta(item, r.chip);
  const episode = r.episode
    ? h('div', { class: 'tide-hero-ep' }, r.chip === 'NEW EPISODE' ? h('span', { class: 'tide-chip tide-chip-w' }, 'NEW EPISODE') : null, r.episode)
    : null;
  // R3: resume progress is a ring around ▶ inside the white button, followed by a dim "52m left".
  const primary = item.progress
    ? h('button', { class: 'tide-btn tide-btn-w tide-btn-lg tide-hero-resume', type: 'button', onclick: () => void play(item.playTargetId) },
      progressRing(item.progress.percent, 'tide-ring tide-hero-ring'), h('span', {}, r.button), h('span', { class: 'tide-hero-left' }, `${item.progress.minutesLeft}m left`))
    : h('button', { class: 'tide-btn tide-btn-w tide-btn-lg', type: 'button', onclick: () => void play(item.playTargetId) }, icon('play_arrow'), r.button);
  const buttons = h('div', { class: 'tide-hero-btns' },
    primary,
    h('button', { class: 'tide-btn tide-btn-lg', type: 'button', onclick: () => openDetails(item.id) }, icon('info'), 'More info'),
    // Jellyfin has no native watchlist: one ♥ Favourite toggle covers "Watchlist / Favourites".
    toggleButton({ icon: 'favorite', label: 'Favourite', on: item.isFavorite, cls: 'tide-ib-xl tide-fav-toggle', save: (on) => setFavourite(item.id, on) }));
  return h('div', { class: 'tide-hero-slide', 'data-i': idx }, bg, h('div', { class: 'tide-hero-vid' }), h('div', { class: 'tide-hero-shade' }),
    h('div', { class: 'tide-hero-txt' }, logo, meta, phoneMeta(item, r.chip), episode, h('p', { class: 'tide-hero-desc' }, item.overview), buttons));
}

export function createHero(items: HeroItem[], cfg: ClientConfig, onChange?: (item: HeroItem) => void) {
  const slides = items.map(slide);
  const muteBtn = h('button', { class: 'tide-ib tide-hero-mute', 'aria-label': 'Unmute' }, icon('volume_off'));
  const strip = h('div', { class: 'tide-t3' }, ...items.map((it, i) => {
    const text = () => h('span', { class: 'tide-t3-text' }, it.name);
    const logo = it.hasLogo ? h('img', { src: imageUrl(it.id, 'Logo', 260), alt: it.name }) : text();
    if (logo instanceof HTMLImageElement) logo.onerror = () => logo.replaceWith(text());
    return h('button', { class: 'tide-t3-item', 'data-i': i, 'aria-label': it.name, onclick: () => go(i) }, logo, h('span', { class: 'tide-t3-bar' }, h('i')));
  }));
  const el = h('section', { class: 'tide-hero' }, ...slides, strip, muteBtn);
  const motionOk = !reducedMotion();
  const trailersOn = cfg.enableTrailers && motionOk && !saveData();
  if (!trailersOn) muteBtn.hidden = true;

  const slotMs = cfg.heroSlotSeconds * 1000;
  type YtFrame = HTMLIFrameElement & { _tideFail?: () => void; _tideHeard?: boolean };
  let cur = -1;
  let gen = 0; // bumped on every go()/destroy(); stale async trailer work checks it
  let destroyed = false;
  let muted = true;
  let slotTimer: ReturnType<typeof setTimeout> | undefined;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let hsTimer: ReturnType<typeof setInterval> | undefined;
  let tabHidden = typeof document !== 'undefined' && document.hidden === true;
  let offscreen = false;
  let paused = tabHidden;
  let trailerStarted = false;
  let remainingMs = slotMs;
  let slotStartedAt = 0;
  /** In-flight trailer attempt (until it plays or fails); its load timeout is suspended while paused. */
  let attempt: { fail: () => void; pending: () => boolean } | null = null;
  /** Next trailer step requested while paused; run on resume. */
  let deferred: (() => void) | null = null;
  el.classList.toggle('paused', paused);

  const clearTimers = () => {
    [slotTimer, startTimer, loadTimer].forEach((t) => t !== undefined && clearTimeout(t));
    if (hsTimer !== undefined) clearInterval(hsTimer);
    slotTimer = startTimer = loadTimer = hsTimer = undefined;
    attempt = null;
    deferred = null;
  };

  /** `.tide-hero-playing` on the hero while the active slide shows a trailer (phone shows the mute button only then). */
  const syncPlaying = () => el.classList.toggle('tide-hero-playing', cur >= 0 && slides[cur]!.classList.contains('vidon'));

  function stopVideo(s: HTMLElement): void {
    s.classList.remove('vidon');
    syncPlaying();
    const v = s.querySelector('.tide-hero-vid')!;
    v.classList.remove('show');
    v.replaceChildren();
  }

  function scheduleNext(ms: number): void {
    slotStartedAt = Date.now();
    remainingMs = ms;
    slotTimer = setTimeout(() => go(cur + 1), ms);
  }

  const bars = () => strip.querySelectorAll<HTMLElement>('.tide-t3-bar i');

  function setBar(i: number, ms: number, from = 0, run = true): void {
    bars().forEach((b, n) => {
      // Progress fills via transform (compositor-only), never width (which re-lays out every frame).
      b.style.transition = 'none';
      b.style.transform = `scaleX(${n === i ? from / 100 : 0})`;
    });
    const bar = bars()[i];
    if (bar && run) {
      void bar.getBoundingClientRect();
      bar.style.transition = `transform ${ms}ms linear`;
      bar.style.transform = 'scaleX(1)';
    }
  }

  function startTrailerTimer(i: number, g: number): void {
    startTimer = setTimeout(() => { trailerStarted = true; void startTrailer(i, g); }, START_DELAY);
  }

  async function startTrailer(i: number, g: number): Promise<void> {
    const item = items[i]!;
    let local: string[] = [];
    try {
      local = (await api<{ Id: string }[]>(`/Items/${item.id}/LocalTrailers`)).map((t) => t.Id);
    } catch { /* none */ }
    if (g !== gen) return;
    tryNext(i, g, trailerSources(item, local), 0);
  }

  function tryNext(i: number, g: number, sources: TrailerSource[], n: number): void {
    if (g !== gen) return;
    if (paused) { deferred = () => tryNext(i, g, sources, n); return; }
    const s = slides[i]!;
    const box = s.querySelector('.tide-hero-vid')!;
    if (n >= sources.length) {
      attempt = null;
      if (motionOk) s.classList.add('kenburns');
      return;
    }
    const src = sources[n]!;
    let done = false;
    let node: HTMLElement | null = null;
    // force: fail over even after ok() (e.g. a YouTube onError after playback began), as long as this source is still shown.
    const fail = (force = false) => {
      if ((done && !force) || g !== gen || box.firstChild !== node) return;
      done = true;
      if (loadTimer !== undefined) { clearTimeout(loadTimer); loadTimer = undefined; }
      if (hsTimer !== undefined) { clearInterval(hsTimer); hsTimer = undefined; }
      s.classList.remove('vidon');
      syncPlaying();
      box.classList.remove('show');
      box.replaceChildren();
      tryNext(i, g, sources, n + 1);
    };
    const ok = () => {
      if (done || g !== gen) return;
      done = true;
      if (loadTimer !== undefined) { clearTimeout(loadTimer); loadTimer = undefined; }
      box.classList.add('show');
      s.classList.add('vidon');
      syncPlaying();
    };
    attempt = { fail: () => fail(), pending: () => !done };
    loadTimer = setTimeout(() => fail(), LOAD_TIMEOUT);
    if (src.kind === 'local') {
      const v = h('video', { muted: true, playsinline: true }) as HTMLVideoElement;
      v.muted = muted;
      v.autoplay = !paused;
      v.src = src.url;
      v.addEventListener('playing', ok, { once: true });
      v.addEventListener('error', () => fail(), { once: true });
      v.addEventListener('ended', () => { if (g === gen) go(i + 1); });
      node = v;
      box.replaceChildren(v);
    } else {
      const f = h('iframe', {
        allow: 'autoplay; encrypted-media',
        referrerpolicy: 'strict-origin-when-cross-origin',
        title: 'Trailer',
        tabindex: '-1',
        'aria-hidden': 'true',
        src: `${YT_ORIGIN}/embed/${src.id}?autoplay=${paused ? 0 : 1}&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`,
      }) as YtFrame;
      f._tideFail = () => fail(true);
      f.addEventListener('load', () => {
        if (g !== gen) return;
        // Without a 'listening' handshake the embed never posts state events (so 'ended' / errors are never seen).
        // Retry until the player answers (onReady / infoDelivery), max 10 tries.
        let tries = 0;
        const listen = () => {
          if (f._tideHeard || tries++ >= 10 || g !== gen) { if (hsTimer !== undefined) clearInterval(hsTimer); hsTimer = undefined; return; }
          f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'tide', channel: 'widget' }), YT_ORIGIN);
        };
        listen();
        if (hsTimer !== undefined) clearInterval(hsTimer);
        hsTimer = setInterval(listen, 250);
        setTimeout(() => {
          if (g !== gen) return;
          ok();
          if (!muted) ytCommand(f, 'unMute');
          if (paused) ytCommand(f, 'pauseVideo');
        }, 1500);
      }, { once: true });
      node = f;
      box.replaceChildren(f);
    }
  }

  function ytCommand(f: HTMLIFrameElement, func: string): void {
    f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), YT_ORIGIN);
  }

  function onYtMessage(e: MessageEvent): void {
    if (e.origin !== YT_ORIGIN || typeof e.data !== 'string') return;
    const f = (cur >= 0 ? slides[cur]!.querySelector('iframe') : null) as YtFrame | null;
    if (!f || e.source !== f.contentWindow) return; // only the active slide's player
    let d: { event?: string; info?: unknown };
    try { d = JSON.parse(e.data) as typeof d; } catch { return; }
    f._tideHeard = true;
    if (d.event === 'onError') { f._tideFail?.(); return; }
    const state = d.event === 'onStateChange' && typeof d.info === 'number'
      ? d.info
      : typeof d.info === 'object' && d.info !== null ? (d.info as { playerState?: number }).playerState : undefined;
    if (state === 0) go(cur + 1); // ended
  }

  function setActive(i: number, on: boolean): void {
    const s = slides[i]!;
    s.classList.toggle('on', on);
    if (on) { s.removeAttribute('inert'); s.removeAttribute('aria-hidden'); } else { s.setAttribute('inert', ''); s.setAttribute('aria-hidden', 'true'); }
    const t = strip.children[i];
    t?.classList.toggle('on', on);
    if (on) t?.setAttribute('aria-current', 'true'); else t?.removeAttribute('aria-current');
  }

  function go(n: number): void {
    if (!items.length || destroyed) return;
    clearTimers();
    gen++;
    if (cur >= 0) {
      slides[cur]!.classList.remove('kenburns');
      stopVideo(slides[cur]!);
    }
    cur = ((n % items.length) + items.length) % items.length;
    slides.forEach((_, i) => setActive(i, i === cur));
    onChange?.(items[cur]!);
    trailerStarted = false;
    remainingMs = slotMs;
    setBar(cur, slotMs, 0, !paused);
    if (paused) return; // resume schedules slot + trailer
    if (items.length > 1) scheduleNext(slotMs);
    if (trailersOn) startTrailerTimer(cur, gen);
    else if (motionOk) slides[cur]!.classList.add('kenburns');
  }

  function mediaCommand(play: boolean): void {
    const s = slides[cur];
    const f = s?.querySelector('iframe');
    const v = s?.querySelector('video');
    if (f) ytCommand(f as HTMLIFrameElement, play ? 'playVideo' : 'pauseVideo');
    if (v) try { if (play) void (v as HTMLVideoElement).play()?.catch(() => {}); else (v as HTMLVideoElement).pause(); } catch { /* jsdom */ }
  }

  function setPaused(): void {
    if (destroyed) return;
    const want = tabHidden || offscreen;
    el.classList.toggle('paused', want);
    if (want === paused || cur < 0) { paused = want; return; }
    paused = want;
    if (paused) {
      if (slotTimer !== undefined) {
        clearTimeout(slotTimer);
        slotTimer = undefined;
        remainingMs = Math.max(0, remainingMs - (Date.now() - slotStartedAt));
      }
      if (startTimer !== undefined) { clearTimeout(startTimer); startTimer = undefined; }
      if (loadTimer !== undefined) { clearTimeout(loadTimer); loadTimer = undefined; }
      setBar(cur, 0, (1 - remainingMs / slotMs) * 100, false);
      mediaCommand(false);
    } else {
      if (items.length > 1) {
        scheduleNext(remainingMs);
        setBar(cur, remainingMs, (1 - remainingMs / slotMs) * 100);
      }
      if (trailersOn && !trailerStarted) startTrailerTimer(cur, gen);
      else if (!trailersOn && motionOk) slides[cur]!.classList.add('kenburns');
      if (attempt?.pending() && loadTimer === undefined) loadTimer = setTimeout(attempt.fail, LOAD_TIMEOUT);
      mediaCommand(true);
      const d = deferred;
      deferred = null;
      d?.();
    }
  }

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.firstElementChild!.textContent = muted ? 'volume_off' : 'volume_up';
    muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    const s = slides[cur];
    const f = s?.querySelector('iframe');
    const v = s?.querySelector('video');
    if (f) ytCommand(f as HTMLIFrameElement, muted ? 'mute' : 'unMute');
    if (v) (v as HTMLVideoElement).muted = muted;
  });

  const onVis = () => { tabHidden = document.hidden; setPaused(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('message', onYtMessage);
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (!last) return;
      offscreen = !last.isIntersecting;
      setPaused();
    }, { threshold: 0.2 })
    : null;
  io?.observe(el);

  go(0);

  return {
    el,
    go,
    current: () => cur,
    destroy(): void {
      destroyed = true;
      clearTimers();
      gen++;
      slides.forEach(stopVideo);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('message', onYtMessage);
      io?.disconnect();
    },
  };
}
