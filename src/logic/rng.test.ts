import { describe, expect, it } from 'vitest';
import { hashSeed, isValidSeed, makeSeed, mixSeed, mulberry32, signedHash, unitHash } from './rng';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('differs between seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('stays in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 10_000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('is stable and returns unsigned 32-bit ints', () => {
    expect(hashSeed('leopard')).toBe(hashSeed('leopard'));
    expect(hashSeed('leopard')).not.toBe(hashSeed('leopards'));
    const h = hashSeed('abc');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe('makeSeed', () => {
  it('makes valid seeds, reproducibly from a seeded rng', () => {
    const s = makeSeed(mulberry32(3));
    expect(isValidSeed(s)).toBe(true);
    expect(s).toHaveLength(6);
    expect(makeSeed(mulberry32(3))).toBe(s);
  });

  it('rejects unsafe seeds', () => {
    expect(isValidSeed('')).toBe(false);
    expect(isValidSeed('a b')).toBe(false);
    expect(isValidSeed('<script>')).toBe(false);
    expect(isValidSeed('x'.repeat(17))).toBe(false);
  });
});

// Shared links rely on these exact numbers: a link made today must grow the
// same pattern next year. If one of these changes, old links break.
describe('stability of shared links', () => {
  it('mulberry32 matches the reference sequence', () => {
    const r = mulberry32(42);
    expect([r(), r(), r()]).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
    const z = mulberry32(0);
    expect([z(), z()]).toEqual([0.26642920868471265, 0.0003297457005828619]);
  });

  it('hashSeed matches FNV-1a', () => {
    expect(hashSeed('')).toBe(0x811c9dc5);
    expect(hashSeed('a')).toBe(0xe40c292c);
    expect(hashSeed('leopard')).toBe(1359546370);
    expect(hashSeed('abc123')).toBe(951228933);
  });

  it('makeSeed is reproducible from a seeded rng', () => {
    expect(makeSeed(mulberry32(1))).toBe('was98i');
    expect(makeSeed(mulberry32(2), 10)).toBe('zkjt6wrm3d');
  });
});

describe('mulberry32 quality', () => {
  it('treats seeds as 32-bit unsigned', () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
    expect(mulberry32(2 ** 32 + 5)()).toBe(mulberry32(5)());
  });

  it('spreads values evenly', () => {
    const r = mulberry32(123);
    const bins = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) bins[Math.floor(r() * 10)]++;
    for (const count of bins) expect(Math.abs(count - n / 10)).toBeLessThan(n / 100);
  });

  it('gives unrelated sequences for neighbouring seeds', () => {
    const a = mulberry32(1000);
    const b = mulberry32(1001);
    let same = 0;
    for (let i = 0; i < 1000; i++) if (Math.abs(a() - b()) < 0.01) same++;
    expect(same).toBeLessThan(50); // ~20 expected by chance
  });
});

describe('makeSeed alphabet', () => {
  it('only uses readable characters (no 0/o, 1/l)', () => {
    const r = mulberry32(9);
    for (let i = 0; i < 200; i++) expect(makeSeed(r)).toMatch(/^[a-km-np-z2-9]{6}$/);
  });
});

describe('mixSeed / unitHash', () => {
  it('is stable, spreads nearby inputs apart and stays in range', () => {
    expect(mixSeed(1, 2)).toBe(mixSeed(1, 2));
    expect(mixSeed(1, 2)).not.toBe(mixSeed(2, 1));
    expect(mixSeed(1, 2)).not.toBe(mixSeed(1, 3));
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const u = unitHash(i, 99);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      const s = signedHash(i, 99);
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThan(1);
      sum += u;
    }
    expect(sum / 10_000).toBeCloseTo(0.5, 1);
  });

  // Plant shapes in shared links depend on these exact values.
  it('keeps its exact output', () => {
    expect([mixSeed(0, 0), mixSeed(1, 2), mixSeed(0xffffffff, 7)]).toEqual([1622709315, 1668479420, 877109393]);
  });
});
