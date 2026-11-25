import { describe, expect, it } from 'vitest';
import { forestSize, plantSlots } from './forest';

describe('plantSlots', () => {
  it('is a single centered plant when not a forest', () => {
    const [one, ...rest] = plantSlots(42, 1.5, false);
    expect(rest).toHaveLength(0);
    expect(one.x).toBe(0.5);
    expect(one.depth).toBe(1);
  });

  it('puts more plants in wider frames', () => {
    expect(plantSlots(1, 0.46, true)).toHaveLength(forestSize(0.46));
    expect(forestSize(0.46)).toBeLessThan(forestSize(16 / 9));
    expect(forestSize(0.1)).toBeGreaterThanOrEqual(3);
    expect(forestSize(10)).toBeLessThanOrEqual(8);
  });

  it('is reproducible and depends on the seed', () => {
    expect(plantSlots(7, 1.6, true)).toEqual(plantSlots(7, 1.6, true));
    expect(plantSlots(7, 1.6, true)).not.toEqual(plantSlots(8, 1.6, true));
  });

  it('lists plants back to front, with one hero at the very front', () => {
    for (let seed = 0; seed < 50; seed++) {
      const slots = plantSlots(seed, 1.6, true);
      for (let i = 1; i < slots.length; i++) expect(slots[i].depth).toBeGreaterThanOrEqual(slots[i - 1].depth);
      expect(slots.filter((s) => s.depth === 1)).toHaveLength(1);
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(1);
        expect(s.height).toBeLessThanOrEqual(0.8);
        expect(s.ground).toBeLessThanOrEqual(1);
      }
      // Far plants are smaller and stand higher up the ground.
      const [far] = slots;
      const near = slots.at(-1)!;
      expect(far.height).toBeLessThanOrEqual(near.height);
      expect(far.ground).toBeLessThanOrEqual(near.ground);
      // The hero is never cut off by the edge.
      expect(near.x - near.width / 2).toBeGreaterThanOrEqual(0);
      expect(near.x + near.width / 2).toBeLessThanOrEqual(1);
    }
  });

  it('keeps each plant its own seed and depth when the frame changes shape', () => {
    const wide = plantSlots(5, 2, true);
    const tall = plantSlots(5, 0.5, true);
    for (const t of tall) {
      const w = wide.find((s) => s.index === t.index)!;
      expect(w.seed).toBe(t.seed);
      if (t.depth !== 1 && w.depth !== 1) expect(w.depth).toBe(t.depth);
    }
  });
});
