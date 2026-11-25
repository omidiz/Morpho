import { describe, expect, it } from 'vitest';
import type { ParamSpec } from './params';
import { decodeState, encodeState, type PatternSchema } from './urlState';

const params: ParamSpec[] = [
  { key: 'speed', label: 'Speed', min: 1, max: 10, step: 1, default: 5 },
  { key: 'food', label: 'Food', min: 0, max: 1, step: 0.001, default: 0.5 },
];
const turing: PatternSchema = { id: 'turing', params };
const other: PatternSchema = { id: 'other', params: [] };
const fixedSeed = () => 'fresh1';

describe('urlState', () => {
  it('round-trips', () => {
    const state = { pattern: 'turing', seed: 'abc123', params: { speed: 7, food: 0.413 } };
    const search = encodeState(state, turing);
    expect(search).toBe('?p=turing&seed=abc123&speed=7&food=0.413');
    expect(decodeState(search, [turing, other], fixedSeed)).toEqual(state);
  });

  it('fills in defaults and a new seed for an empty URL', () => {
    expect(decodeState('', [turing, other], fixedSeed)).toEqual({
      pattern: 'turing',
      seed: 'fresh1',
      params: { speed: 5, food: 0.5 },
    });
  });

  it('picks the named pattern, falls back on unknown ones', () => {
    expect(decodeState('?p=other', [turing, other], fixedSeed).pattern).toBe('other');
    expect(decodeState('?p=nope', [turing, other], fixedSeed).pattern).toBe('turing');
  });

  it('clamps params and rejects bad seeds', () => {
    const s = decodeState('?p=turing&seed=%3Cb%3E&speed=99&food=-1', [turing], fixedSeed);
    expect(s.seed).toBe('fresh1');
    expect(s.params).toEqual({ speed: 10, food: 0 });
  });
});
