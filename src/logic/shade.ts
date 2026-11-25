/**
 * Coloring simulation fields on the CPU, for browsers without WebGL2. These
 * follow the GPU display shaders (ramp, emboss, tone curve, dither) closely
 * enough that the fallback looks like the same pattern.
 */

/** A color with channels 0..1. */
export type Rgb = readonly [number, number, number];

/**
 * The shaders' palette ramp() as a table of `size` colors (r, g, b, 0..1):
 * entry k is ramp(k / (size − 1)). stops[0] is the background.
 */
export function rampTable(stops: readonly Rgb[], size = 512): Float32Array {
  const out = new Float32Array(size * 3);
  const n = stops.length;
  for (let k = 0; k < size; k++) {
    const x = (k / (size - 1)) * (n - 1);
    let [r, g, b] = stops[0];
    for (let i = 1; i < n; i++) {
      const t = Math.min(1, Math.max(0, x - (i - 1)));
      r += (stops[i][0] - r) * t;
      g += (stops[i][1] - g) * t;
      b += (stops[i][2] - b) * t;
    }
    out.set([r, g, b], k * 3);
  }
  return out;
}

/** Where to write: rows [row0, row1) of a width × height RGBA image. */
export interface ImageRows {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  row0: number;
  row1: number;
}

/**
 * Turing display: B (the second of each pair in `field`, rows from the
 * bottom) smoothed up to the image, through the palette, with a soft emboss
 * lit from the top left. The field covers the whole image.
 */
export function shadeTuring(
  field: Float32Array,
  gw: number,
  gh: number,
  out: ImageRows,
  ramp: Float32Array,
  emboss: number,
): void {
  const { data, width, height } = out;
  const last = ramp.length / 3 - 1;
  const cols = columns(gw, width);
  for (let r = out.row0; r < out.row1; r++) {
    // Images run top-down, fields bottom-up.
    const py = ((height - r - 0.5) / height) * gh - 0.5;
    const fy = py - Math.floor(py);
    const y0 = wrapIndex(Math.floor(py), gh) * gw;
    const y1 = wrapIndex(Math.floor(py) + 1, gh) * gw;
    let o = r * width * 4;
    for (let c = 0; c < width; c++, o += 4) {
      const x0 = cols.x0[c];
      const x1 = cols.x1[c];
      const fx = cols.f[c];
      const a = field[(y0 + x0) * 2 + 1];
      const b = field[(y0 + x1) * 2 + 1];
      const cc = field[(y1 + x0) * 2 + 1];
      const d = field[(y1 + x1) * 2 + 1];
      const lo = a + (b - a) * fx;
      const hi = cc + (d - cc) * fx;
      const v = lo + (hi - lo) * fy;
      const gx = b - a + (d - cc - (b - a)) * fy;
      const gy = cc - a + (d - b - (cc - a)) * fx;
      let t = (v - 0.1) / 0.2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const x = t * t * (3 - 2 * t);
      let light = (gy - gx) * 0.7071 * emboss;
      light = (light < -0.12 ? -0.12 : light > 0.12 ? 0.12 : light) * (0.4 + 0.6 * x) * 255;
      const k = Math.round(x * last) * 3;
      const n = dither(c, r);
      data[o] = ramp[k] * 255 + light + n;
      data[o + 1] = ramp[k + 1] * 255 + light + n;
      data[o + 2] = ramp[k + 2] * 255 + light + n;
      data[o + 3] = 255;
    }
  }
}

/** Trail values past this come out as the top color (1 − e^(−7) ≈ 1). */
const TONE_SPAN = 7;

/**
 * Colors for slime trail values, whatever the exposure: entry k is
 * ramp(1 − exp(−s)) for s = k / (size − 1) · TONE_SPAN, where s is the trail
 * value times the exposure (see shadeTrail).
 */
export function toneTable(stops: readonly Rgb[], size = 1024): Float32Array {
  const ramp = rampTable(stops, size);
  const out = new Float32Array(size * 3);
  for (let k = 0; k < size; k++) {
    const x = 1 - Math.exp(-(k / (size - 1)) * TONE_SPAN);
    const j = Math.round(x * (size - 1)) * 3;
    out.set(ramp.subarray(j, j + 3), k * 3);
  }
  return out;
}

/**
 * Slime display: the trail (one float per cell, rows from the bottom)
 * smoothed up to the image and colored through `tone` (from toneTable).
 */
export function shadeTrail(
  trail: Float32Array,
  gw: number,
  gh: number,
  out: ImageRows,
  tone: Float32Array,
  exposure: number,
): void {
  const { data, width, height } = out;
  const last = tone.length / 3 - 1;
  const scale = (last * exposure) / TONE_SPAN;
  const cols = columns(gw, width);
  for (let r = out.row0; r < out.row1; r++) {
    const py = ((height - r - 0.5) / height) * gh - 0.5;
    const fy = py - Math.floor(py);
    const y0 = wrapIndex(Math.floor(py), gh) * gw;
    const y1 = wrapIndex(Math.floor(py) + 1, gh) * gw;
    let o = r * width * 4;
    for (let c = 0; c < width; c++, o += 4) {
      const x0 = cols.x0[c];
      const x1 = cols.x1[c];
      const fx = cols.f[c];
      const lo = trail[y0 + x0] + (trail[y0 + x1] - trail[y0 + x0]) * fx;
      const hi = trail[y1 + x0] + (trail[y1 + x1] - trail[y1 + x0]) * fx;
      const v = lo + (hi - lo) * fy;
      const k = v <= 0 ? 0 : Math.min(last, Math.round(v * scale)) * 3;
      const n = dither(c, r);
      data[o] = tone[k] * 255 + n;
      data[o + 1] = tone[k + 1] * 255 + n;
      data[o + 2] = tone[k + 2] * 255 + n;
      data[o + 3] = 255;
    }
  }
}

/** For each image column, the two field columns it lies between and how far along. */
function columns(gw: number, width: number) {
  const x0 = new Int32Array(width);
  const x1 = new Int32Array(width);
  const f = new Float32Array(width);
  for (let c = 0; c < width; c++) {
    const px = ((c + 0.5) / width) * gw - 0.5;
    const fl = Math.floor(px);
    x0[c] = wrapIndex(fl, gw);
    x1[c] = wrapIndex(fl + 1, gw);
    f[c] = px - fl;
  }
  return { x0, x1, f };
}

function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/** ±½ of an 8-bit step, fixed per pixel, against banding. */
function dither(x: number, y: number): number {
  const h = Math.imul(x ^ Math.imul(y, 0x27d4eb2d), 0x9e3779b1);
  return ((h ^ (h >>> 15)) & 255) / 255 - 0.5;
}
