/** Icons that must look identical everywhere (Jellyfin Desktop ignores the font's FILL axis): inline SVG. */
export const SVG_ICONS = {
  favorite: 'M12 20.6l-1.3-1.2C5.9 15 3 12.4 3 9.1 3 6.5 5 4.5 7.6 4.5c1.5 0 2.9.7 3.8 1.8l.6.7.6-.7c.9-1.1 2.3-1.8 3.8-1.8 2.6 0 4.6 2 4.6 4.6 0 3.3-2.9 5.9-7.7 10.3L12 20.6z',
  play_arrow: 'M8 6.2v11.6c0 .8.9 1.3 1.6.9l9.1-5.8c.6-.4.6-1.3 0-1.7L9.6 5.3C8.9 4.9 8 5.4 8 6.2z',
  check: 'M9.5 16.2l-3.6-3.6a1.1 1.1 0 0 0-1.6 1.6l4.4 4.4c.4.4 1.1.4 1.6 0l9.4-9.4a1.1 1.1 0 0 0-1.6-1.6l-8.6 8.6z',
  star: 'M12 17.3l5.2 3.1c.6.4 1.4-.2 1.2-.9l-1.4-5.9 4.6-4c.5-.5.3-1.4-.4-1.4l-6.1-.5-2.4-5.6c-.3-.7-1.2-.7-1.5 0L8.8 7.7l-6.1.5c-.7.1-1 .9-.4 1.4l4.6 4-1.4 5.9c-.2.7.6 1.3 1.2.9l5.3-3.1z',
  info: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm1 14.5a1 1 0 0 1-2 0v-5a1 1 0 0 1 2 0v5zM12 9.2a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z',
} as const;

export type SvgIconName = keyof typeof SVG_ICONS;
const NS = 'http://www.w3.org/2000/svg';

export function isSvgIcon(name: string): name is SvgIconName {
  return Object.prototype.hasOwnProperty.call(SVG_ICONS, name);
}

export function svgIcon(name: SvgIconName): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', SVG_ICONS[name]);
  svg.append(p);
  return svg;
}
