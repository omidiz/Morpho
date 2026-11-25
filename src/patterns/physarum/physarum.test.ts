import { describe, expect, it } from 'vitest';
import { clampToSpec, defaultValues } from '../../logic/params';
import { START_LAYOUTS } from '../../logic/physarum';
import { randomizeState } from '../../logic/randomize';
import { decodeState, encodeState } from '../../logic/urlState';
import { PALETTES } from '../../palettes';
import { PATTERNS } from '..';
import { physarum } from '.';

describe('slime pattern definition', () => {
  it('is in the studio, after the others', () => {
    expect(PATTERNS.at(-1)).toBe(physarum);
  });

  it('has the four named looks', () => {
    expect(physarum.presets.map((p) => p.name)).toEqual(['Veins', 'Roots', 'Neurons', 'Galaxy web']);
  });

  it('shows the four sliders asked for, keeping reach and start for the looks', () => {
    const shown = physarum.params.filter((p) => p.control !== 'hidden').map((p) => p.key);
    expect(shown).toEqual(['agents', 'angle', 'turn', 'fade']);
    const start = physarum.params.find((p) => p.key === 'start')!;
    expect(start.options?.length).toBe(start.max - start.min + 1);
    expect(start.options).toEqual(START_LAYOUTS);
  });

  it('presets set every control to a valid value, and defaults are valid', () => {
    for (const preset of physarum.presets) {
      expect(Object.keys(preset.values).sort()).toEqual(physarum.params.map((p) => p.key).sort());
      for (const [key, value] of Object.entries(preset.values)) {
        const spec = physarum.params.find((p) => p.key === key)!;
        expect(clampToSpec(spec, value), `${preset.id}.${key}`).toBe(value);
      }
    }
    for (const spec of physarum.params) expect(clampToSpec(spec, spec.default)).toBe(spec.default);
  });

  it('defaults to the Veins look', () => {
    expect(defaultValues(physarum.params)).toEqual(physarum.presets[0].values);
  });

  it('keeps every setting in the link, hidden ones included', () => {
    const state = {
      pattern: 'slime',
      seed: 'abc',
      palette: 'moss',
      params: { ...physarum.presets[1].values, agents: 520, angle: 31.5 },
    };
    const url = encodeState(state, physarum);
    expect(url).toContain('start=1');
    expect(decodeState(url, [physarum], PALETTES, () => 'x')).toEqual(state);
  });

  it('Randomize keeps the crowd size and takes the start layout from a look', () => {
    const current = { pattern: 'slime', seed: 'a', palette: 'moss', params: { ...defaultValues(physarum.params), agents: 640 } };
    const starts = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const next = randomizeState(current, physarum, PALETTES, `s${i}`);
      expect(next.params.agents).toBe(640);
      expect(physarum.presets.map((p) => p.values.start)).toContain(next.params.start);
      starts.add(next.params.start);
      for (const spec of physarum.params) expect(clampToSpec(spec, next.params[spec.key])).toBe(next.params[spec.key]);
    }
    expect(starts.size).toBe(2);
  });
});
