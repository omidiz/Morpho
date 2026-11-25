import { describe, expect, it } from 'vitest';
import {
  bandEdgeKill,
  EXPORT_MAX_CELLS,
  EXPORT_MAX_STEPS,
  EXPORT_SETTLE_TIME,
  exportGrid,
  FEED_MAX,
  FEED_MIN,
  fromFeedKill,
  gridSize,
  MAX_CELLS,
  seedField,
  stepsPerFrame,
  toFeedKill,
} from './grayScott';
import { mulberry32 } from './rng';

describe('feed/kill mapping', () => {
  it('round-trips through the friendly sliders', () => {
    for (const [feed, kill] of [
      [0.0367, 0.0649],
      [0.029, 0.057],
      [0.0545, 0.062],
    ]) {
      const { food, fade } = fromFeedKill(feed, kill);
      expect(food).toBeGreaterThanOrEqual(0);
      expect(food).toBeLessThanOrEqual(1);
      expect(fade).toBeGreaterThanOrEqual(0);
      expect(fade).toBeLessThanOrEqual(1);
      const back = toFeedKill(food, fade);
      expect(back.feed).toBeCloseTo(feed, 10);
      expect(back.kill).toBeCloseTo(kill, 10);
    }
  });

  it('covers the feed range and follows the band', () => {
    expect(toFeedKill(0, 0.5).feed).toBeCloseTo(FEED_MIN);
    expect(toFeedKill(1, 0.5).feed).toBeCloseTo(FEED_MAX);
    // More fade = more kill, at any food level.
    expect(toFeedKill(0.3, 0.8).kill).toBeGreaterThan(toFeedKill(0.3, 0.2).kill);
    // Clamped outside 0..1.
    expect(toFeedKill(2, 2)).toEqual(toFeedKill(1, 1));
  });

  it('band edge is the known saddle-node curve', () => {
    expect(bandEdgeKill(0.04)).toBeCloseTo(0.1 - 0.04);
  });
});

describe('stepsPerFrame', () => {
  it('grows with speed and never drops below 1', () => {
    expect(stepsPerFrame(10)).toBeGreaterThan(stepsPerFrame(1));
    expect(stepsPerFrame(0)).toBeGreaterThanOrEqual(1);
  });
});

describe('gridSize', () => {
  it('divides the viewport by the cell size', () => {
    expect(gridSize(400, 800, 2)).toEqual({ width: 200, height: 400, cellSize: 2 });
  });

  it('caps the number of cells on huge screens', () => {
    const g = gridSize(5120, 2880, 1);
    expect(g.width * g.height).toBeLessThanOrEqual(MAX_CELLS * 1.01);
    expect(g.cellSize).toBeGreaterThan(1);
    expect(g.width / g.height).toBeCloseTo(5120 / 2880, 2);
  });
});

describe('seedField', () => {
  it('is deterministic for a seed and plants some blobs', () => {
    const a = seedField(64, 48, mulberry32(9));
    const b = seedField(64, 48, mulberry32(9));
    expect(a).toEqual(b);
    expect(a).toHaveLength(64 * 48 * 2);
    let seeded = 0;
    for (let i = 1; i < a.length; i += 2) if (a[i] > 0) seeded++;
    expect(seeded).toBeGreaterThan(0);
    expect(seeded).toBeLessThan(64 * 48 / 2);
  });

  it('differs between seeds', () => {
    expect(seedField(64, 48, mulberry32(1))).not.toEqual(seedField(64, 48, mulberry32(2)));
  });

  it('keeps values in range', () => {
    for (const x of seedField(50, 50, mulberry32(4))) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
});

describe('exportGrid', () => {
  it('regrows a phone screen on a finer grid for a phone wallpaper', () => {
    // 390×844 CSS view with 2-CSS-px cells → 195×422 grid.
    const g = exportGrid(390, 844, { width: 195, height: 422 }, 1170, 2532);
    // Screen cells are 6 image px; export cells are 1.5 image px.
    expect(g.refine).toBeCloseTo(4);
    expect(g.width).toBe(780);
    expect(g.height).toBe(1688);
    expect(g.reaction).toBeCloseTo(1 / 16);
    expect(g.steps).toBe(Math.round(EXPORT_SETTLE_TIME * 16));
    // The export covers the whole screen grid exactly.
    expect(g.origin[0]).toBeCloseTo(0);
    expect(g.origin[1]).toBeCloseTo(0);
    expect(g.stride[0] * g.width).toBeCloseTo(195);
    expect(g.stride[1] * g.height).toBeCloseTo(422);
  });

  it('crops to the middle when shapes differ', () => {
    const g = exportGrid(400, 800, { width: 200, height: 400 }, 2560, 1440);
    expect(g.stride[0] * g.width).toBeCloseTo(200); // full width
    const visible = g.stride[1] * g.height;
    expect(visible).toBeCloseTo(112.5); // a 16:9 band
    expect(g.origin[1]).toBeCloseTo((400 - visible) / 2);
  });

  it('stays within the cell and step caps', () => {
    for (const [w, h] of [[2560, 1440], [1170, 2532], [2048, 2048], [8000, 8000]]) {
      const g = exportGrid(320, 320, { width: 64, height: 64 }, w, h);
      expect(g.width * g.height).toBeLessThanOrEqual(EXPORT_MAX_CELLS * 1.01);
      expect(g.steps).toBeLessThanOrEqual(EXPORT_MAX_STEPS);
      expect(g.reaction).toBeLessThanOrEqual(1);
    }
  });

  it('is never coarser than the screen', () => {
    // Huge screen cells (cell cap kicked in) vs. a small image.
    const g = exportGrid(4000, 4000, { width: 1000, height: 1000 }, 1000, 1000);
    expect(g.width).toBe(1000);
    expect(g.refine).toBeCloseTo(1);
    expect(g.reaction).toBe(1);
  });
});
