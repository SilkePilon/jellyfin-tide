import './player.css';
import { jfApiClient } from '../api/client';
import { invalidate } from '../api/cache';
import { play } from '../api/actions';
import { getEpisodes, getItem, type JfDetail } from '../api/item';
import { fmtRuntime, h, icon } from '../ui/dom';
import { ROUTES, SELECTORS } from '../router/selectors';
import type { Takeover } from '../router/hook';
import { createBridge, type PlayerState } from './bridge';
import { createControls } from './controls';
import { createShelf } from './shelf';
import { createSettingsSheet, streamsToSheet } from './settingsSheet';
import { createPausedScreen } from './paused';
import { createEndCard } from './endCard';
import { createBuffering, createLoading, loadingPercent, loadingSteps } from './loading';
import { attachTouch } from './touch';
import { pollSession, type NowPlaying } from './session';
import { applySetting, qualityChoices } from './commands';
import { loadSegments, type Segments } from './segments';
import type { TrickplayInfo } from './format';
import type { ClientConfig, JfItem } from '../types';

const loading = createLoading();

export async function mountPlayer(host: HTMLElement, cfg: ClientConfig): Promise<() => void> {
  invalidate(); // resume points / Next Up change while watching
  host.classList.add('tide-taken');
  const root = h('div', { class: 'tide-player' });
  document.body.append(root);
  const bridge = createBridge(host);
  let np: NowPlaying | null = null;
  let itemKey = '';
  let next: JfItem | null = null;
  let segments: Segments = { intro: null, credits: null };
  let subSize: 'S' | 'M' | 'L' | 'XL' = 'M';
  let speed = 1;
  let quality = 'Auto';
  let sourceHeight = 0;
  let pendingAudio: number | undefined;
  let fullItem: JfDetail | null = null;
  let pendingSubs: number | null | undefined;

  const shelf = createShelf((open) => { root.classList.toggle('tide-ps-open', open); controls.setPinned(open || sheet.isOpen()); });
  const sheet = createSettingsSheet(async (kind, value) => {
    if (!np) return;
    if (kind === 'subSize') { subSize = value as typeof subSize; document.documentElement.dataset.tideSubsize = value; return; }
    if (kind === 'speed') speed = Number(value);
    if (kind === 'quality') quality = value;
    // Optimistic (docs/notes/web-12.4-player.md): remember the pick so the next poll's stale index doesn't revert the sheet.
    if (kind === 'audio') pendingAudio = Number(value);
    if (kind === 'subtitles') pendingSubs = Number(value) < 0 ? null : Number(value);
    await applySetting(kind, value, { sessionId: np.sessionId, bridge });
  }, (open) => { root.classList.toggle('tide-pset-open', open); controls.setPinned(open || shelf.isOpen()); });
  const openShelf = () => { if (!np || np.item.Type !== 'Episode') return; sheet.close(); shelf.isOpen() ? shelf.close() : shelf.open(); };
  const openSheet = () => { shelf.close(); sheet.isOpen() ? sheet.close() : sheet.open(); };
  const playNext = () => { if (next) void play(next.Id); };
  const controls = createControls({ bridge, onEpisodes: openShelf, onSettings: openSheet, onNext: playNext, hasNext: () => !!next, isSeries: () => np?.item.Type === 'Episode' });
  const paused = createPausedScreen(root);
  const endCard = createEndCard(playNext);
  const buffering = createBuffering();
  const ripL = h('div', { class: 'tide-rip l' }, icon('fast_rewind'), h('span', {}, '−10 s'));
  const ripR = h('div', { class: 'tide-rip r' }, icon('fast_forward'), h('span', {}, '+10 s'));
  root.append(controls.el, paused.el, endCard.el, buffering.el, ripL, ripR, shelf.el, sheet.el);

  const autoplay = await (jfApiClient() as unknown as { getCurrentUser?(): Promise<{ Configuration?: { EnableNextEpisodeAutoPlay?: boolean } }> } | null)
    ?.getCurrentUser?.().then((u) => u?.Configuration?.EnableNextEpisodeAutoPlay !== false).catch(() => true) ?? true;

  const sheetData = () => {
    if (!np) return;
    // Drop a pending pick once the session has caught up with it.
    if (pendingAudio !== undefined && np.audioIndex === pendingAudio) pendingAudio = undefined;
    if (pendingSubs !== undefined && np.subtitleIndex === pendingSubs) pendingSubs = undefined;
    sheet.setData({
    ...streamsToSheet(fullItem && fullItem.Id === np.item.Id ? fullItem : np.item), audioIndex: pendingAudio ?? np.audioIndex, subtitleIndex: pendingSubs === undefined ? np.subtitleIndex : pendingSubs,
    quality: qualityChoices(sourceHeight), qualityCur: quality, speed, subSize,
    });
  };

  const onItem = async (n: NowPlaying) => {
    const it = n.item;
    const full = await getItem(it.Id).catch(() => it);
    fullItem = full;
    const runtime = (it.RunTimeTicks ?? full.RunTimeTicks ?? 0) / 1e7;
    bridge.setDuration(runtime);
    const isEp = it.Type === 'Episode';
    const sid = isEp ? (it.SeriesId ?? it.Id) : it.Id;
    const line = isEp ? `S${it.ParentIndexNumber ?? 0} · E${it.IndexNumber ?? 0} · ${it.Name}` : it.Name;
    const src = (full as { MediaSources?: { Id: string; MediaStreams?: { Type: string; Height?: number }[] }[] }).MediaSources?.[0];
    sourceHeight = src?.MediaStreams?.find((s) => s.Type === 'Video')?.Height ?? 0;
    const tp = (full as { Trickplay?: Record<string, Record<string, TrickplayInfo>> }).Trickplay?.[src?.Id ?? ''];
    const tpInfo = tp ? Object.values(tp)[0] : undefined;
    next = null;
    if (isEp && it.SeriesId && it.SeasonId) {
      const eps = await getEpisodes(it.SeriesId, it.SeasonId).catch(() => [] as JfItem[]);
      next = eps[eps.findIndex((e) => e.Id === it.Id) + 1] ?? null;
      void shelf.setEpisode(it.SeriesId, it.Id);
    }
    // After `next` is known: setItem decides whether the Episodes / Next episode pills are shown.
    controls.setItem({ logoId: sid, title: isEp ? it.SeriesName ?? it.Name : it.Name, line, stillId: it.Id, trickplay: tpInfo && src ? { id: it.Id, mediaSourceId: src.Id, info: tpInfo } : null });
    segments = await loadSegments(it.Id, runtime, cfg);
    controls.setSegments(segments);
    const left = (n2: number) => `${Math.max(0, Math.round(n2))}m left`;
    paused.setItem({
      posterId: sid, logoId: sid, line, overview: full.Overview ?? '',
      meta: [full.ProductionYear, fmtRuntime(it.RunTimeTicks), left((runtime - bridge.read().position) / 60), full.OfficialRating].filter(Boolean).join(' · '),
      next: next ? { id: next.Id, label: `${next.IndexNumber ?? ''}. ${next.Name}`, runtime: fmtRuntime(next.RunTimeTicks) ?? '' } : null,
    }, playNext);
    endCard.setNext(next ? { id: next.Id, title: `${next.IndexNumber ?? ''}. ${next.Name}`, runtime: fmtRuntime(next.RunTimeTicks) ?? '', stillId: next.Id } : null, autoplay);
    sheetData();
  };

  const stopPoll = pollSession((n) => {
    if (!n) return;
    np = n;
    if (n.item.Id !== itemKey) {
      itemKey = n.item.Id;
      const v0 = bridge.video();
      if (!loading.isOn() && !(v0 && v0.currentTime > 0 && !v0.paused)) { loading.show(n.item.Id); loading.update(1, null, loadingSteps(n.transcode, null)); }
      void onItem(n);
    }
    else sheetData();
    if (loading.isOn()) loading.update(1, loadingPercent(1, n.transcode?.completion ?? null, null), loadingSteps(n.transcode, null));
  });

  let lastT = performance.now();
  const stopState = bridge.onState((s: PlayerState) => {
    const t = performance.now();
    const dt = (t - lastT) / 1000;
    lastT = t;
    controls.update(s);
    paused.arm(s.paused, shelf.isOpen() || sheet.isOpen() || endCard.isShowing());
    endCard.update(s.position, segments.credits, !s.paused, dt);
    if (loading.isOn()) {
      if (!s.paused && s.position > 0) loading.hide();
      else loading.update(2, loadingPercent(2, null, s.buffered), loadingSteps(np?.transcode ?? null, null));
    }
  });

  const v = bridge.video();
  const onWait = () => buffering.set(true, (() => { const b = bridge.read().buffered; return b === null ? null : Math.min(100, Math.round((b / 5) * 100)); })());
  const onPlaying = () => buffering.set(false, null);
  v?.addEventListener('waiting', onWait);
  v?.addEventListener('stalled', onWait);
  v?.addEventListener('playing', onPlaying);

  const ripple = (side: -1 | 1) => { const r = side < 0 ? ripL : ripR; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); };
  const stopTouch = attachTouch(root, {
    toggleControls: () => (controls.isIdle() ? controls.wake() : root.classList.add('tide-pc-idle')),
    togglePlay: () => bridge.togglePlay(), seekBy: (d) => bridge.seekBy(d), openShelf: openShelf, ripple,
  });
  root.addEventListener('pointermove', (e) => {
    if (paused.isOn() && (e.target as Element).closest('[data-pz-next]')) return;
    if (paused.isOn()) paused.dismiss();
    controls.wake();
  });
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (paused.isOn()) { paused.dismiss(); controls.wake(); return; }
    if (sheet.isOpen() && !t.closest('.tide-pset')) { sheet.close(); return; }
    if (shelf.isOpen() && !t.closest('.tide-pshelf')) { shelf.close(); return; }
    if (t.closest('.tide-pc-b, .tide-pc-p, .tide-pc-scr, .tide-pshelf, .tide-pset, .tide-end, .tide-pz-next')) return;
    if ((e as PointerEvent).pointerType === 'touch') return;
    bridge.togglePlay();
  });
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (sheet.isOpen()) sheet.close(); else if (shelf.isOpen()) shelf.close(); else if (paused.isOn()) paused.dismiss(); else return;
    e.preventDefault(); e.stopPropagation();
  };
  document.addEventListener('keydown', onEsc, true);

  return () => {
    stopPoll(); stopState(); stopTouch();
    v?.removeEventListener('waiting', onWait); v?.removeEventListener('stalled', onWait); v?.removeEventListener('playing', onPlaying);
    document.removeEventListener('keydown', onEsc, true);
    controls.dispose(); shelf.dispose(); sheet.dispose(); paused.dispose(); endCard.dispose();
    loading.hide();
    root.remove();
    host.classList.remove('tide-taken');
    invalidate();
  };
}

export const PLAYER_TAKEOVER: Takeover = {
  id: 'player',
  rootClass: 'tide-player-anchor',
  matches: (cfg, loc) => cfg.enablePlayer !== false && ROUTES.isPlayer(loc),
  key: () => 'player',
  findHost: () => document.querySelector<HTMLElement>(SELECTORS.playerHost),
  mount: async (host, cfg) => {
    const un = await mountPlayer(host, cfg);
    // The router checks `:scope > .rootClass` on the host to know we are still mounted: leave an anchor.
    const anchor = h('i', { class: 'tide-player-anchor', hidden: true });
    host.prepend(anchor);
    return () => { anchor.remove(); un(); };
  },
};

/** K1 starts the moment Tide asks to play (the route change can take seconds). */
export function initPlayLoading(cfg: ClientConfig): () => void {
  if (cfg.enablePlayer === false) return () => {};
  if (!loading.el.isConnected) document.body.append(loading.el);
  let safety: ReturnType<typeof setTimeout> | undefined;
  const onPlay = (e: Event) => {
    const id = (e as CustomEvent<{ id: string }>).detail?.id;
    if (!id) return;
    loading.show(id);
    loading.update(0, loadingPercent(0, null, null), loadingSteps(null, null));
    if (safety) clearTimeout(safety);
    safety = setTimeout(() => loading.hide(), 90_000);
  };
  const onRoute = () => { if (!ROUTES.isPlayer() && loading.isOn() && !document.querySelector('.videoPlayerContainer video')) setTimeout(() => { if (!ROUTES.isPlayer()) loading.hide(); }, 15_000); };
  // Plays started from stock buttons (detail page Play/Resume, card play overlays) never call Tide's play():
  // start K1 on those clicks too, so the seconds before #/video appears are covered.
  const STOCK_PLAY = '.btnPlay, .btnResume, button[data-action="play"], button[data-action="resume"], .cardOverlayFab-primary, .playButton';
  const onClick = (e: Event) => {
    const t = (e.target as Element | null)?.closest?.(STOCK_PLAY);
    if (!t || t.closest('.tide-player, .tide-details, .tide-home')) return;
    const id = t.closest<HTMLElement>('[data-id]')?.dataset.id ?? ROUTES.detailsParams()?.get('id');
    if (id) window.dispatchEvent(new CustomEvent('tide:play', { detail: { id } }));
  };
  window.addEventListener('tide:play', onPlay);
  window.addEventListener('hashchange', onRoute);
  document.addEventListener('click', onClick, true);
  return () => { window.removeEventListener('tide:play', onPlay); window.removeEventListener('hashchange', onRoute); document.removeEventListener('click', onClick, true); if (safety) clearTimeout(safety); };
}
