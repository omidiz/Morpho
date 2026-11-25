/** Helpers shared by the CPU versions of the simulations (for browsers without WebGL2). */

import { hexToRgb } from '../logic/color';
import type { Rgb } from '../logic/shade';
import { rampStops, type Palette } from '../palettes';
import { UnsupportedError } from './types';

/** The canvas's 2D context, or UnsupportedError. */
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new UnsupportedError('Canvas 2D is not available');
  return ctx;
}

/** Background, then the palette's colors, as 0..1 RGB. */
export function paletteStops(palette: Palette): Rgb[] {
  return rampStops(palette).map(hexToRgb);
}

/** A small offscreen image the CPU paints pixel by pixel, then draws scaled up onto the canvas. */
export class Raster {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d')!;
  private image: ImageData | null = null;

  /** Pixels to paint into, sized width × height. */
  pixels(width: number, height: number): ImageData {
    if (!this.image || this.image.width !== width || this.image.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.image = this.ctx.createImageData(width, height);
    }
    return this.image;
  }

  /** Draw the painted pixels over the whole of `target`, smoothed. */
  drawTo(target: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.image) return;
    this.ctx.putImageData(this.image, 0, 0);
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'high';
    target.drawImage(this.canvas, 0, 0, width, height);
  }

  dispose(): void {
    this.image = null;
    this.canvas.width = this.canvas.height = 0;
  }
}

/** A fresh canvas of width × height for an exported image. */
export function imageCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { canvas, ctx };
}

/** Resolves on the next animation frame, so long work can let the page breathe. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Fill an exported image band by band, a frame apart, reporting progress
 * from `from` to 1. `paint(row0, row1)` writes those rows of `image`.
 */
export async function paintInBands(
  ctx: CanvasRenderingContext2D,
  image: ImageData,
  paint: (row0: number, row1: number) => void,
  onProgress: ((fraction: number) => void) | undefined,
  from: number,
): Promise<void> {
  const band = Math.max(16, Math.floor(400_000 / image.width));
  for (let row = 0; row < image.height; row += band) {
    const end = Math.min(image.height, row + band);
    paint(row, end);
    onProgress?.(from + (1 - from) * (end / image.height));
    await nextFrame();
  }
  ctx.putImageData(image, 0, 0);
}
