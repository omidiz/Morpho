import { describe, expect, it } from 'vitest';
import { rampTable, shadeTrail, shadeTuring, toneTable, type Rgb } from './shade';

const STOPS: Rgb[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 1],
];

describe('rampTable', () => {
  it('runs from the background to the last color through the others', () => {
    const t = rampTable(STOPS, 101);
    expect([...t.subarray(0, 3)]).toEqual([0, 0, 0]);
    expect([...t.subarray(50 * 3, 51 * 3)]).toEqual([1, 0, 0]);
    expect([...t.subarray(100 * 3)]).toEqual([1, 1, 1]);
  });
});

describe('shadeTuring', () => {
  it('paints plain mixture as background and B as the top color', () => {
    const gw = 8;
    const gh = 8;
    const field = new Float32Array(gw * gh * 2);
    for (let i = 0; i < field.length; i += 2) field[i] = 1;
    const data = new Uint8ClampedArray(16 * 16 * 4);
    const ramp = rampTable(STOPS);
    shadeTuring(field, gw, gh, { data, width: 16, height: 16, row0: 0, row1: 16 }, ramp, 2);
    expect(Math.max(...data.filter((_, i) => i % 4 !== 3))).toBeLessThanOrEqual(1); // background ± dither
    for (let i = 1; i < field.length; i += 2) field[i] = 0.5;
    shadeTuring(field, gw, gh, { data, width: 16, height: 16, row0: 0, row1: 16 }, ramp, 2);
    expect(Math.min(...data)).toBeGreaterThanOrEqual(254);
  });

  it('only writes the rows it is asked for', () => {
    const field = new Float32Array(4 * 4 * 2).fill(0.5);
    const data = new Uint8ClampedArray(4 * 10 * 4);
    shadeTuring(field, 4, 4, { data, width: 4, height: 10, row0: 2, row1: 5 }, rampTable(STOPS), 1);
    expect(data.subarray(0, 2 * 16).every((v) => v === 0)).toBe(true);
    expect(data.subarray(2 * 16, 5 * 16).every((v) => v > 0)).toBe(true);
    expect(data.subarray(5 * 16).every((v) => v === 0)).toBe(true);
  });
});

describe('shadeTrail', () => {
  it('brightens with the trail, saturating toward the top color', () => {
    const tone = toneTable(STOPS);
    const shade = (v: number) => {
      const data = new Uint8ClampedArray(4);
      shadeTrail(new Float32Array(4).fill(v), 2, 2, { data, width: 1, height: 1, row0: 0, row1: 1 }, tone, 0.16);
      return data[0] + data[1] + data[2];
    };
    expect(shade(0)).toBeLessThanOrEqual(3);
    expect(shade(2)).toBeLessThan(shade(8));
    expect(shade(8)).toBeLessThan(shade(30));
    expect(shade(200)).toBeGreaterThanOrEqual(762);
  });
});
