import { describe, expect, it } from 'vitest';
import { chromeColors, contrast, hexToRgb, mixHex } from './color';

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

describe('chromeColors', () => {
  it('uses the most visible color for text, the next for accents', () => {
    expect(chromeColors('#ffffff', ['#eeeeee', '#222222', '#888888'])).toEqual({
      bg: '#ffffff',
      ink: '#222222',
      accent: '#888888',
    });
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
