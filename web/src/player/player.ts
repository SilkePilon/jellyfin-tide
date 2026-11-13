import './player.css';
import { api, jfApiClient } from '../api/client';
import { invalidate } from '../api/cache';
import { play } from '../api/actions';
import { getEpisodes, getItem, type JfDetail } from '../api/item';
import { fmtRuntime, h, icon } from '../ui/dom';
import { ROUTES, SELECTORS } from '../router/selectors';
import type { Takeover } from '../router/hook';
import { createBridge, type PlayerState } from './bridge';
import { createControls } from './controls';
import { createShelf } from './shelf';
import { createPausedScreen } from './paused';
import { createEndCard } from './endCard';
import { createBuffering, createLoading, loadingPercent, loadingSteps } from './loading';
import { attachTouch } from './touch';
import { pollSession, type NowPlaying } from './session';
import { applySetting } from './commands';
import { trackLists } from './tracks';
import { createStockMenu, createSubOffset } from './stockMenu';
import { createSettingsMenu } from './settingsMenu';
import { createSubtitlesMenu, type SubSize } from './subtitlesMenu';
import { loadOnlineSubs, type OnlineSubs } from './onlineSubs';
import { loadSegments, type Segments } from './segments';
import type { TrickplayInfo } from './format';
import { animator } from '../ui/scrollAnim';
import { isMouseNotch, wheelPixels, WHEEL_MS } from '../theme/smoothScroll';
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
  let segments: Segments = { skips: [], credits: null };
  let subSize: SubSize = 'M';
  let online: OnlineSubs | null = null;
  let pendingAudio: number | undefined;
  let fullItem: JfDetail | null = null;
  let pendingSubs: number | null | undefined;

  const pinMenus = () => controls.setPinned(shelf.isOpen() || settings.isOpen() || subs.isOpen());
  const shelf = createShelf((open) => { root.classList.toggle('tide-ps-open', open); pinMenus(); });
  const stock = createStockMenu(() => host.querySelector<HTMLElement>('.btnVideoOsdSettings'));
  const subOffset = createSubOffset(stock);
  let suboffsetOk: Promise<boolean> | null = null;
  const tracksNow = () => trackLists(np ? (fullItem && fullItem.Id === np.item.Id ? fullItem : np.item) : null);
  const settings = createSettingsMenu({
    stock,
    audio: () => ({ tracks: tracksNow().audio, current: pendingAudio ?? np?.audioIndex ?? null }),
    pickAudio: (i) => { if (!np) return; pendingAudio = i; void applySetting('audio', String(i), { sessionId: np.sessionId, bridge }); },
    statsOn: () => { const s = document.querySelector('.playerStats'); return !!s && !s.classList.contains('hide'); },
    openStock: () => bridge.openStock('settings'),
    onOpenChange: (o) => { root.classList.toggle('tide-pset-open', o); pinMenus(); },
  });
  const subs = createSubtitlesMenu({
    tracks: () => ({ list: tracksNow().subtitles, current: pendingSubs === undefined ? (np?.subtitleIndex ?? null) : pendingSubs }),
    // Optimistic (docs/notes/web-12.4-player.md): remember the pick so the next poll's stale index doesn't revert it.
    pick: (i) => { if (!np) return; pendingSubs = i; void applySetting('subtitles', String(i ?? -1), { sessionId: np.sessionId, bridge }); },
    size: () => subSize,
    setSize: (s) => { subSize = s; document.documentElement.dataset.tideSubsize = s; },
    timing: {
      available: () => (suboffsetOk ??= stock.rows().then((r) => r.some((x) => x.id === 'suboffset'), () => { suboffsetOk = null; return false; })),
      get: subOffset.get,
      set: subOffset.set,
    },
    online: () => online,
    onDownloaded: (index) => { void restartWithSubtitle(index); },
    onOpenChange: (o) => { root.classList.toggle('tide-psub-open', o); pinMenus(); },
  });
  const closeMenus = (keep?: 'shelf' | 'set' | 'subs') => {
    if (keep !== 'shelf') shelf.close();
    if (keep !== 'set') settings.close();
    if (keep !== 'subs') subs.close();
  };
  const openShelf = () => { if (!np || np.item.Type !== 'Episode') return; closeMenus('shelf'); shelf.isOpen() ? shelf.close() : shelf.open(); };
  const openSettings = () => { closeMenus('set'); settings.isOpen() ? settings.close() : settings.open(controls.anchor('set')); };
  const openSubs = () => { closeMenus('subs'); subs.isOpen() ? subs.close() : subs.open(controls.anchor('subs')); };
  const playNext = () => { if (next) void play(next.Id); };
  const controls = createControls({ bridge, onEpisodes: openShelf, onSettings: openSettings, onSubtitles: openSubs, onNext: playNext, hasNext: () => !!next, isSeries: () => np?.item.Type === 'Episode' });
  const paused = createPausedScreen(root);
  const endCard = createEndCard(playNext);
  const buffering = createBuffering();
  const ripL = h('div', { class: 'tide-rip l' }, icon('fast_rewind'), h('span', {}, '−10 s'));
  const ripR = h('div', { class: 'tide-rip r' }, icon('fast_forward'), h('span', {}, '+10 s'));
  root.append(controls.el, paused.el, endCard.el, buffering.el, ripL, ripR, shelf.el, settings.el, subs.el);

  const autoplay = await (jfApiClient() as unknown as { getCurrentUser?(): Promise<{ Configuration?: { EnableNextEpisodeAutoPlay?: boolean } }> } | null)
    ?.getCurrentUser?.().then((u) => u?.Configuration?.EnableNextEpisodeAutoPlay !== false).catch(() => true) ?? true;

  const menusData = () => {
    if (!np) return;
    // Drop a pending pick once the session has caught up with it.
    if (pendingAudio !== undefined && np.audioIndex === pendingAudio) pendingAudio = undefined;
    if (pendingSubs !== undefined && np.subtitleIndex === pendingSubs) pendingSubs = undefined;
    subs.refresh();
  };
  /** After an online download: restart at the same position with the new (external) subtitle stream. */
  const restartWithSubtitle = async (index: number) => {
    if (!np) return;
    const pos = bridge.read().position;
    subs.close();
    loading.show(np.item.Id);
    loading.update(1, null, [{ icon: 'download_done', text: 'Subtitles downloaded' }, { icon: 'restart_alt', text: 'Restarting playback' }]);
    try {
      await api(`/Sessions/${np.sessionId}/Playing`, { method: 'POST', query: {
        playCommand: 'PlayNow', itemIds: np.item.Id, startPositionTicks: Math.round(pos * 1e7), subtitleStreamIndex: index,
        audioStreamIndex: pendingAudio ?? np.audioIndex ?? undefined, mediaSourceId: fullItem?.MediaSources?.[0]?.Id,
      } });
      pendingSubs = index;
      itemKey = ''; // reload the item on the next poll: its streams now include the new subtitle
    } catch {
      loading.hide();
    }
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
    controls.setSubsVisible(trackLists(full).subtitles.length > 0);
    online = null;
    void loadOnlineSubs(it.Id).then((o) => {
      if (np?.item.Id !== it.Id) return;
      online = o;
      controls.setSubsVisible(trackLists(full).subtitles.length > 0 || !!o);
    });
    menusData();
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
    else menusData();
    if (loading.isOn()) loading.update(1, loadingPercent(1, n.transcode?.completion ?? null, null), loadingSteps(n.transcode, null));
  });

  let lastT = performance.now();
  const stopState = bridge.onState((s: PlayerState) => {
    const t = performance.now();
    const dt = (t - lastT) / 1000;
    lastT = t;
    controls.update(s);
    paused.arm(s.paused, shelf.isOpen() || settings.isOpen() || subs.isOpen() || endCard.isShowing());
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
  // The paused screen leaves only when playback resumes (paused.arm(false) on the next state); moving the mouse keeps it.
  root.addEventListener('pointermove', () => { if (!paused.isOn()) controls.wake(); });
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (paused.isOn()) { if (!t.closest('[data-pz-next]')) bridge.togglePlay(); return; }
    if ((settings.isOpen() || subs.isOpen()) && !t.closest('.tide-pmenu')) { settings.close(); subs.close(); return; }
    if (shelf.isOpen() && !t.closest('.tide-pshelf')) { shelf.close(); return; }
    if (t.closest('.tide-pc-b, .tide-pc-p, .tide-pc-scr, .tide-pshelf, .tide-pmenu, .tide-end, .tide-pz-next')) return;
    if ((e as PointerEvent).pointerType === 'touch') return;
    bridge.togglePlay();
  });
  // Stock 12.4 turns every wheel event into volume (videoosd listens on `document`). Over Tide's panels the wheel
  // scrolls instead: stop it at our root (native list scrolling still happens), and page the episode row sideways.
  const onWheel = (e: WheelEvent) => {
    const t = e.target as Element;
    if (!t.closest?.('.tide-pshelf, .tide-pmenu, .tide-pop')) return;
    e.stopPropagation();
    const track = t.closest<HTMLElement>('.tide-row-track');
    if (!track || t.closest('.tide-pop') || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    e.preventDefault();
    const a = animator(track, 'x');
    const px = wheelPixels(e, track, 'x');
    if (isMouseNotch(e)) a.to((a.target() ?? track.scrollLeft) + px, WHEEL_MS);
    else a.jump(track.scrollLeft + px);
  };
  root.addEventListener('wheel', onWheel, { passive: false });
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (settings.isOpen()) { if (!settings.back()) settings.close(); }
    else if (subs.isOpen()) subs.close();
    else if (shelf.isOpen()) shelf.close();
    else return;
    e.preventDefault(); e.stopPropagation();
  };
  document.addEventListener('keydown', onEsc, true);

  return () => {
    stopPoll(); stopState(); stopTouch();
    v?.removeEventListener('waiting', onWait); v?.removeEventListener('stalled', onWait); v?.removeEventListener('playing', onPlaying);
    document.removeEventListener('keydown', onEsc, true);
    controls.dispose(); shelf.dispose(); paused.dispose(); endCard.dispose();
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
