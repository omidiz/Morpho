import { describe, expect, it } from 'vitest';
import { hexToRgb } from './color';

describe('hexToRgb', () => {
  it('parses long and short hex', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb('#0f0')).toEqual([0, 1, 0]);
  });
  it('throws on junk', () => {
    expect(() => hexToRgb('nope')).toThrow();
  });
});
