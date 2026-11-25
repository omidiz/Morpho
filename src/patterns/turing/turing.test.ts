import { describe, expect, it } from 'vitest';
import { clampToSpec } from '../../logic/params';
import { turing } from '.';

describe('turing pattern definition', () => {
  it('has the five named looks', () => {
    expect(turing.presets.map((p) => p.name)).toEqual(['Leopard', 'Zebra', 'Coral', 'Maze', 'Cells']);
  });

  it('presets only use valid slider values', () => {
    for (const preset of turing.presets) {
      for (const [key, value] of Object.entries(preset.values)) {
        const spec = turing.params.find((p) => p.key === key);
        expect(spec, `${preset.id}.${key}`).toBeDefined();
        expect(clampToSpec(spec!, value)).toBe(value);
      }
    }
  });

  it('defaults are valid', () => {
    for (const spec of turing.params) expect(clampToSpec(spec, spec.default)).toBe(spec.default);
  });
});
