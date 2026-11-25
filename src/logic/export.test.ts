import { describe, expect, it } from 'vitest';
import { coverFit, exportFileName, WALLPAPER_SIZES } from './export';

describe('wallpaper sizes', () => {
  it('offers phone, desktop and square', () => {
    expect(WALLPAPER_SIZES.map((s) => [s.name, s.width, s.height])).toEqual([
      ['Phone', 1170, 2532],
      ['Desktop', 2560, 1440],
      ['Square', 2048, 2048],
    ]);
  });
});

describe('exportFileName', () => {
  it('names files after the pattern and seed', () => {
    expect(exportFileName('turing', 'abc123')).toBe('morpho-turing-abc123.png');
  });
  it('strips anything odd', () => {
    expect(exportFileName('tu/ring', '../x y')).toBe('morpho-turing-xy.png');
    expect(exportFileName('', '')).toBe('morpho-x-x.png');
  });
});

describe('coverFit', () => {
  it('is identity-like when shapes match', () => {
    expect(coverFit(390, 844, 1170, 2532)).toEqual({ scale: 3, x: 0, y: 0, width: 390, height: 844 });
  });
  it('crops the long side of the view, centered', () => {
    // A portrait phone view into a landscape image: full width, a band from the middle.
    const f = coverFit(400, 800, 2560, 1440);
    expect(f.scale).toBeCloseTo(6.4);
    expect(f.width).toBeCloseTo(400);
    expect(f.height).toBeCloseTo(225);
    expect(f.y).toBeCloseTo((800 - 225) / 2);
    expect(f.x).toBeCloseTo(0);
  });
});
