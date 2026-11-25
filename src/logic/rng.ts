/** A function returning uniformly distributed numbers in [0, 1). */
export type Rng = () => number;

/** Small, fast, seedable PRNG (mulberry32). Same seed → same sequence. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a seed string (as shown in the URL) to a 32-bit integer (FNV-1a). */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const SEED_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** A short, readable seed string. `rng` defaults to Math.random (not seeded). */
export function makeSeed(rng: Rng = Math.random, length = 6): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += SEED_ALPHABET[Math.floor(rng() * SEED_ALPHABET.length)];
  }
  return s;
}

/** Seeds in URLs are short alphanumeric strings. */
export function isValidSeed(seed: string): boolean {
  return /^[a-z0-9]{1,16}$/i.test(seed);
}
