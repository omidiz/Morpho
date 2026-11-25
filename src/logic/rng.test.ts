import { describe, expect, it } from 'vitest';
import { hashSeed, isValidSeed, makeSeed, mulberry32 } from './rng';

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
