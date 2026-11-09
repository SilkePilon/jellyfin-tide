import { imageUrl } from '../api/client';
import type { JfItem } from '../types';

/**
 * Image URLs from an item's image tags. With a tag, Jellyfin serves the image as cacheable for a year (the URL
 * changes when the image does), so revisits paint from cache. When the item says an image does not exist we skip it
 * instead of paying a 404 round trip and a visible swap (img -> fallback) per card.
 *
 * Each helper returns a URL, `null` (known missing) or `undefined` (unknown: the item carried no image info, so try
 * the untagged URL as before).
 */
type Maybe = string | null | undefined;

export function primaryOf(item: JfItem, w: number): Maybe {
  const tag = item.ImageTags?.Primary;
  if (tag) return imageUrl(item.Id, 'Primary', w, tag);
  return item.ImageTags ? null : undefined;
}

export function backdropOf(item: JfItem, w: number): Maybe {
  const tags = item.BackdropImageTags;
  if (tags?.length) return imageUrl(item.Id, 'Backdrop/0', w, tags[0]);
  const parent = item.ParentBackdropItemId;
  if (parent && item.ParentBackdropImageTags?.length) return imageUrl(parent, 'Backdrop/0', w, item.ParentBackdropImageTags[0]);
  // Jellyfin sets ParentBackdropItemId whenever an ancestor has a backdrop (verified on 12.4), so with image info
  // present its absence means none.
  return tags ? null : undefined;
}

/** The item's logo, or (episodes, seasons) its series' logo. */
export function logoOf(item: JfItem, w: number): Maybe {
  const own = item.ImageTags?.Logo;
  if (own) return imageUrl(item.Id, 'Logo', w, own);
  if (item.ParentLogoItemId && item.ParentLogoImageTag) return imageUrl(item.ParentLogoItemId, 'Logo', w, item.ParentLogoImageTag);
  // As for backdrops: ParentLogoItemId is always set when the series has a logo.
  return item.ImageTags ? null : undefined;
}

/**
 * Ordered sources for one <img>: known images (tagged), unknown ones (untagged `fallbackId` + type), and never known
 * missing ones. `[]` means show the no-image state right away.
 */
export function sources(...c: [Maybe, string, string, number][]): string[] {
  const out: string[] = [];
  for (const [known, id, type, w] of c) {
    if (known) out.push(known);
    else if (known === undefined) out.push(imageUrl(id, type, w));
  }
  return [...new Set(out)];
}

/**
 * Point `img` at the first source; on error try the next; when all failed call `onNone`. Returns false (and never
 * calls `onNone`) when there is nothing to try: leave `img` out of the DOM.
 */
export function chain(img: HTMLImageElement, list: string[], onNone: () => void): boolean {
  let i = 0;
  if (!list.length) return false;
  img.src = list[0]!;
  img.onerror = () => {
    i++;
    if (i < list.length) img.src = list[i]!;
    else { img.onerror = null; onNone(); }
  };
  return true;
}

/**
 * Width for a full-bleed image (hero, details backdrop), so its device-pixel width, rounded up to a step (few
 * distinct URLs to cache), capped at 1920. A 1440px laptop at 1x fetched a 1920px image (~350 KB) before.
 */
export function heroWidth(css = typeof innerWidth === 'number' ? innerWidth : 1920, dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1): number {
  const px = Math.max(1, css) * Math.max(1, dpr);
  return Math.min(1920, Math.ceil(px / 320) * 320);
}

