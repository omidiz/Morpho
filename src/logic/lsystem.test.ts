import { describe, expect, it } from 'vitest';
import {
  axiomWord,
  grow,
  growMore,
  layout,
  rewrite,
  rewrittenSize,
  thickness,
  turtle,
  type LSystem,
  type Word,
} from './lsystem';

const algae: LSystem = { axiom: 'A', rules: { A: 'AB', B: 'A' } };
const word = (symbols: string, seed = 1): Word => axiomWord(symbols, seed);

describe('rewrite', () => {
  it('replaces every symbol at once (the textbook algae example)', () => {
    expect(grow(algae, 5, 1).map((w) => w.symbols)).toEqual(['A', 'AB', 'ABA', 'ABAAB', 'ABAABABA', 'ABAABABAABAAB']);
  });

  it('copies symbols without a rule, ids included', () => {
    const w = word('F[+X]');
    const next = rewrite(w, { X: 'FX' });
    expect(next.symbols).toBe('F[+FX]');
    expect(Array.from(next.ids.slice(0, 3))).toEqual(Array.from(w.ids.slice(0, 3)));
    expect(next.ids[5]).toBe(w.ids[4]); // the closing bracket
  });

  it('gives each symbol of a replacement its own id', () => {
    const next = rewrite(word('F'), { F: 'FFF' });
    expect(new Set(next.ids).size).toBe(3);
  });

  it('picks among weighted alternatives per symbol, reproducibly', () => {
    const rules = { X: [{ to: 'a', weight: 3 }, { to: 'b', weight: 1 }] };
    const w = word('X'.repeat(4000), 7);
    const once = rewrite(w, rules).symbols;
    expect(rewrite(w, rules).symbols).toBe(once);
    const a = once.split('').filter((c) => c === 'a').length / once.length;
    expect(a).toBeGreaterThan(0.7);
    expect(a).toBeLessThan(0.8);
    expect(rewrite(word('X'.repeat(4000), 8), rules).symbols).not.toBe(once);
  });

  it('knows the size of the next word before building it', () => {
    const w = grow(algae, 6, 1).at(-1)!;
    expect(rewrittenSize(w, algae.rules).symbols).toBe(rewrite(w, algae.rules).symbols.length);
    const plant = grow({ axiom: 'X', rules: { X: 'F[+X]FX', F: 'FF' } }, 3, 1).at(-1)!;
    const next = rewrite(plant, { X: 'F[+X]FX', F: 'FF' });
    expect(rewrittenSize(plant, { X: 'F[+X]FX', F: 'FF' }).segments).toBe(next.symbols.split('F').length - 1);
  });
});

describe('grow', () => {
  const doubling: LSystem = { axiom: 'F', rules: { F: 'FF' } };

  it('stops before a word would have too many segments', () => {
    const words = grow(doubling, 20, 1, 100);
    expect(words).toHaveLength(7); // 1, 2, 4 … 64; 128 would be too many
    expect(words.at(-1)!.symbols).toHaveLength(64);
  });

  it('can be continued later with the same result', () => {
    const fern: LSystem = { axiom: 'X', rules: { X: [{ to: 'F+[X]-X', weight: 1 }, { to: 'F-[X]+X', weight: 1 }], F: 'FF' } };
    const all = grow(fern, 6, 42);
    const more = growMore(grow(fern, 3, 42), fern, 6);
    expect(more.map((w) => w.symbols)).toEqual(all.map((w) => w.symbols));
  });
});

describe('turtle', () => {
  const opts = { angle: Math.PI / 2, length: 1, randomness: 0 };

  it('draws one segment per F, branches returning to where they started', () => {
    const s = turtle(word('F[+F]F'), opts);
    expect(s.count).toBe(3);
    expect(Array.from(s.parent)).toEqual([-1, 0, 0]);
    expect(Array.from(s.heading)).toEqual([0, -Math.PI / 2, 0].map(Math.fround));
    expect(Array.from(s.start)).toEqual([0, 1, 1]);
    expect(s.reach).toBe(2);
  });

  it('counts tips: twig ends have one, the trunk carries them all', () => {
    const s = turtle(word('FF[+F][-F]F'), opts);
    expect(s.totalTips).toBe(3);
    expect(Array.from(s.tips)).toEqual([3, 3, 1, 1, 1]);
    expect(Array.from(s.children)).toEqual([1, 3, 0, 0, 0]);
    expect(thickness(s, 0)).toBe(1);
    expect(thickness(s, 2)).toBeCloseTo(Math.sqrt(1 / 3));
  });

  it('ignores letters that only take part in rewriting, and stray brackets', () => {
    expect(turtle(word('XFY]F'), opts).count).toBe(2);
  });

  it('is exact with no randomness and varies, reproducibly, with it', () => {
    const w = grow({ axiom: 'X', rules: { X: 'F[+X][-X]FX', F: 'FF' } }, 4, 3).at(-1)!;
    const plain = turtle(w, { angle: 0.4, length: 1, randomness: 0, wobble: 0.1 });
    // Every heading is a whole number of turns.
    for (const h of plain.heading) expect(Math.abs(h / 0.4 - Math.round(h / 0.4))).toBeLessThan(1e-5);
    const a = turtle(w, { angle: 0.4, length: 1, randomness: 0.5, wobble: 0.1 });
    const b = turtle(w, { angle: 0.4, length: 1, randomness: 0.5, wobble: 0.1 });
    expect(Array.from(a.heading)).toEqual(Array.from(b.heading));
    expect(Array.from(a.heading)).not.toEqual(Array.from(plain.heading));
  });

  it('keeps the shape of one generation in the next, so growth is smooth', () => {
    // F→FF with segments halved: the trunk and old branches stay put.
    const sys: LSystem = { axiom: 'X', rules: { X: 'F[+X][-X]FX', F: 'FF' } };
    const words = grow(sys, 5, 9);
    for (const randomness of [0, 0.6]) {
      const end = (g: number) => {
        const lay = layout(turtle(words[g], { angle: 0.5, length: 0.5 ** g, randomness }), 0);
        return [lay.x1[lay.x1.length - 1], lay.y1[lay.y1.length - 1]];
      };
      // The last segment drawn is the top of the leader at every generation;
      // it climbs as the plant grows but never jumps sideways.
      const tops = [2, 3, 4, 5].map(end);
      for (const [x] of tops) expect(Math.abs(x)).toBeLessThan(1e-4);
      for (let i = 1; i < tops.length; i++) expect(tops[i][1]).toBeLessThan(tops[i - 1][1]);
    }
  });
});

describe('layout', () => {
  const w = grow({ axiom: 'X', rules: { X: 'F[+X][-X]FX', F: 'FF' } }, 4, 5).at(-1)!;
  const s = turtle(w, { angle: 0.45, length: 1, randomness: 0 });

  it('grows up from the root without wind', () => {
    const lay = layout(s, 0);
    expect(lay.x0[0]).toBe(0);
    expect(lay.y0[0]).toBe(0);
    expect(lay.minY).toBeLessThan(0);
    expect(lay.maxY).toBe(0);
    expect(lay.minX).toBeCloseTo(-lay.maxX, 4); // a symmetric plant stays symmetric
  });

  it('joins every segment to its parent', () => {
    const lay = layout(s, 0.7);
    for (let i = 1; i < s.count; i++) {
      const p = s.parent[i];
      expect(lay.x0[i]).toBe(lay.x1[p]);
      expect(lay.y0[i]).toBe(lay.y1[p]);
    }
  });

  it('bends with the wind, twigs more than the trunk', () => {
    const still = layout(s, 0);
    const right = layout(s, 0.8);
    const left = layout(s, -0.8);
    expect(right.maxX).toBeGreaterThan(still.maxX);
    expect(right.minX).toBeCloseTo(-left.maxX, 4);
    const tip = s.count - 1;
    expect(right.heading[tip] - still.heading[tip]).toBeGreaterThan(right.heading[0] - still.heading[0]);
  });
});
