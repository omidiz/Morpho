import type { Rng } from './rng';

/**
 * Gray-Scott on the CPU, for browsers without WebGL2. The same rules as the
 * GPU shaders in src/patterns/turing/shaders.ts, on the same data: (A, B)
 * pairs, row by row from the bottom, wrapping around at the edges.
 */

/**
 * One step from `src` into `dst`: 3×3 Laplacian, diffusion 1.0 (A) and 0.5
 * (B), reaction terms scaled by `reaction` (see exportGrid).
 */
export function stepGrayScott(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  feed: number,
  kill: number,
  reaction = 1,
): void {
  const fk = feed + kill;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const up = (y === height - 1 ? 0 : y + 1) * width;
    const down = (y === 0 ? height - 1 : y - 1) * width;
    for (let x = 0; x < width; x++) {
      const l = x === 0 ? width - 1 : x - 1;
      const r = x === width - 1 ? 0 : x + 1;
      const i = (row + x) * 2;
      const a = src[i];
      const b = src[i + 1];
      const iL = (row + l) * 2;
      const iR = (row + r) * 2;
      const iU = (up + x) * 2;
      const iD = (down + x) * 2;
      const iUL = (up + l) * 2;
      const iUR = (up + r) * 2;
      const iDL = (down + l) * 2;
      const iDR = (down + r) * 2;
      const lapA =
        -a + 0.2 * (src[iL] + src[iR] + src[iU] + src[iD]) + 0.05 * (src[iUL] + src[iUR] + src[iDL] + src[iDR]);
      const lapB =
        -b +
        0.2 * (src[iL + 1] + src[iR + 1] + src[iU + 1] + src[iD + 1]) +
        0.05 * (src[iUL + 1] + src[iUR + 1] + src[iDL + 1] + src[iDR + 1]);
      const abb = a * b * b;
      const na = a + lapA + reaction * (feed * (1 - a) - abb);
      const nb = b + 0.5 * lapB + reaction * (abb - fk * b);
      dst[i] = na < 0 ? 0 : na > 1 ? 1 : na;
      dst[i + 1] = nb < 0 ? 0 : nb > 1 ? 1 : nb;
    }
  }
}

/**
 * Plant B along the segment (ax, ay)–(bx, by), in cells with y up, with a
 * soft edge out to `radius` cells. Like the GPU brush, it stops at the edges.
 */
export function paintSegment(
  field: Float32Array,
  width: number,
  height: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
  rng: Rng,
): void {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = Math.max(abx * abx + aby * aby, 1e-6);
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + radius));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - radius));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by) + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax;
      const py = y + 0.5 - ay;
      const t = Math.min(1, Math.max(0, (px * abx + py * aby) / len2));
      const d = Math.hypot(px - abx * t, py - aby * t);
      const m = 1 - smoothstep(radius * 0.55, radius, d);
      if (m <= 0) continue;
      const n = (rng() - 0.5) * 0.04;
      const i = (y * width + x) * 2;
      field[i] += (0.5 + n - field[i]) * m;
      field[i + 1] += (0.25 + n - field[i + 1]) * m;
    }
  }
}

/**
 * Smoothly resample a field of `channels` floats per cell (rows from the
 * bottom, wrapping) onto a dw × dh grid. Destination cell (i, j) reads the
 * source at origin + (i + ½, j + ½) · stride, in source cells, as the GPU
 * resample shaders do.
 */
export function resampleField(
  src: Float32Array,
  sw: number,
  sh: number,
  channels: number,
  dw: number,
  dh: number,
  origin: readonly [number, number] = [0, 0],
  stride: readonly [number, number] = [sw / dw, sh / dh],
): Float32Array {
  const out = new Float32Array(dw * dh * channels);
  for (let j = 0; j < dh; j++) {
    const py = origin[1] + (j + 0.5) * stride[1] - 0.5;
    const fy = py - Math.floor(py);
    const y0 = wrap(Math.floor(py), sh) * sw;
    const y1 = wrap(Math.floor(py) + 1, sh) * sw;
    for (let i = 0; i < dw; i++) {
      const px = origin[0] + (i + 0.5) * stride[0] - 0.5;
      const fx = px - Math.floor(px);
      const x0 = wrap(Math.floor(px), sw);
      const x1 = wrap(Math.floor(px) + 1, sw);
      const o = (j * dw + i) * channels;
      for (let c = 0; c < channels; c++) {
        const a = src[(y0 + x0) * channels + c];
        const b = src[(y0 + x1) * channels + c];
        const d = src[(y1 + x0) * channels + c];
        const e = src[(y1 + x1) * channels + c];
        out[o + c] = (a + (b - a) * fx) * (1 - fy) + (d + (e - d) * fx) * fy;
      }
    }
  }
  return out;
}

export function wrap(i: number, n: number): number {
  return ((i % n) + n) % n;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
