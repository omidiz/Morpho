import { describe, expect, it } from 'vitest';
import { clampToSpec, defaultValues } from '../../logic/params';
import { angleFromTurn } from '../../logic/phyllotaxis';
import { randomizeState } from '../../logic/randomize';
import { decodeState, encodeState } from '../../logic/urlState';
import { PALETTES } from '../../palettes';
import { phyllotaxis } from '.';
import { armBands, seedScale } from './draw';

describe('spirals pattern definition', () => {
  it('has the four named looks', () => {
    expect(phyllotaxis.presets.map((p) => p.name)).toEqual(['Sunflower', 'Pinecone', 'Daisy', 'Galaxy']);
  });

  it('presets set every control to a valid value, and defaults are valid', () => {
    for (const preset of phyllotaxis.presets) {
      expect(Object.keys(preset.values).sort()).toEqual(phyllotaxis.params.map((p) => p.key).sort());
      for (const [key, value] of Object.entries(preset.values)) {
        const spec = phyllotaxis.params.find((p) => p.key === key)!;
        expect(clampToSpec(spec, value), `${preset.id}.${key}`).toBe(value);
      }
    }
    for (const spec of phyllotaxis.params) expect(clampToSpec(spec, spec.default)).toBe(spec.default);
  });

  it('names one choice per value for shape and coloring', () => {
    for (const spec of phyllotaxis.params.filter((p) => p.control === 'choice')) {
      expect(spec.options?.length).toBe(spec.max - spec.min + 1);
    }
  });

  it('starts at the golden angle and shows it', () => {
    const angle = phyllotaxis.params.find((p) => p.key === 'angle')!;
    expect(angle.format?.(angle.default)).toBe('137.51° golden');
    expect(angle.format?.(0.5)).toBe(`${angleFromTurn(0.5).toFixed(2)}°`);
  });

  it('keeps every setting in the link', () => {
    const state = {
      pattern: 'spirals',
      seed: 'abc',
      palette: 'pollen',
      params: { ...defaultValues(phyllotaxis.params), angle: -0.065, shape: 2, color: 0 },
    };
    const url = encodeState(state, phyllotaxis);
    expect(url).toContain('angle=-0.065');
    expect(decodeState(url, [phyllotaxis], PALETTES, () => 'x')).toEqual(state);
  });

  it('Randomize visits every shape and coloring, and stays near the golden angle', () => {
    const start = { pattern: 'spirals', seed: 's', palette: 'pollen', params: defaultValues(phyllotaxis.params) };
    const shapes = new Map<number, number>();
    const colors = new Set<number>();
    for (let i = 0; i < 600; i++) {
      const next = randomizeState(start, phyllotaxis, PALETTES, `r${i}`);
      shapes.set(next.params.shape, (shapes.get(next.params.shape) ?? 0) + 1);
      colors.add(next.params.color);
      expect(Math.abs(angleFromTurn(next.params.angle) - 137.5)).toBeLessThan(1);
    }
    expect([...shapes.keys()].sort()).toEqual([0, 1, 2]);
    for (const count of shapes.values()) expect(count).toBeGreaterThan(150);
    expect([...colors].sort()).toEqual([0, 1]);
  });
});

describe('armBands', () => {
  it('colors neighbouring arms in bands that wrap around without a seam', () => {
    for (const [arms, colors] of [[21, 3], [34, 3], [55, 4], [89, 4], [13, 3]]) {
      const bands = armBands(arms, colors);
      const changes = [...bands].filter((b, a) => b !== bands[(a + 1) % arms]).length;
      expect(changes % colors, `${arms} arms`).toBe(0);
      expect(changes).toBeGreaterThanOrEqual(colors);
      expect(changes).toBeLessThan(arms / 2);
    }
  });

  it('gives each of a few arms its own color in turn', () => {
    expect([...armBands(2, 3)]).toEqual([0, 1]);
    expect([...armBands(5, 3)]).toEqual([0, 1, 2, 0, 1]);
  });
});

describe('seedScale', () => {
  it('fills the head in from the heart, every seed in place at the end', () => {
    expect(seedScale(0, 100, 0)).toBe(0);
    expect(seedScale(0, 100, 0.3)).toBeGreaterThan(0);
    expect(seedScale(99, 100, 0.3)).toBe(0);
    for (let i = 0; i < 100; i++) expect(seedScale(i, 100, 1)).toBe(1);
  });
});
