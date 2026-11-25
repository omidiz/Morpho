/** Wallpaper sizes offered by "Save wallpaper", in pixels. */
export interface WallpaperSize {
  id: string;
  name: string;
  width: number;
  height: number;
}

export const WALLPAPER_SIZES: readonly WallpaperSize[] = [
  { id: 'phone', name: 'Phone', width: 1170, height: 2532 },
  { id: 'desktop', name: 'Desktop', width: 2560, height: 1440 },
  { id: 'square', name: 'Square', width: 2048, height: 2048 },
];

/** "morpho-turing-abc123.png". Both parts come from validated URL state, but stay safe anyway. */
export function exportFileName(patternId: string, seed: string): string {
  const clean = (s: string) => s.replace(/[^a-z0-9-]+/gi, '').slice(0, 32) || 'x';
  return `morpho-${clean(patternId)}-${clean(seed)}.png`;
}

/**
 * How a view of viewWidth × viewHeight maps onto an image of outWidth ×
 * outHeight: scaled to cover it, centered, with the overflow cropped. This is
 * the same rule as CSS `object-fit: cover`, so the wallpaper shows what is
 * on screen, trimmed to the wallpaper's shape.
 */
export interface CoverFit {
  /** Output pixels per view unit. */
  scale: number;
  /** The part of the view that ends up in the image, in view units. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export function coverFit(
  viewWidth: number,
  viewHeight: number,
  outWidth: number,
  outHeight: number,
): CoverFit {
  const scale = Math.max(outWidth / viewWidth, outHeight / viewHeight);
  const width = outWidth / scale;
  const height = outHeight / scale;
  return { scale, x: (viewWidth - width) / 2, y: (viewHeight - height) / 2, width, height };
}
