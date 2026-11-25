import { mulberry32, type Rng } from './rng';

/**
 * The slime mold on the CPU, for browsers without WebGL2. The same rules as
 * the GPU shaders in src/patterns/physarum/shaders.ts: explorers are
 * (x, y, heading, 0) with x and y 0..1 across the map (y up); the trail is
 * one float per cell, rows from the bottom, wrapping at the edges.
 */

const TAU = Math.PI * 2;

/** What one step needs to know. Distances are in map cells. */
export interface SlimeStep {
  /** Explorers to move (the first `active`; the rest wait where they are). */
  active: number;
  angle: number;
  turn: number;
  speed: number;
  reach: number;
  /** Share of the trail kept per step. */
  keep: number;
  deposit: number;
  /** Turn back at the edges (exports) instead of wrapping around. */
  bounce: boolean;
  /** Feelers can't tell trail apart above this. */
  senseCap: number;
  /** Most trail a cell holds. */
  trailMax: number;
  /** Share of each cell's trail that spreads to its neighbors. */
  diffuse: number;
}

/** A food source: cells from the bottom left, strength 0..1. */
export interface FoodSpot {
  x: number;
  y: number;
  strength: number;
}

export interface FoodSettings {
  /** How far off explorers feel it, in cells, and how hard it pulls. */
  reach: number;
  pull: number;
  /** Size of its glow in the trail, in cells, and trail added per step at its center. */
  radius: number;
  rate: number;
}

export class SlimeSim {
  trail: Float32Array;
  private spare: Float32Array;
  /** Pull of the food on the feelers, per cell, or null when there is none. */
  private lure: Float32Array | null = null;
  private lureKey = '';
  private food: readonly FoodSpot[] = [];
  private foodSettings: FoodSettings | null = null;
  private readonly rng: Rng;

  constructor(
    readonly width: number,
    readonly height: number,
    /** (x, y, heading, 0) per explorer. */
    public agents: Float32Array,
    seed: number,
    trail?: Float32Array,
  ) {
    this.trail = trail ?? new Float32Array(width * height);
    this.spare = new Float32Array(width * height);
    this.rng = mulberry32(seed);
  }

  get count(): number {
    return this.agents.length / 4;
  }

  setFood(food: readonly FoodSpot[], settings: FoodSettings): void {
    this.food = food;
    this.foodSettings = settings;
    const key = food.length
      ? `${settings.reach},${settings.pull}:${food.map((f) => `${f.x},${f.y},${f.strength}`).join(';')}`
      : '';
    if (key === this.lureKey) return;
    this.lureKey = key;
    this.lure = food.length ? this.buildLure(food, settings) : null;
  }

  /** One step: explorers move and drop trail, then the trail spreads and fades. */
  step(s: SlimeStep): void {
    this.moveAgents(s);
    this.spread(s);
  }

  private moveAgents(s: SlimeStep): void {
    const { width: w, height: h, agents, trail, lure, rng } = this;
    const n = Math.min(s.active, this.count);
    const ca = Math.cos(s.angle);
    const sa = Math.sin(s.angle);
    const rx = s.reach / w;
    const ry = s.reach / h;
    const mx = s.speed / w;
    const my = s.speed / h;
    const cap = s.senseCap;
    const feel = (x: number, y: number): number => {
      x -= Math.floor(x);
      y -= Math.floor(y);
      const px = x * w - 0.5;
      const py = y * h - 0.5;
      let x0 = Math.floor(px);
      let y0 = Math.floor(py);
      const fx = px - x0;
      const fy = py - y0;
      if (x0 < 0) x0 = w - 1;
      if (y0 < 0) y0 = h - 1;
      const x1 = x0 + 1 === w ? 0 : x0 + 1;
      const r0 = y0 * w;
      const r1 = (y0 + 1 === h ? 0 : y0 + 1) * w;
      const lo = trail[r0 + x0] + (trail[r0 + x1] - trail[r0 + x0]) * fx;
      const hi = trail[r1 + x0] + (trail[r1 + x1] - trail[r1 + x0]) * fx;
      const v = Math.min(lo + (hi - lo) * fy, cap);
      return lure ? v + lure[Math.min(h - 1, (y * h) | 0) * w + Math.min(w - 1, (x * w) | 0)] : v;
    };
    for (let k = 0, o = 0; k < n; k++, o += 4) {
      let x = agents[o];
      let y = agents[o + 1];
      let head = agents[o + 2];
      const c = Math.cos(head);
      const sn = Math.sin(head);
      const ahead = feel(x + c * rx, y + sn * ry);
      // Rotate the heading by ±angle without more trig.
      const lc = c * ca - sn * sa;
      const ls = sn * ca + c * sa;
      const rc = c * ca + sn * sa;
      const rs = sn * ca - c * sa;
      const left = feel(x + lc * rx, y + ls * ry);
      const right = feel(x + rc * rx, y + rs * ry);
      const r = rng();
      const turn = s.turn * (0.75 + 0.5 * rng());
      if (ahead >= left && ahead >= right) head += (r - 0.5) * s.turn * 0.15;
      else if (ahead < left && ahead < right) head += r < 0.5 ? -turn : turn;
      else if (left > right) head += turn;
      else head -= turn;
      x += Math.cos(head) * mx;
      y += Math.sin(head) * my;
      if (s.bounce) {
        if (x < 0 || x >= 1 || y < 0 || y >= 1) {
          x = Math.min(0.99999, Math.max(0, x));
          y = Math.min(0.99999, Math.max(0, y));
          head = rng() * TAU;
        }
      } else {
        x -= Math.floor(x);
        y -= Math.floor(y);
      }
      head -= Math.floor(head / TAU) * TAU;
      agents[o] = x;
      agents[o + 1] = y;
      agents[o + 2] = head;
      trail[Math.min(h - 1, (y * h) | 0) * w + Math.min(w - 1, (x * w) | 0)] += s.deposit;
    }
  }

  private spread(s: SlimeStep): void {
    const { width: w, height: h, trail: src, spare: dst } = this;
    const keep = s.keep;
    const d = s.diffuse;
    const max = s.trailMax;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const up = (y === h - 1 ? 0 : y + 1) * w;
      const down = (y === 0 ? h - 1 : y - 1) * w;
      for (let x = 0; x < w; x++) {
        const l = x === 0 ? w - 1 : x - 1;
        const r = x === w - 1 ? 0 : x + 1;
        const c = src[row + x];
        const sum =
          src[row + l] + c + src[row + r] +
          src[up + l] + src[up + x] + src[up + r] +
          src[down + l] + src[down + x] + src[down + r];
        const v = (c + (sum / 9 - c) * d) * keep;
        dst[row + x] = v > max ? max : v;
      }
    }
    const f = this.foodSettings;
    if (f) {
      const r2 = f.radius * f.radius;
      const span = Math.ceil(f.radius * 3);
      for (const spot of this.food) {
        forBox(spot.x, spot.y, span, w, h, (i, d2) => {
          if (d2 < r2 * 9) dst[i] = Math.min(max, dst[i] + f.rate * spot.strength * Math.exp(-d2 / r2));
        });
      }
    }
    this.trail = dst;
    this.spare = src;
  }

  private buildLure(food: readonly FoodSpot[], f: FoodSettings): Float32Array {
    const out = new Float32Array(this.width * this.height);
    const r2 = f.reach * f.reach;
    const span = Math.ceil(f.reach * 3);
    for (const spot of food) {
      forBox(spot.x, spot.y, span, this.width, this.height, (i, d2) => {
        out[i] += f.pull * spot.strength * Math.exp(-d2 / r2);
      });
    }
    return out;
  }
}

/** Visit cells within `span` of (cx, cy) (cells, from the bottom left), clipped to the map, with squared distance. */
function forBox(
  cx: number,
  cy: number,
  span: number,
  w: number,
  h: number,
  visit: (index: number, d2: number) => void,
): void {
  const x0 = Math.max(0, Math.floor(cx - span));
  const x1 = Math.min(w - 1, Math.ceil(cx + span));
  const y0 = Math.max(0, Math.floor(cy - span));
  const y1 = Math.min(h - 1, Math.ceil(cy + span));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      visit(y * w + x, dx * dx + dy * dy);
    }
  }
}

/**
 * A crowd of `count` from `src` (`srcCount` explorers), like the GPU spawn
 * shader: explorer j copies j mod srcCount, seen through the window
 * (origin, span) of the source map. Repeats, and anyone who falls outside
 * the window, are clones of someone inside, nudged a little in place
 * (`jitter`, 0..1 map units) and in heading.
 */
export function spawnAgents(
  src: Float32Array,
  srcCount: number,
  count: number,
  origin: readonly [number, number],
  span: readonly [number, number],
  jitter: readonly [number, number],
  rng: Rng,
): Float32Array {
  const out = new Float32Array(count * 4);
  const outside = (x: number, y: number) => x < 0 || x >= 1 || y < 0 || y >= 1;
  for (let j = 0; j < count; j++) {
    let i = j % srcCount;
    let clone = j >= srcCount;
    let x = 0;
    let y = 0;
    let head = 0;
    for (let k = 0; k < 16; k++) {
      x = (src[i * 4] - origin[0]) / span[0];
      y = (src[i * 4 + 1] - origin[1]) / span[1];
      head = src[i * 4 + 2];
      if (!outside(x, y)) break;
      i = Math.min(srcCount - 1, Math.floor(rng() * srcCount));
      clone = true;
    }
    const r0 = rng();
    const r1 = rng();
    const r2 = rng();
    if (clone) {
      x += (r0 - 0.5) * jitter[0];
      y += (r1 - 0.5) * jitter[1];
      head += (r2 - 0.5) * 0.8;
    }
    if (outside(x, y)) {
      x = r0;
      y = r1;
      head = r2 * TAU;
    }
    out[j * 4] = x;
    out[j * 4 + 1] = y;
    out[j * 4 + 2] = head - Math.floor(head / TAU) * TAU;
  }
  return out;
}

/**
 * Explorers for the CPU: as many per cell of its map as the GPU crowd of
 * `gpuAgents` would have on `gpuCells`, but never more than `max`, nor more
 * than the picture has pixels to show them.
 */
export function cpuCrowd(gpuAgents: number, gpuCells: number, cpuCells: number, pixels: number, max: number): number {
  const wanted = (gpuAgents / Math.max(1, gpuCells)) * cpuCells;
  return Math.max(256, Math.round(Math.min(wanted, max, pixels / 2)));
}
