export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
}

export interface TrickplayInfo { Width: number; Height: number; TileWidth: number; TileHeight: number; ThumbnailCount: number; Interval: number }

/** Which trickplay sheet and which tile (pixel offset inside the sheet) shows second `t`. */
export function trickplayFrame(t: number, info: TrickplayInfo): { image: number; x: number; y: number } {
  const per = info.TileWidth * info.TileHeight;
  const tile = Math.max(0, Math.min(info.ThumbnailCount - 1, Math.floor((t * 1000) / info.Interval)));
  const inSheet = tile % per;
  return { image: Math.floor(tile / per), x: (inSheet % info.TileWidth) * info.Width, y: Math.floor(inSheet / info.TileWidth) * info.Height };
}
