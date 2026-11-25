import { describe, expect, it } from 'vitest';
import { BLOOM_MS, GENERATION_MS, Growth } from './growth';

describe('Growth', () => {
  it('grows one generation at a time, then blooms', () => {
    const g = new Growth(3);
    expect(g.shown).toBe(-1);
    g.step(GENERATION_MS / 2);
    expect(g.shown).toBe(-1);
    expect(g.t).toBeCloseTo(0.5);
    g.step(GENERATION_MS / 2);
    expect(g.shown).toBe(0);
    g.step(GENERATION_MS * 3);
    expect(g.shown).toBe(3);
    expect(g.t).toBe(0);
    expect(g.bloom).toBe(0);
    g.step(BLOOM_MS / 2);
    expect(g.bloom).toBeCloseTo(0.5);
    g.step(BLOOM_MS);
    expect(g.done).toBe(true);
    expect(g.step(16)).toBe(false); // nothing left to animate
  });

  it('waits out its delay first', () => {
    const g = new Growth(2, 500);
    g.step(400);
    expect(g.t).toBe(0);
    g.step(100 + GENERATION_MS / 4);
    expect(g.t).toBeCloseTo(0.25);
  });

  it('passes straight through generations with nothing to draw', () => {
    const g = new Growth(4);
    g.step(1, (gen) => gen === 0);
    expect(g.shown).toBe(0);
  });

  it('grows on from where it is when the target goes up, and cuts back at once when it goes down', () => {
    const g = new Growth(2);
    g.step(GENERATION_MS * 10);
    g.step(BLOOM_MS);
    expect(g.done).toBe(true);
    g.setTarget(4);
    expect(g.shown).toBe(2);
    g.step(GENERATION_MS * 1.5);
    expect(g.shown).toBe(3);
    expect(g.bloom).toBe(0); // leaves fold away while it grows
    g.setTarget(1);
    expect(g.shown).toBe(1);
    expect(g.t).toBe(0);
  });

  it('can skip to the end', () => {
    const g = new Growth(5, 1000);
    g.finish();
    expect(g.shown).toBe(5);
    expect(g.done).toBe(true);
  });
});
