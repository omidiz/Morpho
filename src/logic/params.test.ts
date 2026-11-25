import { describe, expect, it } from 'vitest';
import { clampToSpec, defaultValues, formatValue, sanitizeValues, stepDecimals, type ParamSpec } from './params';

const size: ParamSpec = { key: 'scale', label: 'Size', min: 1, max: 4, step: 0.1, default: 2 };
const speed: ParamSpec = { key: 'speed', label: 'Speed', min: 1, max: 10, step: 1, default: 5 };

describe('stepDecimals', () => {
  it('counts decimals', () => {
    expect(stepDecimals(1)).toBe(0);
    expect(stepDecimals(0.1)).toBe(1);
    expect(stepDecimals(0.001)).toBe(3);
    expect(stepDecimals(1e-7)).toBe(7);
  });
});

describe('clampToSpec', () => {
  it('clamps and snaps without float noise', () => {
    expect(clampToSpec(size, 0)).toBe(1);
    expect(clampToSpec(size, 99)).toBe(4);
    expect(clampToSpec(size, 2.34)).toBe(2.3);
    expect(clampToSpec(size, 1.7000000001)).toBe(1.7);
    expect(clampToSpec(speed, 4.6)).toBe(5);
  });

  it('falls back to the default for non-numbers', () => {
    expect(clampToSpec(size, NaN)).toBe(2);
    expect(clampToSpec(size, Infinity)).toBe(2);
  });
});

describe('sanitizeValues', () => {
  it('fills every key, parsing strings and ignoring junk', () => {
    expect(sanitizeValues([size, speed], { scale: '3.33', speed: 'fast', extra: 1 })).toEqual({
      scale: 3.3,
      speed: 5,
    });
    expect(sanitizeValues([size, speed], {})).toEqual(defaultValues([size, speed]));
    expect(sanitizeValues([size], { scale: '' })).toEqual({ scale: 2 });
  });
});

describe('formatValue', () => {
  it('uses the fewest digits needed', () => {
    expect(formatValue(size, 2)).toBe('2');
    expect(formatValue(size, 2.3000000004)).toBe('2.3');
  });
});
