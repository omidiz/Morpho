import { describe, expect, it } from 'vitest';
import { UndoStack } from './history';

describe('UndoStack', () => {
  it('undoes newest first', () => {
    const s = new UndoStack<number>();
    s.push(1);
    s.push(2);
    expect(s.pop()).toBe(2);
    expect(s.pop()).toBe(1);
    expect(s.pop()).toBeUndefined();
    expect(s.size).toBe(0);
  });

  it('keeps only the last few', () => {
    const s = new UndoStack<number>(3);
    for (let i = 1; i <= 5; i++) s.push(i);
    expect(s.size).toBe(3);
    expect([s.pop(), s.pop(), s.pop(), s.pop()]).toEqual([5, 4, 3, undefined]);
  });
});
