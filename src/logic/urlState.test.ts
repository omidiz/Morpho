import { describe, expect, it } from 'vitest';
import type { ParamSpec } from './params';
import { decodeState, encodeState, type PatternSchema } from './urlState';

const params: ParamSpec[] = [
  { key: 'speed', label: 'Speed', min: 1, max: 10, step: 1, default: 5 },
  { key: 'food', label: 'Food', min: 0, max: 1, step: 0.001, default: 0.5 },
];
const turing: PatternSchema = { id: 'turing', params };
const other: PatternSchema = { id: 'other', params: [] };
const palettes = [{ id: 'moss' }, { id: 'paper-ink' }];
const fixedSeed = () => 'fresh1';

describe('urlState', () => {
  it('round-trips', () => {
    const state = {
      pattern: 'turing',
      seed: 'abc123',
      palette: 'paper-ink',
      params: { speed: 7, food: 0.413 },
    };
    const search = encodeState(state, turing);
    expect(search).toBe('?p=turing&seed=abc123&pal=paper-ink&speed=7&food=0.413');
    expect(decodeState(search, [turing, other], palettes, fixedSeed)).toEqual(state);
  });

  it('fills in defaults and a new seed for an empty URL', () => {
    expect(decodeState('', [turing, other], palettes, fixedSeed)).toEqual({
      pattern: 'turing',
      seed: 'fresh1',
      palette: 'moss',
      params: { speed: 5, food: 0.5 },
    });
  });

  it('picks the named pattern, falls back on unknown ones', () => {
    expect(decodeState('?p=other', [turing, other], palettes, fixedSeed).pattern).toBe('other');
    expect(decodeState('?p=nope', [turing, other], palettes, fixedSeed).pattern).toBe('turing');
  });

  it('falls back to the first palette on unknown ones', () => {
    expect(decodeState('?pal=plaid', [turing], palettes, fixedSeed).palette).toBe('moss');
  });

  it('clamps params and rejects bad seeds', () => {
    const s = decodeState('?p=turing&seed=%3Cb%3E&speed=99&food=-1', [turing], palettes, fixedSeed);
    expect(s.seed).toBe('fresh1');
    expect(s.params).toEqual({ speed: 10, food: 0 });
  });

  it('ignores unknown keys and keeps only the schema params', () => {
    const s = decodeState('?p=turing&seed=abc&speed=3&color=red&food=0.2', [turing], palettes, fixedSeed);
    expect(s.params).toEqual({ speed: 3, food: 0.2 });
    expect(encodeState(s, turing)).toBe('?p=turing&seed=abc&pal=moss&speed=3&food=0.2');
  });

  it('snaps params to their step and writes no float noise', () => {
    const state = { pattern: 'turing', seed: 'abc', palette: 'moss', params: { speed: 4, food: 0.1 + 0.2 } };
    expect(encodeState(state, turing)).toBe('?p=turing&seed=abc&pal=moss&speed=4&food=0.3');
    expect(decodeState('?food=0.41349', [turing], palettes, fixedSeed).params.food).toBe(0.413);
    expect(decodeState('?speed=6.6', [turing], palettes, fixedSeed).params.speed).toBe(7);
  });

  it('uses defaults for junk values', () => {
    const s = decodeState('?speed=fast&food=&food2=1', [turing], palettes, fixedSeed);
    expect(s.params).toEqual({ speed: 5, food: 0.5 });
  });

  it('accepts a full URL query with or without the leading ?', () => {
    const a = decodeState('?p=turing&seed=xy9&pal=paper-ink', [turing], palettes, fixedSeed);
    const b = decodeState('p=turing&seed=xy9&pal=paper-ink', [turing], palettes, fixedSeed);
    expect(a).toEqual(b);
    expect(a.seed).toBe('xy9');
  });

  it('keeps seeds exactly, including case and digits', () => {
    const s = decodeState('?seed=AbC789', [turing], palettes, fixedSeed);
    expect(s.seed).toBe('AbC789');
    expect(encodeState(s, turing)).toContain('seed=AbC789');
  });

  it('never lets a param collide with the reserved keys', () => {
    const sneaky: PatternSchema = {
      id: 'turing',
      params: [{ key: 'seed', label: 'Oops', min: 0, max: 1, step: 1, default: 0 }, ...params],
    };
    const search = encodeState(
      { pattern: 'turing', seed: 'abc', palette: 'moss', params: { seed: 1, speed: 2, food: 0.5 } },
      sneaky,
    );
    expect(new URLSearchParams(search).getAll('seed')).toEqual(['abc']);
  });

  it('round-trips through a real URL, as when a link is shared', () => {
    const state = { pattern: 'other', seed: 'zz9', palette: 'paper-ink', params: {} };
    const link = new URL(`https://omidiz.github.io/morpho/${encodeState(state, other)}`);
    expect(decodeState(link.search, [turing, other], palettes, fixedSeed)).toEqual(state);
  });

  it('round-trips every value a slider can hold', () => {
    for (let i = 0; i <= 1000; i++) {
      const food = Number((i / 1000).toFixed(3));
      const state = { pattern: 'turing', seed: 's', palette: 'moss', params: { speed: 1 + (i % 10), food } };
      expect(decodeState(encodeState(state, turing), [turing], palettes, fixedSeed)).toEqual(state);
    }
  });

  it('only asks for a new seed when the URL has no usable one', () => {
    let calls = 0;
    const counting = () => {
      calls++;
      return 'new';
    };
    decodeState('?seed=ok1', [turing], palettes, counting);
    expect(calls).toBe(0);
    decodeState('?seed=', [turing], palettes, counting);
    expect(calls).toBe(1);
  });
});
