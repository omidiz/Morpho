import { describe, expect, it } from 'vitest';
import { FrameGovernor, PIXEL_RATIO_NOTCHES, ResolutionGovernor, StepAccumulator } from './governor';

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

describe('FrameGovernor on a very slow device', () => {
  it('backs off when every frame is long, not only some', () => {
    const g = new FrameGovernor(0.05);
    for (let i = 0; i < 12; i++) g.update(900);
    expect(g.budget).toBe(0.05);
  });

  it('still ignores a pause or two among normal frames', () => {
    const g = new FrameGovernor();
    for (let i = 0; i < 60; i++) g.update(16.7);
    g.update(3000);
    g.update(16.7);
    g.update(2000);
    for (let i = 0; i < 5; i++) g.update(16.7);
    expect(g.budget).toBe(1);
  });

  it('backs off at the same pace per second at 60 and at 10 frames a second', () => {
    const fast = new FrameGovernor(0.01);
    const slow = new FrameGovernor(0.01);
    for (let i = 0; i < 25; i++) fast.update(40); // a second at 25 fps
    for (let i = 0; i < 10; i++) slow.update(100); // a second at 10 fps
    expect(slow.budget).toBeLessThanOrEqual(fast.budget * 1.5);
  });
});

describe('ResolutionGovernor', () => {
  it('leaves a smooth device alone', () => {
    const r = new ResolutionGovernor();
    for (let i = 0; i < 1200; i++) expect(r.update(16.7, 2)).toBe(false);
    expect(r.cap).toBe(Infinity);
  });

  it('steps the pixel ratio down a notch when frames stay slow', () => {
    const r = new ResolutionGovernor();
    let dropped = false;
    for (let i = 0; i < 300 && !dropped; i++) dropped = r.update(i < 60 ? 16.7 : 50, 2);
    expect(dropped).toBe(true);
    expect(r.cap).toBe(1.5);
  });

  it('ignores slow frames while a pattern starts up', () => {
    const r = new ResolutionGovernor(1500, 2000);
    for (let i = 0; i < 30; i++) expect(r.update(50, 2)).toBe(false); // 1.5 s of grace
  });

  it('never goes below the last notch, and starts over on reset', () => {
    const r = new ResolutionGovernor(0, 100);
    let ratio = 2;
    for (let i = 0; i < 2000; i++) if (r.update(i % 2 ? 16.7 : 80, ratio)) ratio = r.cap;
    expect(r.cap).toBe(PIXEL_RATIO_NOTCHES.at(-1));
    r.reset();
    expect(r.cap).toBe(Infinity);
  });
});
