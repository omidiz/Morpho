import { describe, expect, it } from 'vitest';
import {
  activeRows,
  addFood,
  AGENT_ROW,
  agentGrid,
  decayFromFade,
  DECAY_MAX,
  DECAY_MIN,
  DECAY_MIN_HALF_FLOAT,
  depositPerAgent,
  dropsAlong,
  EXPORT_MAX_AGENTS,
  EXPORT_MAX_CELLS,
  exportPlan,
  foodRate,
  formatAgents,
  formatDegrees,
  MAX_FOOD,
  MAX_TRAIL_CELLS,
  seedAgents,
  START_SCATTER,
  START_SPROUT,
  trailGrid,
  turnRadians,
  TURN_MAX_DEG,
  TURN_MIN_DEG,
} from './physarum';

describe('agentGrid', () => {
  it('rounds up to whole rows', () => {
    expect(agentGrid(300_000)).toEqual({ width: AGENT_ROW, rows: 293, count: 293 * AGENT_ROW });
    expect(agentGrid(AGENT_ROW)).toEqual({ width: AGENT_ROW, rows: 1, count: AGENT_ROW });
    expect(agentGrid(0).rows).toBe(1);
  });
});

describe('activeRows', () => {
  it('keeps every row at full budget and thins the crowd as the budget drops', () => {
    expect(activeRows(293, 1)).toBe(293);
    expect(activeRows(293, 0.5)).toBe(147);
  });

  it('never drops below a floor, nor goes above what exists', () => {
    expect(activeRows(293, 0)).toBe(16);
    expect(activeRows(10, 0)).toBe(10);
    expect(activeRows(293, 5)).toBe(293);
  });
});

describe('slider mappings', () => {
  it('turn speed spans its degree range', () => {
    expect(turnRadians(0)).toBeCloseTo((TURN_MIN_DEG * Math.PI) / 180);
    expect(turnRadians(1)).toBeCloseTo((TURN_MAX_DEG * Math.PI) / 180);
    expect(turnRadians(2)).toBeCloseTo(turnRadians(1));
  });

  it('trail fade runs from slow to fast, evenly on a log scale', () => {
    expect(decayFromFade(0)).toBeCloseTo(DECAY_MIN);
    expect(decayFromFade(1)).toBeCloseTo(DECAY_MAX);
    expect(decayFromFade(0.5)).toBeCloseTo(Math.sqrt(DECAY_MIN * DECAY_MAX));
    for (let f = 0; f < 1; f += 0.1) expect(decayFromFade(f + 0.1)).toBeGreaterThan(decayFromFade(f));
  });

  it('never fades slower than half floats can hold', () => {
    expect(decayFromFade(0, DECAY_MIN_HALF_FLOAT)).toBeCloseTo(DECAY_MIN_HALF_FLOAT);
    expect(decayFromFade(1, DECAY_MIN_HALF_FLOAT)).toBeCloseTo(DECAY_MAX);
  });
});

describe('depositPerAgent', () => {
  // Steady state of m ← (m + d·n/cells)·(1 − decay).
  const settle = (cells: number, agents: number, decay: number) => {
    const d = depositPerAgent(cells, agents, decay);
    let m = 0;
    for (let i = 0; i < 5000; i++) m = (m + (d * agents) / cells) * (1 - decay);
    return m;
  };

  it('keeps the average trail at 1 for any crowd, map or fade', () => {
    expect(settle(330_000, 300_000, 0.03)).toBeCloseTo(1, 3);
    expect(settle(330_000, 45_000, 0.03)).toBeCloseTo(1, 3);
    expect(settle(1_000_000, 1_000_000, 0.2)).toBeCloseTo(1, 3);
    expect(settle(3_000_000, 1_600_000, 0.006)).toBeCloseTo(1, 2);
  });

  it('food settles at its peak above the average', () => {
    const decay = 0.05;
    let m = 0;
    for (let i = 0; i < 5000; i++) m = (m + foodRate(decay, 10)) * (1 - decay);
    expect(m).toBeCloseTo(10, 3);
  });
});

describe('trailGrid', () => {
  it('uses one cell per CSS pixel on a phone', () => {
    expect(trailGrid(390, 844)).toEqual({ width: 390, height: 844, cellSize: 1 });
  });

  it('caps the cell count on large screens, keeping the shape', () => {
    const g = trailGrid(2560, 1440);
    expect(g.width * g.height).toBeLessThanOrEqual(MAX_TRAIL_CELLS * 1.01);
    expect(g.width / g.height).toBeCloseTo(2560 / 1440, 2);
    expect(g.cellSize).toBeGreaterThan(1);
  });
});

describe('seedAgents', () => {
  it('is the same for the same seed, and differs for another', () => {
    const a = seedAgents(42, START_SCATTER, 390, 844, 0, 1000);
    expect(seedAgents(42, START_SCATTER, 390, 844, 0, 1000)).toEqual(a);
    expect(seedAgents(43, START_SCATTER, 390, 844, 0, 1000)).not.toEqual(a);
  });

  it('fixes each explorer by its index, so any slice matches the whole', () => {
    const all = seedAgents(7, START_SPROUT, 390, 844, 0, 3000);
    expect(seedAgents(7, START_SPROUT, 390, 844, 1000, 3000)).toEqual(all.subarray(1000 * 4));
  });

  it('keeps positions in 0..1 and headings in 0..2π', () => {
    for (const layout of [START_SCATTER, START_SPROUT]) {
      const a = seedAgents(1, layout, 390, 844, 0, 5000);
      for (let i = 0; i < a.length; i += 4) {
        expect(a[i]).toBeGreaterThanOrEqual(0);
        expect(a[i]).toBeLessThanOrEqual(1);
        expect(a[i + 1]).toBeGreaterThanOrEqual(0);
        expect(a[i + 1]).toBeLessThanOrEqual(1);
        expect(a[i + 2]).toBeGreaterThanOrEqual(0);
        expect(a[i + 2]).toBeLessThan(Math.PI * 2 + 1e-6);
      }
    }
  });

  it('scatters evenly over the map', () => {
    const a = seedAgents(5, START_SCATTER, 390, 844, 0, 20_000);
    const quads = [0, 0, 0, 0];
    for (let i = 0; i < a.length; i += 4) quads[(a[i] < 0.5 ? 0 : 1) + (a[i + 1] < 0.5 ? 0 : 2)]++;
    for (const q of quads) expect(q).toBeGreaterThan(4500);
  });

  it('sprouts from a small round patch in the middle, heading outward', () => {
    const w = 390;
    const h = 844;
    const a = seedAgents(5, START_SPROUT, w, h, 0, 5000);
    for (let i = 0; i < a.length; i += 4) {
      const dx = (a[i] - 0.5) * w;
      const dy = (a[i + 1] - 0.5) * h;
      // Round in cells: within 6% of the short side, whatever the screen shape.
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(0.06 * w + 1e-3);
      if (Math.hypot(dx, dy) > 5) {
        const out = Math.cos(a[i + 2]) * dx + Math.sin(a[i + 2]) * dy;
        expect(out).toBeGreaterThan(0);
      }
    }
  });
});

describe('food', () => {
  it('drops the oldest beyond the limit', () => {
    let foods = addFood([], 0, 0);
    for (let i = 1; i <= MAX_FOOD; i++) foods = addFood(foods, i / 100, 0);
    expect(foods).toHaveLength(MAX_FOOD);
    expect(foods[0].x).toBeCloseTo(1 / 100);
    expect(foods.at(-1)).toEqual({ x: MAX_FOOD / 100, y: 0, age: 0 });
  });

  it('drops along a drag at even spacing, in CSS pixels', () => {
    const drops = dropsAlong({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, 400, 800, 100);
    expect(drops.map((d) => d.x)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(dropsAlong({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 400, 800, 100)).toEqual([]);
  });
});

describe('exportPlan', () => {
  it('regrows a phone screen at full phone-wallpaper resolution', () => {
    const plan = exportPlan(390, 844, { width: 390, height: 844 }, 300_032, 1170, 2532);
    expect(plan.refine).toBeCloseTo(3, 5);
    expect(plan.width).toBe(1170);
    expect(plan.height).toBe(2532);
    expect(plan.origin[0]).toBeCloseTo(0);
    expect(plan.origin[1]).toBeCloseTo(0);
    expect(plan.span[0]).toBeCloseTo(1);
    expect(plan.span[1]).toBeCloseTo(1);
    // 9× the crowd would be 2.7 million: capped.
    expect(plan.agents.count).toBeLessThanOrEqual(EXPORT_MAX_AGENTS);
    expect(plan.agents.count).toBeGreaterThan(EXPORT_MAX_AGENTS - AGENT_ROW);
  });

  it('crops a centered square out of a tall screen, keeping the crowd as dense', () => {
    const plan = exportPlan(390, 844, { width: 390, height: 844 }, 100_000, 1024, 1024);
    expect(plan.span[0]).toBeCloseTo(1);
    expect(plan.span[1]).toBeCloseTo(390 / 844);
    expect(plan.origin[1]).toBeCloseTo((1 - 390 / 844) / 2);
    const refine = 1024 / 390;
    const expected = 100_000 * (390 / 844) * refine * refine;
    expect(plan.agents.count).toBeGreaterThanOrEqual(expected);
    expect(plan.agents.count).toBeLessThan(expected + AGENT_ROW);
  });

  it('stays within the cell cap on huge images', () => {
    const plan = exportPlan(1280, 720, trailGrid(1280, 720), 300_000, 5120, 2880);
    expect(plan.width * plan.height).toBeLessThanOrEqual(EXPORT_MAX_CELLS * 1.01);
  });
});

describe('readouts', () => {
  it('formats crowd sizes and angles quietly', () => {
    expect(formatAgents(300)).toBe('300k');
    expect(formatAgents(1000)).toBe('1 million');
    expect(formatDegrees(22.5)).toBe('22.5°');
    expect(formatDegrees(45)).toBe('45°');
  });
});
