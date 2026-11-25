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

/**
 * Combine two 32-bit values into a well-mixed 32-bit hash. Used to give
 * things (plants in a forest, symbols in a plant) their own stable seed
 * derived from a parent seed, without drawing from a shared sequence.
 */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul((b + 0x9e3779b9) | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A number in [0, 1) fixed by `id` and `salt`. */
export function unitHash(id: number, salt: number): number {
  return mixSeed(id, salt) / 4294967296;
}

/** A number in [-1, 1) fixed by `id` and `salt`. */
export function signedHash(id: number, salt: number): number {
  return unitHash(id, salt) * 2 - 1;
}
