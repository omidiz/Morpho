import { describe, expect, it } from 'vitest';
import { isFirstVisit, markWelcomed, type HintStorage } from './firstVisit';

function memory(): HintStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('first visit', () => {
  it('is a first visit until welcomed', () => {
    const s = memory();
    expect(isFirstVisit(s)).toBe(true);
    markWelcomed(s);
    expect(isFirstVisit(s)).toBe(false);
  });

  it('copes without storage', () => {
    expect(isFirstVisit(null)).toBe(true);
    expect(() => markWelcomed(null)).not.toThrow();
  });

  it('copes with storage that throws', () => {
    const broken: HintStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(isFirstVisit(broken)).toBe(true);
    expect(() => markWelcomed(broken)).not.toThrow();
  });
});
