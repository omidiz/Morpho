import { describe, expect, it } from 'vitest';
import { clampToSpec, defaultValues } from '../../logic/params';
import { randomizeState } from '../../logic/randomize';
import { decodeState, encodeState } from '../../logic/urlState';
import { PALETTES } from '../../palettes';
import { plants } from '.';

describe('plants pattern definition', () => {
  it('has a chip per plant', () => {
    expect(plants.presets.map((p) => p.name)).toEqual(['Fern', 'Tree', 'Bush', 'Seaweed', 'Lightning tree']);
  });

  it('presets and defaults only use valid values', () => {
    for (const preset of plants.presets) {
      for (const [key, value] of Object.entries(preset.values)) {
        const spec = plants.params.find((p) => p.key === key)!;
        expect(spec, `${preset.id}.${key}`).toBeDefined();
        expect(clampToSpec(spec, value)).toBe(value);
      }
    }
    for (const spec of plants.params) expect(clampToSpec(spec, spec.default)).toBe(spec.default);
  });

  it('keeps the plant (which has no slider) and forest in the link', () => {
    const state = { pattern: 'plants', seed: 'abc', palette: 'moss', params: { ...defaultValues(plants.params), plant: 3, forest: 1 } };
    const url = encodeState(state, plants);
    expect(url).toContain('plant=3');
    expect(url).toContain('forest=1');
    expect(decodeState(url, [plants], PALETTES, () => 'x')).toEqual(state);
  });

  it('Randomize visits every plant and leaves growth steps and forest alone', () => {
    const start = { pattern: 'plants', seed: 's', palette: 'moss', params: { ...defaultValues(plants.params), steps: 3, forest: 1 } };
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const next = randomizeState(start, plants, PALETTES, `r${i}`);
      seen.add(next.params.plant);
      expect(next.params.steps).toBe(3);
      expect(next.params.forest).toBe(1);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
