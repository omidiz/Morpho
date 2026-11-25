import { describe, expect, it } from 'vitest';
import { chromeColors, contrast, hexToRgb } from './logic/color';
import { DEFAULT_PALETTE, findPalette, MAX_STOPS, PALETTES, rampStops } from './palettes';

describe('palettes', () => {
  it('has the eight named palettes', () => {
    expect(PALETTES.map((p) => p.name)).toEqual([
      'Deep sea',
      'Moss',
      'Coral reef',
      'Pollen',
      'Bioluminescence',
      'Paper & ink',
      'Autumn',
      'Night garden',
    ]);
  });

  it('ids are unique and URL-safe', () => {
    const ids = PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('each has a background and 3–5 valid colors', () => {
    for (const p of PALETTES) {
      expect(p.colors.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.colors.length, p.id).toBeLessThanOrEqual(5);
      expect(rampStops(p).length).toBeLessThanOrEqual(MAX_STOPS);
      for (const c of rampStops(p)) expect(() => hexToRgb(c), `${p.id} ${c}`).not.toThrow();
    }
  });

  it('the pattern stands out from its background', () => {
    for (const p of PALETTES) {
      expect(contrast(p.background, p.colors.at(-1)!), p.id).toBeGreaterThan(7);
    }
  });

  it('page text is readable in every palette', () => {
    for (const p of PALETTES) {
      const { bg, ink } = chromeColors(p.background, p.colors);
      expect(contrast(bg, ink), p.id).toBeGreaterThanOrEqual(7);
    }
  });

  it('findPalette falls back to the default', () => {
    expect(findPalette('moss').name).toBe('Moss');
    expect(findPalette('nope')).toBe(DEFAULT_PALETTE);
    expect(findPalette(null)).toBe(DEFAULT_PALETTE);
  });
});
