import { describe, expect, it } from 'vitest';
import { turing } from '../patterns/turing';
import { PALETTES } from '../palettes';
import { defaultValues, type ParamSpec } from './params';
import { randomizeState, type ExploreSchema } from './randomize';
import { mulberry32, makeSeed } from './rng';
import { decodeState, encodeState, type AppState } from './urlState';

const specs: ParamSpec[] = [
  { key: 'speed', label: 'Speed', min: 1, max: 10, step: 1, default: 5 },
  { key: 'food', label: 'Food', min: 0, max: 1, step: 0.001, default: 0.5 },
  { key: 'size', label: 'Size', min: 1, max: 4, step: 0.1, default: 2 },
];
const toy: ExploreSchema = {
  id: 'toy',
  params: specs,
  presets: [{ values: { food: 0.2 } }, { values: { food: 0.8 } }],
  explore: { food: { jitter: 0.05 }, size: { range: [1.5, 2.5] } },
};
const palettes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const start: AppState = { pattern: 'toy', seed: 'start', palette: 'a', params: { speed: 9, food: 0.5, size: 2 } };
const seeds = Array.from({ length: 300 }, (_, i) => makeSeed(mulberry32(i)));

describe('randomizeState', () => {
  it('is reproducible: same seed, same result', () => {
    expect(randomizeState(start, toy, palettes, 'abc')).toEqual(randomizeState(start, toy, palettes, 'abc'));
    expect(randomizeState(start, toy, palettes, 'abc')).not.toEqual(randomizeState(start, toy, palettes, 'abd'));
  });

  it('uses the new seed and keeps the pattern', () => {
    const next = randomizeState(start, toy, palettes, 'fresh');
    expect(next.seed).toBe('fresh');
    expect(next.pattern).toBe('toy');
  });

  it('keeps params without a rule', () => {
    for (const seed of seeds) expect(randomizeState(start, toy, palettes, seed).params.speed).toBe(9);
  });

  it('stays near a preset for jitter rules and inside the range for range rules', () => {
    for (const seed of seeds) {
      const { food, size } = randomizeState(start, toy, palettes, seed).params;
      const near = [0.2, 0.8].some((v) => Math.abs(food - v) <= 0.05 + 1e-9);
      expect(near).toBe(true);
      expect(size).toBeGreaterThanOrEqual(1.5);
      expect(size).toBeLessThanOrEqual(2.5);
    }
  });

  it('visits every preset and spreads across the range', () => {
    const results = seeds.map((s) => randomizeState(start, toy, palettes, s).params);
    expect(results.some((p) => p.food < 0.5)).toBe(true);
    expect(results.some((p) => p.food > 0.5)).toBe(true);
    expect(Math.min(...results.map((p) => p.size))).toBeLessThan(1.6);
    expect(Math.max(...results.map((p) => p.size))).toBeGreaterThan(2.4);
  });

  it('always changes the palette, and uses all the others', () => {
    const seen = new Set<string>();
    for (const seed of seeds) {
      const { palette } = randomizeState(start, toy, palettes, seed);
      expect(palette).not.toBe('a');
      seen.add(palette);
    }
    expect([...seen].sort()).toEqual(['b', 'c']);
  });

  it('copes with one palette and no presets', () => {
    const bare = { ...toy, presets: [] };
    const next = randomizeState(start, bare, [{ id: 'a' }], 'x');
    expect(next.palette).toBe('a');
    expect(Math.abs(next.params.food - 0.5)).toBeLessThanOrEqual(0.05);
  });

  it('snaps to slider steps and clamps to slider limits', () => {
    const edge: ExploreSchema = { ...toy, presets: [{ values: { food: 0.99 } }], explore: { food: { jitter: 0.5 } } };
    for (const seed of seeds) {
      const { food } = randomizeState(start, edge, palettes, seed).params;
      expect(food).toBeLessThanOrEqual(1);
      expect(Number(food.toFixed(3))).toBe(food);
    }
  });

  it('gives Turing states that survive a trip through the URL', () => {
    const current: AppState = { pattern: 'turing', seed: 'abc', palette: PALETTES[0].id, params: defaultValues(turing.params) };
    for (const seed of seeds.slice(0, 50)) {
      const next = randomizeState(current, turing, PALETTES, seed);
      expect(decodeState(encodeState(next, turing), [turing], PALETTES, () => 'nope')).toEqual(next);
    }
  });

  it('keeps Turing rules within the sliders', () => {
    for (const [key, rule] of Object.entries(turing.explore)) {
      const spec = turing.params.find((p) => p.key === key);
      expect(spec, key).toBeDefined();
      if ('range' in rule) {
        expect(rule.range[0]).toBeGreaterThanOrEqual(spec!.min);
        expect(rule.range[1]).toBeLessThanOrEqual(spec!.max);
      }
    }
  });
});
