import { FONT_ICON_RENAMES, MUI_ICON_MAP } from './map';
import FONT_NAMES from '../theme/fonts/tide-symbols.json';
import type { ClientConfig } from '../types';

/** Glyphs in Tide's subset font. Stock font icons outside it keep jellyfin-web's own font. */
const IN_FONT = new Set<string>(FONT_NAMES);

function symbol(name: string, keepClasses: string[]): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = ['tide-ms', ...keepClasses].join(' ');
  s.setAttribute('aria-hidden', 'true');
  s.textContent = name;
  return s;
}

function mappedName(el: Element | null): string | undefined {
  if (!el || el.localName !== 'svg') return undefined;
  return MUI_ICON_MAP[el.getAttribute('data-testid') ?? ''];
}

function cleanupOrphans(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('span.tide-ms[data-tide-for]').forEach((span) => {
    try {
      if (!mappedName(span.nextElementSibling)) span.remove();
    } catch {
      /* ignore */
    }
  });
}

export function swapIcons(root: ParentNode): void {
  try {
    cleanupOrphans(root);
  } catch {
    /* ignore */
  }
  root.querySelectorAll<SVGElement>('svg[data-testid]').forEach((svg) => {
    try {
      const name = MUI_ICON_MAP[svg.getAttribute('data-testid') ?? ''];
      if (!name) {
        svg.classList.remove('tide-icon-hidden');
        return;
      }
      const prev = svg.previousElementSibling;
      if (prev && prev.matches('span.tide-ms[data-tide-for]')) {
        if (prev.textContent !== name) prev.textContent = name;
      } else {
        const keep = [...svg.classList].filter((c) => c.startsWith('MuiSvgIcon-fontSize') || c === 'MuiSvgIcon-root');
        const span = symbol(name, keep);
        span.dataset.tideFor = '1';
        svg.before(span);
      }
      svg.classList.add('tide-icon-hidden');
    } catch {
      /* ignore */
    }
  });
  root.querySelectorAll<HTMLElement>('.material-icons:not(.tide-ms)').forEach((el) => {
    try {
      const raw = (el.textContent ?? '').trim();
      const name = FONT_ICON_RENAMES[raw] ?? raw;
      if (!raw || !IN_FONT.has(name)) return;
      el.classList.remove('material-icons');
      el.classList.add('tide-ms');
      el.textContent = name;
    } catch {
      /* ignore */
    }
  });
}

/** Tide's own UI never contains stock icons: mutations inside it are skipped. */
const TIDE_ROOTS = '.tide-home, .tide-details, .tide-player, .tide-ld, .tide-tabbar';
/** Above this many changed subtrees in one frame, one document pass is cheaper than many subtree scans. */
const MAX_ROOTS = 40;

export function initIcons(cfg: ClientConfig): void {
  if (!cfg.enableIcons) return;
  swapIcons(document);
  // Only re-scan the subtrees that changed (the parent of added/removed nodes, or a re-pointed svg's parent), once
  // per frame. A full-document scan on every mutation frame is costly on big stock pages (library grids).
  let pending = new Set<Element>();
  let all = false;
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const roots = pending;
    const full = all;
    pending = new Set();
    all = false;
    if (full) { swapIcons(document); return; }
    const live = [...roots].filter((r) => r.isConnected && !r.closest(TIDE_ROOTS));
    // Skip roots inside another root: that one's scan covers them.
    for (const r of live) if (!live.some((o) => o !== r && o.contains(r))) swapIcons(r);
  };
  new MutationObserver((muts) => {
    for (const m of muts) {
      const root = m.type === 'attributes' ? (m.target as Element).parentElement : m.target as Element;
      if (root) pending.add(root);
    }
    if (pending.size > MAX_ROOTS) all = true;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(flush);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-testid'],
  });
}
