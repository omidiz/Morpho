import { describe, expect, it } from 'vitest';
import { FrameGovernor, StepAccumulator } from './governor';

describe('FrameGovernor', () => {
  it('keeps full budget while frames are on time', () => {
    const g = new FrameGovernor();
    for (let i = 0; i < 300; i++) g.update(16.7);
    expect(g.budget).toBe(1);
  });

  it('backs off when frames drop, and recovers', () => {
    const g = new FrameGovernor();
    for (let i = 0; i < 60; i++) g.update(16.7);
    for (let i = 0; i < 120; i++) g.update(40);
    const low = g.budget;
    expect(low).toBeLessThan(0.5);
    for (let i = 0; i < 600; i++) g.update(16.7);
    expect(g.budget).toBeGreaterThan(low);
  });

  it('treats a 120 Hz display as on time', () => {
    const g = new FrameGovernor();
    for (let i = 0; i < 300; i++) g.update(8.3);
    expect(g.budget).toBe(1);
  });

  it('ignores long pauses', () => {
    const g = new FrameGovernor();
    g.update(5000);
    expect(g.budget).toBe(1);
  });
});

describe('StepAccumulator', () => {
  it('runs the same steps per second at 60 Hz and 120 Hz', () => {
    const a = new StepAccumulator();
    const b = new StepAccumulator();
    let at60 = 0;
    let at120 = 0;
    for (let i = 0; i < 60; i++) at60 += a.next(5.5, 1000 / 60, 1);
    for (let i = 0; i < 120; i++) at120 += b.next(5.5, 1000 / 120, 1);
    expect(Math.abs(at60 - 330)).toBeLessThanOrEqual(1);
    expect(Math.abs(at120 - 330)).toBeLessThanOrEqual(1);
  });

  it('does not try to catch up after a long frame', () => {
    expect(new StepAccumulator().next(10, 2000, 1)).toBeLessThanOrEqual(20);
  });
});
