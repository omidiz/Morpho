import { describe, expect, it } from 'vitest';
import { decayFromFade, depositPerAgent, seedAgents, toRadians, turnRadians } from './physarum';
import { cpuCrowd, SlimeSim, spawnAgents, type SlimeStep } from './physarumCpu';
import { mulberry32 } from './rng';

function settings(sim: SlimeSim, decay = decayFromFade(0.45)): SlimeStep {
  return {
    active: sim.count,
    angle: toRadians(22.5),
    turn: turnRadians(0.3),
    speed: 1,
    reach: 9,
    keep: 1 - decay,
    deposit: depositPerAgent(sim.width * sim.height, sim.count, decay),
    bounce: false,
    senseCap: 1.5,
    trailMax: 200,
    diffuse: 0.15,
  };
}

describe('SlimeSim', () => {
  it('settles at an average trail of 1, as the GPU version does', () => {
    const sim = new SlimeSim(64, 48, seedAgents(1, 0, 64, 48, 0, 3000), 1);
    const s = settings(sim);
    for (let i = 0; i < 600; i++) sim.step(s);
    const mean = sim.trail.reduce((a, b) => a + b, 0) / sim.trail.length;
    expect(mean).toBeGreaterThan(0.9);
    expect(mean).toBeLessThan(1.1);
  });

  it('keeps explorers on the map and gathers trail into veins', () => {
    const sim = new SlimeSim(64, 64, seedAgents(2, 0, 64, 64, 0, 4000), 2);
    const s = settings(sim);
    for (let i = 0; i < 300; i++) sim.step(s);
    for (let i = 0; i < sim.agents.length; i += 4) {
      expect(sim.agents[i]).toBeGreaterThanOrEqual(0);
      expect(sim.agents[i]).toBeLessThan(1);
      expect(sim.agents[i + 2]).toBeGreaterThanOrEqual(0);
      expect(sim.agents[i + 2]).toBeLessThan(Math.PI * 2);
    }
    // Veins: a few cells hold much more than the average, many hold little.
    const sorted = [...sim.trail].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.95)]).toBeGreaterThan(2);
    expect(sorted[Math.floor(sorted.length * 0.3)]).toBeLessThan(0.5);
  });

  it('is the same every time for the same seed', () => {
    const run = () => {
      const sim = new SlimeSim(32, 32, seedAgents(9, 1, 32, 32, 0, 500), 9);
      const s = settings(sim);
      for (let i = 0; i < 50; i++) sim.step(s);
      return [...sim.trail];
    };
    expect(run()).toEqual(run());
  });

  it('draws the crowd toward food', () => {
    const run = (withFood: boolean) => {
      const sim = new SlimeSim(64, 64, seedAgents(4, 0, 64, 64, 0, 3000), 4);
      if (withFood) sim.setFood([{ x: 48, y: 48, strength: 1 }], { reach: 12, pull: 1.2, radius: 2, rate: 1 });
      const s = settings(sim);
      for (let i = 0; i < 200; i++) sim.step(s);
      let near = 0;
      for (let i = 0; i < sim.agents.length; i += 4) {
        if (Math.hypot(sim.agents[i] * 64 - 48, sim.agents[i + 1] * 64 - 48) < 10) near++;
      }
      return near;
    };
    expect(run(true)).toBeGreaterThan(run(false) * 1.5);
  });

  it('turns back at the edges when bouncing', () => {
    const sim = new SlimeSim(32, 32, seedAgents(5, 0, 32, 32, 0, 800), 5);
    const s = { ...settings(sim), bounce: true, speed: 3 };
    for (let i = 0; i < 100; i++) sim.step(s);
    for (let i = 0; i < sim.agents.length; i += 4) {
      expect(sim.agents[i]).toBeLessThan(1);
      expect(sim.agents[i + 1]).toBeLessThan(1);
    }
  });
});

describe('spawnAgents', () => {
  it('keeps the first explorers and clones the rest near them', () => {
    const src = seedAgents(3, 0, 50, 50, 0, 100);
    const out = spawnAgents(src, 100, 300, [0, 0], [1, 1], [0.01, 0.01], mulberry32(1));
    expect([...out.subarray(0, 400)].map((v) => Number(v.toFixed(5)))).toEqual([...src].map((v) => Number(v.toFixed(5))));
    for (let j = 100; j < 300; j++) {
      const i = j % 100;
      const x = src[i * 4];
      const y = src[i * 4 + 1];
      // Clones nudged off the map are placed afresh, as on the GPU.
      if (Math.min(x, y, 1 - x, 1 - y) < 0.005) continue;
      expect(Math.abs(out[j * 4] - x)).toBeLessThanOrEqual(0.005 + 1e-6);
      expect(Math.abs(out[j * 4 + 1] - y)).toBeLessThanOrEqual(0.005 + 1e-6);
    }
  });

  it('only places explorers inside the window, mapped to fill it', () => {
    const src = seedAgents(3, 0, 50, 50, 0, 2000);
    const out = spawnAgents(src, 2000, 1000, [0.25, 0.25], [0.5, 0.5], [0, 0], mulberry32(2));
    for (let j = 0; j < 1000; j++) {
      expect(out[j * 4]).toBeGreaterThanOrEqual(0);
      expect(out[j * 4]).toBeLessThan(1);
    }
    // Anyone already inside the window keeps their place in it.
    for (let j = 0; j < 1000; j++) {
      const x = (src[j * 4] - 0.25) / 0.5;
      const y = (src[j * 4 + 1] - 0.25) / 0.5;
      if (x >= 0 && x < 1 && y >= 0 && y < 1) expect(out[j * 4]).toBeCloseTo(x, 5);
    }
  });
});

describe('cpuCrowd', () => {
  it('matches the GPU crowd density on its own map', () => {
    expect(cpuCrowd(300_000, 400_000, 40_000, 1e7, 1e6)).toBe(30_000);
  });

  it('stays within the budget and what the picture can show', () => {
    expect(cpuCrowd(1_000_000, 400_000, 90_000, 1e7, 60_000)).toBe(60_000);
    expect(cpuCrowd(300_000, 40_000, 40_000, 20_000, 60_000)).toBe(10_000);
    expect(cpuCrowd(20, 400_000, 40_000, 1e7, 60_000)).toBe(256);
  });
});
