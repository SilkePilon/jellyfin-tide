import { FONT_ICON_RENAMES, MUI_ICON_MAP } from './map';
import type { ClientConfig } from '../types';

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
      if (!raw) return;
      el.classList.remove('material-icons');
      el.classList.add('tide-ms');
      el.textContent = FONT_ICON_RENAMES[raw] ?? raw;
    } catch {
      /* ignore */
    }
  });
}

export function initIcons(cfg: ClientConfig): void {
  if (!cfg.enableIcons) return;
  swapIcons(document);
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      swapIcons(document);
    });
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-testid'],
  });
}
