import { describe, expect, it } from 'vitest';
import {
  angleFromTurn,
  armOrder,
  formatAngle,
  GOLDEN_ANGLE,
  layoutHead,
  spiralCount,
  turnFromAngle,
} from './phyllotaxis';

const GOLDEN_TURN = GOLDEN_ANGLE / 360;

describe('angle slider', () => {
  it('has the golden angle in the middle', () => {
    expect(GOLDEN_ANGLE).toBeCloseTo(137.50776, 5);
    expect(angleFromTurn(0)).toBe(GOLDEN_ANGLE);
  });

  it('is finest near the middle and reaches two, three and five arms toward the ends', () => {
    const near = angleFromTurn(0.01) - angleFromTurn(0);
    const far = angleFromTurn(1) - angleFromTurn(0.99);
    expect(near).toBeLessThan(0.05);
    expect(far).toBeGreaterThan(10 * near);
    expect(angleFromTurn(-1)).toBeLessThan(95);
    expect(angleFromTurn(1)).toBeGreaterThan(180.5);
  });

  it('only ever increases, and turnFromAngle undoes it', () => {
    let prev = -Infinity;
    for (let t = -1; t <= 1.0001; t += 0.01) {
      const a = angleFromTurn(t);
      expect(a).toBeGreaterThan(prev);
      prev = a;
      expect(turnFromAngle(a)).toBeCloseTo(Math.min(1, t), 9);
    }
    expect(turnFromAngle(0)).toBe(-1);
    expect(turnFromAngle(360)).toBe(1);
  });

  it('reads out degrees, quietly naming the golden angle', () => {
    expect(formatAngle(GOLDEN_ANGLE)).toBe('137.51° golden');
    expect(formatAngle(137.509)).toBe('137.51° golden');
    expect(formatAngle(137.3)).toBe('137.30°');
    expect(formatAngle(180)).toBe('180.00°');
  });
});

describe('spiralCount', () => {
  it('finds Fibonacci spirals that grow with a golden head', () => {
    const fib = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
    let prev = 0;
    for (const n of [20, 50, 100, 300, 700, 1500, 3000]) {
      const q = spiralCount(GOLDEN_TURN, n);
      expect(fib, `n = ${n}`).toContain(q);
      expect(q).toBeGreaterThanOrEqual(prev);
      prev = q;
    }
    expect(spiralCount(GOLDEN_TURN, 700)).toBe(55);
  });

  it('finds the arms of angles near simple fractions of a turn', () => {
    expect(spiralCount(180.3 / 360, 600)).toBe(2);
    expect(spiralCount(120.3 / 360, 600)).toBe(3);
    expect(spiralCount(144.3 / 360, 600)).toBe(5);
    expect(spiralCount(135 / 360, 600)).toBe(8);
  });
});

describe('armOrder', () => {
  it('numbers the arms around the circle, each once', () => {
    const q = 21;
    const order = armOrder(GOLDEN_TURN, q);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: q }, (_, i) => i));
    // Arms numbered next to each other start next to each other.
    const start = (i: number) => (i * GOLDEN_TURN) % 1;
    const byPlace = Array.from({ length: q }, (_, i) => i).sort((a, b) => order[a] - order[b]);
    for (let k = 1; k < q; k++) expect(start(byPlace[k])).toBeGreaterThan(start(byPlace[k - 1]));
  });
});

describe('layoutHead', () => {
  const settings = { count: 800, angle: GOLDEN_ANGLE, size: 1, growth: 0 };

  it('fits every seed, edges included, in the unit circle', () => {
    for (const growth of [0, 0.5, 1]) {
      const head = layoutHead({ ...settings, growth }, (i, s) => Math.sin(i * 12.9898 + s * 78.233));
      let outer = 0;
      for (let i = 0; i < head.count; i++) outer = Math.max(outer, Math.hypot(head.x[i], head.y[i]) + head.radius[i]);
      expect(outer).toBeCloseTo(1, 6);
    }
  });

  it('gives every seed the same size without growth, and larger ones outward with it', () => {
    const even = layoutHead(settings);
    expect(even.radius[10] / even.radius[790]).toBeCloseTo(1, 1);
    const grown = layoutHead({ ...settings, growth: 1 });
    expect(grown.radius[790]).toBeGreaterThan(3 * grown.radius[10]);
    for (let i = 1; i < grown.count; i++) expect(grown.distance[i]).toBeGreaterThan(grown.distance[i - 1]);
  });

  it('packs seeds so neighbours just touch at size 1', () => {
    for (const growth of [0, 0.6]) {
      const head = layoutHead({ ...settings, count: 1500, growth });
      // Nearest neighbour of a seed two thirds of the way out.
      const i = 1000;
      let nearest = Infinity;
      for (let j = 0; j < head.count; j++) {
        if (j !== i) nearest = Math.min(nearest, Math.hypot(head.x[j] - head.x[i], head.y[j] - head.y[i]));
      }
      const gap = nearest / (2 * head.radius[i]);
      expect(gap).toBeGreaterThan(0.8);
      expect(gap).toBeLessThan(1.25);
    }
  });

  it('puts every seed on one of the arms, consecutive seeds on different ones', () => {
    const head = layoutHead(settings);
    expect(head.arms).toBe(55);
    for (let i = 0; i < head.count; i++) expect(head.arm[i]).toBe(head.arm[i % head.arms]);
    expect(head.arm[0]).not.toBe(head.arm[1]);
  });

  it('is the same every time for the same jitter', () => {
    const jitter = (i: number, s: number) => ((i * 7 + s * 13) % 10) / 10 - 0.5;
    const a = layoutHead(settings, jitter);
    const b = layoutHead(settings, jitter);
    expect(a.x).toEqual(b.x);
    expect(a.radius).toEqual(b.radius);
  });
});
