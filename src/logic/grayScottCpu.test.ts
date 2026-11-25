import { describe, expect, it } from 'vitest';
import { exportGrid, gridSize, seedField, toFeedKill } from './grayScott';
import { paintSegment, resampleField, stepGrayScott } from './grayScottCpu';
import { mulberry32 } from './rng';

const { feed, kill } = toFeedKill(0.6, 0.5);

describe('stepGrayScott', () => {
  it('leaves the plain mixture alone', () => {
    const w = 16;
    const h = 12;
    const src = seedField(w, h, () => 0.99).fill(0);
    for (let i = 0; i < src.length; i += 2) src[i] = 1;
    const dst = new Float32Array(src.length);
    stepGrayScott(src, dst, w, h, feed, kill);
    expect([...dst]).toEqual([...src]);
  });

  it('wraps around the edges: a blob on a corner grows on all four corners', () => {
    const w = 20;
    const h = 20;
    let a: Float32Array = new Float32Array(w * h * 2);
    for (let i = 0; i < a.length; i += 2) a[i] = 1;
    a[1] = 0.5; // B at cell (0, 0)
    let b: Float32Array = new Float32Array(a.length);
    stepGrayScott(a, b, w, h, feed, kill);
    [a, b] = [b, a];
    const B = (x: number, y: number) => a[(y * w + x) * 2 + 1];
    expect(B(w - 1, 0)).toBeGreaterThan(0);
    expect(B(0, h - 1)).toBeGreaterThan(0);
    expect(B(w - 1, h - 1)).toBeGreaterThan(0);
    expect(B(w - 1, 0)).toBeCloseTo(B(1, 0), 6);
  });

  it('keeps values in 0..1 and grows a pattern from the seeds', () => {
    const w = 64;
    const h = 64;
    let a: Float32Array = seedField(w, h, mulberry32(7));
    let b: Float32Array = new Float32Array(a.length);
    for (let i = 0; i < 400; i++) {
      stepGrayScott(a, b, w, h, feed, kill);
      [a, b] = [b, a];
    }
    let min = Infinity;
    let max = -Infinity;
    let withB = 0;
    for (let i = 0; i < a.length; i++) {
      min = Math.min(min, a[i]);
      max = Math.max(max, a[i]);
      if (i % 2 === 1 && a[i] > 0.2) withB++;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
    expect(withB).toBeGreaterThan(100);
  });
});

describe('paintSegment', () => {
  it('plants B along the stroke and nowhere far from it', () => {
    const w = 40;
    const h = 20;
    const f = new Float32Array(w * h * 2);
    for (let i = 0; i < f.length; i += 2) f[i] = 1;
    paintSegment(f, w, h, 5, 10, 35, 10, 3, mulberry32(1));
    const B = (x: number, y: number) => f[(y * w + x) * 2 + 1];
    expect(B(20, 10)).toBeGreaterThan(0.2);
    expect(B(5, 10)).toBeGreaterThan(0.2);
    expect(B(20, 2)).toBe(0);
    expect(B(39, 10)).toBe(0);
  });
});

describe('resampleField', () => {
  it('keeps a smooth field as it is, at any size', () => {
    const sw = 32;
    const sh = 16;
    const src = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) src[y * sw + x] = 0.5 + 0.4 * Math.sin((2 * Math.PI * x) / sw);
    const out = resampleField(src, sw, sh, 1, 64, 8);
    for (let x = 0; x < 64; x++) {
      expect(out[3 * 64 + x]).toBeCloseTo(0.5 + 0.4 * Math.sin((2 * Math.PI * (x + 0.5)) / 64 - Math.PI / sw), 1);
    }
  });

  it('copies a grid exactly onto one the same size', () => {
    const src = seedField(12, 9, mulberry32(3));
    expect([...resampleField(src, 12, 9, 2, 12, 9)]).toEqual([...src]);
  });

  it('takes the export window the plan asks for', () => {
    const screen = gridSize(400, 800, 2, 40_000);
    const plan = exportGrid(400, 800, screen, 1170, 2532, 300_000);
    expect(plan.width * plan.height).toBeLessThanOrEqual(300_000 * 1.01);
    const src = seedField(screen.width, screen.height, mulberry32(5));
    const out = resampleField(src, screen.width, screen.height, 2, plan.width, plan.height, plan.origin, plan.stride);
    expect(out.length).toBe(plan.width * plan.height * 2);
    expect(out.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});
