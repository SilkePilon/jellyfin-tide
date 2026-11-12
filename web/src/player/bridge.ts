/** The only module that touches the stock 12.4 player (#videoOsdPage). Verified selectors: docs/notes/web-12.4-player.md */
export interface PlayerState { percent: number; position: number; duration: number; paused: boolean; muted: boolean; volume: number; buffered: number | null; hasVideo: boolean }
export interface Bridge {
  root: HTMLElement;
  video(): HTMLVideoElement | null;
  read(): PlayerState;
  setDuration(seconds: number): void;
  togglePlay(): void; seek(seconds: number): void; seekBy(delta: number): void;
  next(): void; previous(): void; toggleMute(): void; setVolume(v: number): void;
  fullscreen(): void; pip(): void; openStock(which: 'audio' | 'subtitles' | 'settings'): void;
  onState(cb: (s: PlayerState) => void): () => void;
}

const SEL = {
  slider: '.osdPositionSlider', pause: '.btnPause', next: '.btnNextTrack', prev: '.btnPreviousTrack',
  fullscreen: '.btnFullscreen', pip: '.btnPip', audio: '.btnAudio', subtitles: '.btnSubtitles', settings: '.btnVideoOsdSettings',
  mute: 'button[title^="Mute"], button[title^="Unmute"], .buttonMute', volume: '.osdVolumeSlider',
} as const;

export function createBridge(root: HTMLElement): Bridge {
  let duration = 0;
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s);
  const click = (s: string) => q<HTMLButtonElement>(s)?.click();
  // read() runs every animation frame: keep the hot elements and re-query only once they leave the DOM.
  const keep = <T extends Element>(find: () => T | null) => {
    let el: T | null = null;
    return () => (el?.isConnected ? el : (el = find()));
  };
  const video = keep(() => document.querySelector<HTMLVideoElement>('.videoPlayerContainer video'));
  const slider = keep(() => q<HTMLInputElement>(SEL.slider));
  const volumeSlider = keep(() => q<HTMLInputElement>(SEL.volume));
  const pauseBtn = keep(() => q(SEL.pause));
  const muteBtn = keep(() => q(SEL.mute));
  /** Stock icon name. 12.4 videoosd marks state with a class on an empty span (`material-icons play_arrow`); ligature text is the fallback. */
  const icon = (btn: Element | null, names: readonly string[]) => {
    const el = btn?.querySelector('.material-icons, .tide-ms');
    if (!el) return '';
    return names.find((n) => el.classList.contains(n)) ?? (el.textContent ?? '').trim();
  };

  const read = (): PlayerState => {
    const v = video();
    const pct = Number(slider()?.value ?? 0) || 0;
    const position = v && Number.isFinite(v.currentTime) && v.currentTime > 0 ? v.currentTime : (pct / 100) * duration;
    let buffered: number | null = null;
    if (v) {
      buffered = 0;
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= position && v.buffered.end(i) >= position) buffered = v.buffered.end(i) - position;
      }
    }
    return {
      percent: pct, position, duration,
      paused: v ? v.paused : icon(pauseBtn(), ['play_arrow', 'pause']) === 'play_arrow',
      muted: v ? v.muted : icon(muteBtn(), ['volume_off', 'volume_up']) === 'volume_off',
      volume: Number(volumeSlider()?.value ?? 100),
      buffered, hasVideo: !!v,
    };
  };

  const seek = (seconds: number) => {
    const s = slider();
    if (!s || duration <= 0) return;
    const pct = Math.max(0, Math.min(100, (seconds / duration) * 100));
    s.value = String(Math.round(pct * 100) / 100);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  };

  return {
    root, video, read,
    setDuration: (d) => { duration = d; },
    togglePlay: () => click(SEL.pause),
    seek,
    seekBy: (delta) => seek(read().position + delta),
    next: () => click(SEL.next), previous: () => click(SEL.prev),
    toggleMute: () => click(SEL.mute),
    setVolume: (val) => { const s = q<HTMLInputElement>(SEL.volume); if (s) { s.value = String(val); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); } },
    fullscreen: () => click(SEL.fullscreen), pip: () => click(SEL.pip),
    openStock: (w) => click(SEL[w]),
    onState(cb) {
      let last = '';
      let frame = 0;
      const tick = () => {
        const s = read();
        const key = `${s.percent}|${Math.round(s.position * 10)}|${+s.paused}|${+s.muted}|${s.volume}|${s.buffered === null ? '' : Math.round(s.buffered * 10)}`;
        if (key !== last) { last = key; cb(s); }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    },
  };
}
