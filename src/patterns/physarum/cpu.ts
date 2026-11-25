import { FrameGovernor, StepAccumulator } from '../../logic/governor';
import { resampleField } from '../../logic/grayScottCpu';
import type { ParamValues } from '../../logic/params';
import {
  addFood,
  AGENTS_PER_UNIT,
  decayFromFade,
  DECAY_MIN,
  depositPerAgent,
  dropsAlong,
  exportPlan,
  foodRate,
  seedAgents,
  toRadians,
  trailGrid,
  turnRadians,
  type Food,
  type TrailGrid,
} from '../../logic/physarum';
import { cpuCrowd, SlimeSim, spawnAgents, type FoodSpot, type SlimeStep } from '../../logic/physarumCpu';
import { mixSeed, mulberry32 } from '../../logic/rng';
import { shadeTrail, toneTable } from '../../logic/shade';
import { rampStops, type Palette } from '../../palettes';
import { context2d, imageCanvas, nextFrame, paintInBands, paletteStops, Raster } from '../cpu';
import type { ExportOptions, PatternInstance, PatternOptions, Point } from '../types';
import {
  DIFFUSE,
  EXPOSURE,
  FOOD_DOT_CSS,
  FOOD_PEAK,
  FOOD_PULL,
  FOOD_RADIUS_CSS,
  FOOD_REACH_CSS,
  FOOD_SPACING_CSS,
  foodStrength,
  MIN_BUDGET,
  SENSE_CAP,
  STEP_TRIM_BELOW,
  STEPS_PER_FRAME,
  TRAIL_MAX,
} from './tuning';

/**
 * The CPU's map and crowd. Much smaller than the GPU's, so the network is
 * coarser, but it grows by the same rules.
 */
const CPU_MAX_CELLS = 90_000;
const CPU_MAX_AGENTS = 60_000;
/** Explorers who keep moving however slow frames get. */
const CPU_MIN_ACTIVE = 2_000;
/** An export regrows on a finer map, within what the CPU can do in a few seconds. */
const CPU_EXPORT = { maxCells: 300_000, maxAgents: 120_000, steps: 80 };
/** Export work per frame, in explorer steps plus map cells. */
const CPU_EXPORT_WORK_PER_FRAME = 1_200_000;

/** The slime mold on the CPU, for browsers without WebGL2. */
export class CpuSlimeInstance implements PatternInstance {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly raster = new Raster();
  private sim: SlimeSim | null = null;
  private grid: TrailGrid | null = null;
  private width = 0;
  private height = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private pixelRatio = 1;
  private seed: number;
  private params: ParamValues;
  private tone: Float32Array;
  private top: string;
  private foods: Food[] = [];
  private lastDrop: Point | null = null;
  private readonly governor = new FrameGovernor(MIN_BUDGET);
  private readonly accumulator = new StepAccumulator();
  private exporting = false;

  constructor({ canvas, seed, params, palette }: PatternOptions) {
    this.ctx = context2d(canvas);
    this.seed = seed;
    this.params = { ...params };
    this.tone = toneTable(paletteStops(palette));
    this.top = rampStops(palette).at(-1)!;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.cssWidth = width / pixelRatio;
    this.cssHeight = height / pixelRatio;
    if (this.cssWidth <= 0 || this.cssHeight <= 0) return;
    const next = trailGrid(this.cssWidth, this.cssHeight, CPU_MAX_CELLS);
    const prev = this.grid;
    this.grid = next;
    if (!prev || !this.sim) return this.reseed();
    if (prev.width === next.width && prev.height === next.height) return;
    // Explorers live in 0..1 map space, so only the trail needs carrying over.
    const trail = resampleField(this.sim.trail, prev.width, prev.height, 1, next.width, next.height);
    this.sim = new SlimeSim(next.width, next.height, this.regrow(this.sim), this.seed, trail);
  }

  setParams(params: ParamValues): void {
    const countChanged = params.agents !== this.params.agents;
    this.params = { ...params };
    if (countChanged && this.sim && this.grid) {
      this.sim = new SlimeSim(this.grid.width, this.grid.height, this.regrow(this.sim), this.seed, this.sim.trail);
    }
  }

  setPalette(palette: Palette): void {
    this.tone = toneTable(paletteStops(palette));
    this.top = rampStops(palette).at(-1)!;
  }

  reset(seed: number): void {
    this.seed = seed;
    this.foods = [];
    this.lastDrop = null;
    this.reseed();
  }

  paint(from: Point, to: Point): void {
    if (from === to || !this.lastDrop) {
      this.foods = addFood(this.foods, to.x, to.y);
      this.lastDrop = to;
      return;
    }
    for (const p of dropsAlong(this.lastDrop, to, this.cssWidth, this.cssHeight, FOOD_SPACING_CSS)) {
      this.foods = addFood(this.foods, p.x, p.y);
      this.lastDrop = p;
    }
  }

  step(dtMs: number): void {
    const { sim, grid } = this;
    if (!sim || !grid || this.exporting) return;
    const budget = this.governor.update(dtMs);
    const steps = this.accumulator.next(STEPS_PER_FRAME, dtMs, Math.min(1, budget / STEP_TRIM_BELOW));
    if (steps === 0) return;
    const active = Math.max(Math.min(sim.count, CPU_MIN_ACTIVE), Math.round(sim.count * budget));
    const settings = this.settings(active, 1, sim.width * sim.height, false);
    const cells = 1 / grid.cellSize;
    for (let i = 0; i < steps; i++) {
      for (const f of this.foods) f.age++;
      this.feed(sim, (f) => [f.x * sim.width, (1 - f.y) * sim.height], cells);
      sim.step(settings);
    }
  }

  render(): void {
    const { sim } = this;
    if (!sim || this.width === 0) return;
    const image = this.raster.pixels(sim.width, sim.height);
    shadeTrail(sim.trail, sim.width, sim.height, { data: image.data, width: sim.width, height: sim.height, row0: 0, row1: sim.height }, this.tone, EXPOSURE);
    this.raster.drawTo(this.ctx, this.width, this.height);
    this.drawFood(this.ctx, (f) => [f.x * this.width, f.y * this.height], FOOD_DOT_CSS * this.pixelRatio);
  }

  /** As on the GPU: regrow what is on screen on a finer map with a bigger crowd, then paint it at full size. */
  async renderImage(width: number, height: number, { onProgress }: ExportOptions = {}): Promise<HTMLCanvasElement> {
    const { sim: screen, grid } = this;
    if (!screen || !grid) throw new Error('Nothing to export yet');
    if (this.exporting) throw new Error('Already exporting');
    this.exporting = true;
    try {
      const plan = exportPlan(this.cssWidth, this.cssHeight, screen, screen.count, width, height, CPU_EXPORT);
      const [ox, oy] = plan.origin;
      const [sx, sy] = plan.span;
      const trail = resampleField(screen.trail, screen.width, screen.height, 1, plan.width, plan.height,
        [ox * screen.width, oy * screen.height],
        [(sx * screen.width) / plan.width, (sy * screen.height) / plan.height]);
      const agents = spawnAgents(screen.agents, screen.count, plan.agents.count, plan.origin, plan.span,
        [plan.refine / plan.width, plan.refine / plan.height], mulberry32(mixSeed(this.seed, 1)));
      const sim = new SlimeSim(plan.width, plan.height, agents, this.seed, trail);
      // Food, mapped into the image (taps are y down; maps are y up).
      const inImage = (f: Food, w: number, h: number): [number, number] => [
        ((f.x - ox) / sx) * w,
        (1 - (1 - f.y - oy) / sy) * h,
      ];
      const settings = this.settings(sim.count, plan.refine, plan.width * plan.height, true);
      this.feed(sim, (f) => {
        const [x, y] = inImage(f, plan.width, plan.height);
        return [x, plan.height - y];
      }, plan.refine / grid.cellSize);
      const perFrame = Math.max(1, Math.floor(CPU_EXPORT_WORK_PER_FRAME / (sim.count + plan.width * plan.height)));
      for (let done = 0; done < plan.steps; ) {
        const n = Math.min(perFrame, plan.steps - done);
        for (let i = 0; i < n; i++) sim.step(settings);
        done += n;
        onProgress?.(0.85 * (done / plan.steps));
        await nextFrame();
      }

      const out = imageCanvas(width, height);
      const image = out.ctx.createImageData(width, height);
      const tone = this.tone;
      await paintInBands(
        out.ctx,
        image,
        (row0, row1) => shadeTrail(sim.trail, sim.width, sim.height, { data: image.data, width, height, row0, row1 }, tone, EXPOSURE),
        onProgress,
        0.85,
      );
      this.drawFood(out.ctx, (f) => inImage(f, width, height), FOOD_DOT_CSS * (width / (sx * this.cssWidth)));
      return out.canvas;
    } finally {
      this.exporting = false;
    }
  }

  dispose(): void {
    this.sim = null;
    this.raster.dispose();
  }

  /** Step settings for a map of `cells` cells, `refine` times finer than the screen's. */
  private settings(active: number, refine: number, cells: number, bounce: boolean): SlimeStep {
    const decay = decayFromFade(this.params.fade, DECAY_MIN);
    return {
      active,
      angle: toRadians(this.params.angle),
      turn: turnRadians(this.params.turn),
      speed: refine,
      reach: this.params.reach * refine,
      keep: 1 - decay,
      deposit: depositPerAgent(cells, active, decay),
      bounce,
      senseCap: SENSE_CAP,
      trailMax: TRAIL_MAX,
      diffuse: DIFFUSE,
    };
  }

  /** Hand the food to `sim`: `at` places each in its cells (y up); `cells` is cells per CSS pixel. */
  private feed(sim: SlimeSim, at: (f: Food) => [number, number], cells: number): void {
    const spots: FoodSpot[] = this.foods.map((f) => {
      const [x, y] = at(f);
      return { x, y, strength: foodStrength(f) };
    });
    const decay = decayFromFade(this.params.fade, DECAY_MIN);
    sim.setFood(spots, {
      reach: FOOD_REACH_CSS * cells,
      pull: FOOD_PULL,
      radius: FOOD_RADIUS_CSS * cells,
      rate: foodRate(decay, FOOD_PEAK),
    });
  }

  /** The glowing dots where food lies; `at` places each in canvas pixels (y down). */
  private drawFood(ctx: CanvasRenderingContext2D, at: (f: Food) => [number, number], radius: number): void {
    for (const f of this.foods) {
      const w = foodStrength(f);
      if (w <= 0) continue;
      const [x, y] = at(f);
      // The GPU dot: a solid core, softening out to a faint halo three radii out.
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
      for (const d of [0, 0.55, 0.8, 1, 1.5, 2, 2.5, 3]) {
        const t = Math.min(1, Math.max(0, (d - 0.55) / 0.45));
        const core = 1 - t * t * (3 - 2 * t);
        const halo = Math.exp(-d * d * 0.35) * 0.35;
        g.addColorStop(d / 3, withAlpha(this.top, Math.min(1, core + halo) * w));
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Lay the crowd out afresh from the seed, on a clean map. */
  private reseed(): void {
    const grid = this.grid;
    if (!grid) return;
    const count = this.crowdSize();
    const agents = seedAgents(this.seed, this.params.start, grid.width, grid.height, 0, count);
    this.sim = new SlimeSim(grid.width, grid.height, agents, this.seed);
  }

  /** The crowd for the current size and slider: everyone already out there, plus clones. */
  private regrow(sim: SlimeSim): Float32Array {
    const count = this.crowdSize();
    if (count === sim.count) return sim.agents;
    const jitter: [number, number] = [2 / sim.width, 2 / sim.height];
    return spawnAgents(sim.agents, sim.count, count, [0, 0], [1, 1], jitter, mulberry32(mixSeed(this.seed, count)));
  }

  private crowdSize(): number {
    const grid = this.grid!;
    const gpu = trailGrid(this.cssWidth, this.cssHeight);
    return cpuCrowd(
      this.params.agents * AGENTS_PER_UNIT,
      gpu.width * gpu.height,
      grid.width * grid.height,
      this.width * this.height,
      CPU_MAX_AGENTS,
    );
  }
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(3)})`;
}
