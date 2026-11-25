import { describe, expect, it } from 'vitest';
import { openness, settlesOpen, thumbSteps, THUMB_WARMUP_STEPS } from './sheet';

describe('settlesOpen', () => {
  it('goes to the nearer end when let go gently', () => {
    expect(settlesOpen(100, 400, 0)).toBe(true);
    expect(settlesOpen(300, 400, 0)).toBe(false);
  });
  it('follows a flick whichever end is nearer', () => {
    expect(settlesOpen(350, 400, -1)).toBe(true);
    expect(settlesOpen(20, 400, 1)).toBe(false);
  });
});

describe('openness', () => {
  it('runs from 1 open to 0 closed, clamped', () => {
    expect(openness(0, 400)).toBe(1);
    expect(openness(200, 400)).toBe(0.5);
    expect(openness(500, 400)).toBe(0);
    expect(openness(-20, 400)).toBe(1);
    expect(openness(0, 0)).toBe(1);
  });
});

describe('thumbSteps', () => {
  it('fast-forwards to exactly the warm-up, then slows down', () => {
    let age = 0;
    while (age < THUMB_WARMUP_STEPS) age += thumbSteps(age, false);
    expect(age).toBe(THUMB_WARMUP_STEPS);
    expect(thumbSteps(age, false)).toBe(1);
  });
  it('holds still after warming up when motion is reduced', () => {
    expect(thumbSteps(0, true)).toBeGreaterThan(0);
    expect(thumbSteps(THUMB_WARMUP_STEPS, true)).toBe(0);
  });
});
