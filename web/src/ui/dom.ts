import { isSvgIcon, svgIcon } from './svgIcons';
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null> & { style?: string };

export function h(tag: string, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function icon(name: string, cls = ''): HTMLElement {
  if (isSvgIcon(name)) {
    const s = h('span', { class: `tide-ms tide-svg ${cls}`.trim(), 'aria-hidden': 'true', 'data-icon': name });
    s.append(svgIcon(name));
    return s;
  }
  return h('span', { class: `tide-ms ${cls}`.trim(), 'aria-hidden': 'true' }, name);
}

export function fmtRuntime(ticks?: number): string | null {
  if (!ticks) return null;
  const m = Math.round(ticks / 6e8);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
