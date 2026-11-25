import { describe, expect, it } from 'vitest';
import { grow, turtle } from './lsystem';
import { generationFor, MAX_SEGMENTS, MAX_STEPS, SPECIES } from './plantSpecies';

describe('plant species', () => {
  it('are the five named plants', () => {
    expect(SPECIES.map((s) => s.name)).toEqual(['Fern', 'Tree', 'Bush', 'Seaweed', 'Lightning tree']);
  });

  it('map growth steps to generations, one per step', () => {
    for (const s of SPECIES) {
      expect(generationFor(s, 1)).toBe(s.firstGeneration);
      expect(generationFor(s, MAX_STEPS)).toBe(s.firstGeneration + MAX_STEPS - 1);
      expect(generationFor(s, 99)).toBe(generationFor(s, MAX_STEPS));
      expect(generationFor(s, 0)).toBe(generationFor(s, 1));
    }
  });

  // The budget is a safety net; every step should still be a real step.
  it.each(SPECIES.map((s) => [s.name, s] as const))('%s reaches every growth step within budget', (_, species) => {
    for (const seed of [1, 2, 3, 1234, 987654]) {
      const words = grow(species.system, generationFor(species, MAX_STEPS), seed, MAX_SEGMENTS);
      expect(words.length - 1).toBe(generationFor(species, MAX_STEPS));
      const opts = { angle: 0.4, length: 1, randomness: 0.5 };
      const counts = words.map((w) => turtle(w, opts).count);
      expect(counts.at(-1)).toBeLessThanOrEqual(MAX_SEGMENTS);
      // Something to see from the first step, and more at each one after.
      expect(counts[species.firstGeneration]).toBeGreaterThan(0);
      for (let g = species.firstGeneration + 1; g < counts.length; g++) expect(counts[g]).toBeGreaterThan(counts[g - 1]);
    }
  });
});
