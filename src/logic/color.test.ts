import { describe, expect, it } from 'vitest';
import { contrast, hexToRgb, mixHex, UI_SURFACE, uiColors } from './color';

describe('hexToRgb', () => {
  it('parses long and short hex', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb('#0f0')).toEqual([0, 1, 0]);
  });
  it('throws on junk', () => {
    expect(() => hexToRgb('nope')).toThrow();
  });
});

describe('contrast', () => {
  it('matches the WCAG extremes', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21);
    expect(contrast('#777', '#777')).toBe(1);
  });
});

describe('uiColors', () => {
  it('uses the most visible color as the accent, the next for slider fills', () => {
    expect(uiColors(['#222222', '#eeeeee', '#888888'], '#000000')).toEqual({
      accent: '#eeeeee',
      soft: '#888888',
    });
  });
  it('falls back to the accent when the second color would vanish', () => {
    expect(uiColors(['#eeeeee', '#141414'], '#111111').soft).toBe('#eeeeee');
  });
  it('lifts a palette of dark colors until it reads', () => {
    const { accent } = uiColors(['#202020', '#303030'], UI_SURFACE);
    expect(contrast(accent, UI_SURFACE)).toBeGreaterThanOrEqual(7);
  });
});

describe('mixHex', () => {
  it('blends between two colors', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000', '#fff', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#0000ff', 2)).toBe('#0000ff'); // clamped
  });
});
