import { hexToRgb } from '../../logic/color';
import { FrameGovernor, StepAccumulator } from '../../logic/governor';
import type { ParamSpec, ParamValues } from '../../logic/params';
import {
  activeRows,
  addFood,
  agentGrid,
  AGENTS_PER_UNIT,
  decayFromFade,
  DECAY_MIN,
  DECAY_MIN_HALF_FLOAT,
  depositPerAgent,
  dropsAlong,
  exportPlan,
  foodRate,
  formatAgents,
  formatDegrees,
  MAX_FOOD,
  seedAgents,
  START_LAYOUTS,
  START_SCATTER,
  START_SPROUT,
  toRadians,
  trailGrid,
  turnRadians,
  type AgentGrid,
  type Food,
  type TrailGrid,
} from '../../logic/physarum';
import { MAX_STOPS, rampStops, type Palette } from '../../palettes';
import {
  canRenderTo,
  createProgram,
  createTarget,
  deleteTarget,
  FULLSCREEN_VS,
  readTiles,
  waitForGpu,
  type FloatFormat,
  type Program,
  type RenderTarget,
} from '../gl';
import {
  UnsupportedError,
  type ExploreRules,
  type ExportOptions,
  type Pattern,
  type PatternInstance,
  type PatternOptions,
  type Point,
  type Preset,
} from '../types';
import { AGENT_FS, DEPOSIT_FS, DEPOSIT_VS, DIFFUSE_FS, DISPLAY_FS, RESAMPLE_FS, SPAWN_FS } from './shaders';

const PARAMS: ParamSpec[] = [
  { key: 'agents', label: 'Explorers', min: 20, max: 1000, step: 10, default: 300, format: formatAgents },
  { key: 'angle', label: 'Feeler angle', min: 5, max: 90, step: 0.5, default: 22.5, format: formatDegrees },
  { key: 'turn', label: 'Turn speed', min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: 'fade', label: 'Trail fade', min: 0, max: 1, step: 0.01, default: 0.45 },
  // Set by the looks only: how far ahead the feelers reach (in map cells, about a CSS pixel each)…
  { key: 'reach', label: 'Reach', min: 2, max: 40, step: 0.5, default: 9, control: 'hidden' },
  // …and how the explorers are laid out at the start.
  {
    key: 'start',
    label: 'Start',
    min: 0,
    max: START_LAYOUTS.length - 1,
    step: 1,
    default: START_SCATTER,
    control: 'hidden',
    options: START_LAYOUTS,
  },
];

const PRESETS: Preset[] = [
  {
    id: 'veins',
    name: 'Veins',
    values: { agents: 300, angle: 22.5, turn: 0.3, fade: 0.45, reach: 9, start: START_SCATTER },
  },
  {
    id: 'roots',
    name: 'Roots',
    values: { agents: 300, angle: 45, turn: 0.3, fade: 0.3, reach: 10, start: START_SPROUT },
  },
  {
    id: 'neurons',
    name: 'Neurons',
    values: { agents: 300, angle: 45, turn: 1, fade: 0.55, reach: 5, start: START_SCATTER },
  },
  {
    id: 'galaxy-web',
    name: 'Galaxy web',
    values: { agents: 300, angle: 30, turn: 0.1, fade: 0.35, reach: 16, start: START_SCATTER },
  },
];

/**
 * Randomize: stay near one of the looks (its start layout included), where
 * the network holds together; leave the crowd size alone, as it is more a
 * matter of what the device can do than of the look.
 */
const EXPLORE: ExploreRules = {
  angle: { jitter: 8 },
  turn: { jitter: 0.12 },
  fade: { jitter: 0.15 },
  reach: { jitter: 3 },
  start: { jitter: 0 },
};

/** Simulation steps per 60 Hz frame. Explorers walk one map cell per step. */
const STEPS_PER_FRAME = 2;
/** Below this budget the governor also trims steps, not just explorers. */
const STEP_TRIM_BELOW = 0.35;
/**
 * Feelers can't tell trail apart above this (a multiple of the map's
 * average): where a crowd piles up, the trail feels flat and explorers
 * drift out along the veins again, rather than collapsing into a blob.
 */
const SENSE_CAP = 1.5;
/** Most trail a cell can hold, to keep half floats in range. */
const TRAIL_MAX = 200;
/**
 * Share of each cell's trail that spreads to its neighbors per step. Low,
 * so veins stay crisp instead of haloed (halo width ≈ √(DIFFUSE / decay)).
 */
const DIFFUSE = 0.15;
/** Trail (averaging 1 over the map) → color: 1 − exp(−trail · EXPOSURE). */
const EXPOSURE = 0.16;
/**
 * Food: how strongly it glows in the trail (a multiple of the average), how
 * far off explorers feel it and how hard it pulls (beside SENSE_CAP), the
 * dot's size, and how fast it appears.
 */
const FOOD_PEAK = 10;
const FOOD_RADIUS_CSS = 4;
const FOOD_REACH_CSS = 30;
const FOOD_PULL = 1.2;
const FOOD_DOT_CSS = 4.5;
const FOOD_FADE_STEPS = 40;
/** Dragging drops food this far apart, in CSS pixels. */
const FOOD_SPACING_CSS = 40;
/** Export work per frame, in explorer steps, so the page stays responsive. */
const EXPORT_AGENT_STEPS_PER_FRAME = 10_000_000;
/** Exports are drawn and read back in tiles no bigger than this. */
const EXPORT_TILE = 1024;

export const physarum: Pattern = {
  id: 'slime',
  name: 'Slime',
  params: PARAMS,
  presets: PRESETS,
  explore: EXPLORE,
  // A small crowd: the preview runs beside the real thing.
  thumbnail: { zoom: 2, params: { agents: 30 } },
  hint: 'Tap to drop food. The network will find its way to it.',
  create: (options) => new PhysarumInstance(options),
};

/** Explorer states, ping-ponged; `targets[cur]` is the latest. */
interface Crowd {
  targets: [RenderTarget, RenderTarget];
  cur: number;
  grid: AgentGrid;
}

/** The trail map, ping-ponged; `targets[cur]` is the latest. */
interface Field {
  targets: [RenderTarget, RenderTarget];
  cur: number;
  width: number;
  height: number;
}

/** What one simulation step needs to know, on screen or for an export. */
interface StepSettings {
  /** Explorer rows to move (the rest wait where they are). */
  rows: number;
  angle: number;
  turn: number;
  /** Map cells per step for walking and for the feelers. */
  speed: number;
  reach: number;
  keep: number;
  deposit: number;
  bounce: boolean;
  /** (x, y in cells, strength 0..1, 0) per food source. */
  food: Float32Array;
  foodCount: number;
  /** Size of each food's glow in the trail, and how far off it is felt, in cells. */
  foodRadius: number;
  foodReach: number;
  /** Trail added per step at a food's center, at full strength. */
  foodRate: number;
}

class PhysarumInstance implements PatternInstance {
  private readonly gl: WebGL2RenderingContext;
  private readonly agentFormat: FloatFormat;
  private readonly trailFormat: FloatFormat;
  private readonly minDecay: number;
  private readonly vao: WebGLVertexArrayObject;
  private readonly agentProg: Program;
  private readonly depositProg: Program;
  private readonly diffuseProg: Program;
  private readonly resampleProg: Program;
  private readonly spawnProg: Program;
  private readonly displayProg: Program;

  private crowd: Crowd | null = null;
  private field: Field | null = null;
  private grid: TrailGrid | null = null;

  private cssWidth = 0;
  private cssHeight = 0;
  private pixelRatio = 1;
  private seed: number;
  private params: ParamValues;
  private readonly colors = new Float32Array(MAX_STOPS * 3);
  private stops = 2;
  private foods: Food[] = [];
  private lastDrop: Point | null = null;
  private readonly foodCells = new Float32Array(MAX_FOOD * 4);
  private readonly foodPixels = new Float32Array(MAX_FOOD * 4);
  private frame = 0;
  private exporting = false;
  private readonly governor = new FrameGovernor();
  private readonly accumulator = new StepAccumulator();

  constructor({ canvas, seed, params, palette }: PatternOptions) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new UnsupportedError('WebGL2 is not available');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new UnsupportedError('Float render targets are not available');
    const agentFormat = { internalFormat: gl.RGBA32F, label: 'RGBA32F' };
    if (!canRenderTo(gl, agentFormat)) throw new UnsupportedError('Float render targets are not available');
    // Full floats where they can be blended and filtered; half floats otherwise.
    const full = { internalFormat: gl.R32F, label: 'R32F' };
    const half = { internalFormat: gl.R16F, label: 'R16F' };
    const fullOk =
      !!gl.getExtension('EXT_float_blend') && !!gl.getExtension('OES_texture_float_linear') && canRenderTo(gl, full);
    const trailFormat = fullOk ? full : half;
    if (!fullOk && !canRenderTo(gl, half)) throw new UnsupportedError('Float render targets are not available');

    this.gl = gl;
    this.agentFormat = agentFormat;
    this.trailFormat = trailFormat;
    this.minDecay = fullOk ? DECAY_MIN : DECAY_MIN_HALF_FLOAT;
    this.vao = gl.createVertexArray()!;
    this.agentProg = createProgram(gl, FULLSCREEN_VS, AGENT_FS, [
      'uAgents', 'uTrail', 'uGrid', 'uAngle', 'uReach', 'uTurn', 'uSpeed', 'uFrame', 'uBounce', 'uCap',
      'uFood', 'uFoodCount', 'uFoodReach', 'uFoodPull',
    ]);
    this.depositProg = createProgram(gl, DEPOSIT_VS, DEPOSIT_FS, ['uAgents', 'uWidth', 'uAmount']);
    this.diffuseProg = createProgram(gl, FULLSCREEN_VS, DIFFUSE_FS, [
      'uTrail', 'uGrid', 'uKeep', 'uDiffuse', 'uCap', 'uFood', 'uFoodCount', 'uFoodRadius', 'uFoodRate',
    ]);
    this.resampleProg = createProgram(gl, FULLSCREEN_VS, RESAMPLE_FS, ['uSrc', 'uDst', 'uOrigin', 'uSpan']);
    this.spawnProg = createProgram(gl, FULLSCREEN_VS, SPAWN_FS, [
      'uSrc', 'uSrcWidth', 'uSrcCount', 'uDstWidth', 'uOrigin', 'uSpan', 'uJitter',
    ]);
    this.displayProg = createProgram(gl, FULLSCREEN_VS, DISPLAY_FS, [
      'uTrail', 'uResolution', 'uOffset', 'uExposure', 'uFood', 'uFoodCount', 'uColors', 'uStops',
    ]);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.vao);

    this.seed = seed;
    this.params = { ...params };
    this.setPalette(palette);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.cssWidth = width / pixelRatio;
    this.cssHeight = height / pixelRatio;
    this.pixelRatio = pixelRatio;
    this.rebuildField();
    if (!this.crowd) this.reseed();
  }

  setParams(params: ParamValues): void {
    const countChanged = params.agents !== this.params.agents;
    this.params = { ...params };
    if (countChanged && this.crowd) this.regrowCrowd();
  }

  setPalette(palette: Palette): void {
    const stops = rampStops(palette).slice(0, MAX_STOPS);
    stops.forEach((hex, i) => this.colors.set(hexToRgb(hex), i * 3));
    this.stops = stops.length;
  }

  reset(seed: number): void {
    this.seed = seed;
    this.foods = [];
    this.lastDrop = null;
    if (this.field) this.reseed();
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
    if (!this.crowd || !this.field || this.gl.isContextLost() || this.exporting) return;
    const budget = this.governor.update(dtMs);
    const steps = this.accumulator.next(STEPS_PER_FRAME, dtMs, Math.min(1, budget / STEP_TRIM_BELOW));
    if (steps === 0) return;
    // When frames drop, the crowd thins first; the trail per explorer rises to match.
    const rows = activeRows(this.crowd.grid.rows, budget);
    const field = this.field;
    const decay = this.decay();
    for (let i = 0; i < steps; i++) {
      for (const f of this.foods) f.age++;
      const cells = 1 / (this.grid?.cellSize ?? 1);
      const foodCount = this.writeFood(this.foodCells, (f) => [
        f.x * field.width,
        (1 - f.y) * field.height,
        foodStrength(f),
        0,
      ]);
      this.simulate(this.crowd, field, {
        rows,
        angle: toRadians(this.params.angle),
        turn: turnRadians(this.params.turn),
        speed: 1,
        reach: this.params.reach,
        keep: 1 - decay,
        deposit: depositPerAgent(field.width * field.height, rows * this.crowd.grid.width, decay),
        bounce: false,
        food: this.foodCells,
        foodCount,
        foodRadius: FOOD_RADIUS_CSS * cells,
        foodReach: FOOD_REACH_CSS * cells,
        foodRate: foodRate(decay, FOOD_PEAK),
      });
    }
  }

  render(): void {
    const gl = this.gl;
    if (!this.field || gl.isContextLost()) return;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const foodCount = this.writeFood(this.foodPixels, (f) => [
      f.x * w,
      (1 - f.y) * h,
      FOOD_DOT_CSS * this.pixelRatio,
      foodStrength(f),
    ]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    this.useDisplay(this.field.targets[this.field.cur], w, h, foodCount);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Copy what is on screen onto a map sized for the image, with a crowd
   * dense enough to fill it, let it grow there for a moment so the veins
   * sharpen at full resolution, then draw it at width × height. The screen
   * stays paused on the current state until this finishes.
   */
  async renderImage(
    width: number,
    height: number,
    { onProgress }: ExportOptions = {},
  ): Promise<HTMLCanvasElement> {
    const gl = this.gl;
    if (!this.crowd || !this.field || gl.isContextLost()) throw new Error('Nothing to export yet');
    if (this.exporting) throw new Error('Already exporting');
    const plan = exportPlan(this.cssWidth, this.cssHeight, this.field, this.crowd.grid.count, width, height);
    const maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0]);
    if (plan.width > maxSize || plan.height > maxSize || plan.agents.rows > maxSize) {
      throw new Error('Image is too large for this device');
    }

    this.exporting = true;
    const field: Field = {
      targets: [this.trailTarget(plan.width, plan.height), this.trailTarget(plan.width, plan.height)],
      cur: 0,
      width: plan.width,
      height: plan.height,
    };
    const crowd: Crowd = {
      targets: [this.agentTarget(plan.agents), this.agentTarget(plan.agents)],
      cur: 0,
      grid: plan.agents,
    };
    try {
      const [ox, oy] = plan.origin;
      const [sx, sy] = plan.span;
      this.resample(this.field.targets[this.field.cur], field.targets[0], field, plan.origin, plan.span);
      this.spawn(this.crowd, crowd.targets[0], plan.agents, plan.origin, plan.span, [
        plan.refine / plan.width,
        plan.refine / plan.height,
      ]);

      // Food, mapped into the image (taps are y down; maps are y up).
      const toImage = (f: Food, w: number, h: number): [number, number] => [
        ((f.x - ox) / sx) * w,
        ((1 - f.y - oy) / sy) * h,
      ];
      const decay = this.decay();
      const cellScale = plan.refine / (this.grid?.cellSize ?? 1);
      const food = new Float32Array(MAX_FOOD * 4);
      const foodCount = this.writeFood(food, (f) => [...toImage(f, plan.width, plan.height), foodStrength(f), 0]);
      const settings: StepSettings = {
        rows: plan.agents.rows,
        angle: toRadians(this.params.angle),
        turn: turnRadians(this.params.turn),
        speed: plan.refine,
        reach: this.params.reach * plan.refine,
        keep: 1 - decay,
        deposit: depositPerAgent(plan.width * plan.height, plan.agents.count, decay),
        bounce: true,
        food,
        foodCount,
        foodRadius: FOOD_RADIUS_CSS * cellScale,
        foodReach: FOOD_REACH_CSS * cellScale,
        foodRate: foodRate(decay, FOOD_PEAK),
      };
      const perFrame = Math.max(1, Math.floor(EXPORT_AGENT_STEPS_PER_FRAME / plan.agents.count));
      for (let done = 0; done < plan.steps; ) {
        const n = Math.min(perFrame, plan.steps - done);
        for (let i = 0; i < n; i++) this.simulate(crowd, field, settings);
        done += n;
        await waitForGpu(gl);
        if (gl.isContextLost()) throw new Error('Lost the graphics context');
        onProgress?.(0.9 * (done / plan.steps));
      }

      const pxPerCss = width / (sx * this.cssWidth);
      const dotCount = this.writeFood(this.foodPixels, (f) => [
        ...toImage(f, width, height),
        FOOD_DOT_CSS * pxPerCss,
        foodStrength(f),
      ]);
      const tileSize = Math.min(EXPORT_TILE, maxSize);
      return readTiles(
        gl,
        width,
        height,
        tileSize,
        (x0, y0) => {
          this.useDisplay(field.targets[field.cur], width, height, dotCount);
          gl.uniform2f(this.displayProg.uniforms.uOffset, x0, y0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        (f) => onProgress?.(0.9 + 0.1 * f),
      );
    } finally {
      if (!gl.isContextLost()) {
        field.targets.forEach((t) => deleteTarget(gl, t));
        crowd.targets.forEach((t) => deleteTarget(gl, t));
      }
      this.exporting = false;
    }
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl.isContextLost()) {
      this.crowd?.targets.forEach((t) => deleteTarget(gl, t));
      this.field?.targets.forEach((t) => deleteTarget(gl, t));
      for (const p of [
        this.agentProg,
        this.depositProg,
        this.diffuseProg,
        this.resampleProg,
        this.spawnProg,
        this.displayProg,
      ]) {
        gl.deleteProgram(p.program);
      }
      gl.deleteVertexArray(this.vao);
    }
    this.crowd = null;
    this.field = null;
    // Hand GPU memory back right away rather than waiting for GC.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private decay(): number {
    return decayFromFade(this.params.fade, this.minDecay);
  }

  /** One step: explorers move, drop trail, then the trail spreads and fades. */
  private simulate(crowd: Crowd, field: Field, s: StepSettings): void {
    const gl = this.gl;
    const { width } = crowd.grid;
    const rows = Math.min(s.rows, crowd.grid.rows);

    // 1. Move: read explorers[cur] and the trail, write explorers[other].
    let u = this.agentProg.uniforms;
    gl.useProgram(this.agentProg.program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, field.targets[field.cur].texture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, crowd.targets[crowd.cur].texture);
    gl.uniform1i(u.uAgents, 0);
    gl.uniform1i(u.uTrail, 1);
    gl.uniform2f(u.uGrid, field.width, field.height);
    gl.uniform1f(u.uAngle, s.angle);
    gl.uniform1f(u.uReach, s.reach);
    gl.uniform1f(u.uTurn, s.turn);
    gl.uniform1f(u.uSpeed, s.speed);
    gl.uniform1ui(u.uFrame, this.frame++ & 0x3fffffff);
    gl.uniform1i(u.uBounce, s.bounce ? 1 : 0);
    gl.uniform1f(u.uCap, SENSE_CAP);
    gl.uniform4fv(u.uFood, s.food);
    gl.uniform1i(u.uFoodCount, s.foodCount);
    gl.uniform1f(u.uFoodReach, s.foodReach);
    gl.uniform1f(u.uFoodPull, FOOD_PULL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, crowd.targets[1 - crowd.cur].framebuffer);
    gl.viewport(0, 0, width, rows);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    crowd.cur = 1 - crowd.cur;

    // 2. Drop trail: one additive point per explorer that moved.
    u = this.depositProg.uniforms;
    gl.useProgram(this.depositProg.program);
    gl.bindTexture(gl.TEXTURE_2D, crowd.targets[crowd.cur].texture);
    gl.uniform1i(u.uAgents, 0);
    gl.uniform1i(u.uWidth, width);
    gl.uniform1f(u.uAmount, s.deposit);
    gl.bindFramebuffer(gl.FRAMEBUFFER, field.targets[field.cur].framebuffer);
    gl.viewport(0, 0, field.width, field.height);
    gl.enable(gl.BLEND);
    gl.drawArrays(gl.POINTS, 0, rows * width);
    gl.disable(gl.BLEND);

    // 3. Spread, fade and feed: trail[cur] → trail[other].
    u = this.diffuseProg.uniforms;
    gl.useProgram(this.diffuseProg.program);
    gl.bindTexture(gl.TEXTURE_2D, field.targets[field.cur].texture);
    gl.uniform1i(u.uTrail, 0);
    gl.uniform2f(u.uGrid, field.width, field.height);
    gl.uniform1f(u.uKeep, s.keep);
    gl.uniform1f(u.uCap, TRAIL_MAX);
    gl.uniform1f(u.uDiffuse, DIFFUSE);
    gl.uniform4fv(u.uFood, s.food);
    gl.uniform1i(u.uFoodCount, s.foodCount);
    gl.uniform1f(u.uFoodRadius, s.foodRadius);
    gl.uniform1f(u.uFoodRate, s.foodRate);
    gl.bindFramebuffer(gl.FRAMEBUFFER, field.targets[1 - field.cur].framebuffer);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    field.cur = 1 - field.cur;
  }

  /** Bind the display program for drawing `trail` into a width × height image. */
  private useDisplay(trail: RenderTarget, width: number, height: number, foodCount: number): void {
    const gl = this.gl;
    const u = this.displayProg.uniforms;
    gl.useProgram(this.displayProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trail.texture);
    gl.uniform1i(u.uTrail, 0);
    gl.uniform2f(u.uResolution, width, height);
    gl.uniform2f(u.uOffset, 0, 0);
    gl.uniform1f(u.uExposure, EXPOSURE);
    gl.uniform4fv(u.uFood, this.foodPixels);
    gl.uniform1i(u.uFoodCount, foodCount);
    gl.uniform3fv(u.uColors, this.colors);
    gl.uniform1i(u.uStops, this.stops);
  }

  /** Fill `out` with one vec4 per food source; returns how many. */
  private writeFood(out: Float32Array, toVec: (f: Food) => number[]): number {
    const n = Math.min(MAX_FOOD, this.foods.length);
    for (let i = 0; i < n; i++) out.set(toVec(this.foods[i]), i * 4);
    return n;
  }

  /** (Re)allocate the trail map for the current viewport, keeping what has grown. */
  private rebuildField(): void {
    const gl = this.gl;
    if (this.cssWidth <= 0 || this.cssHeight <= 0 || gl.isContextLost()) return;
    const next = trailGrid(this.cssWidth, this.cssHeight);
    const prev = this.field;
    this.grid = next;
    if (prev && prev.width === next.width && prev.height === next.height) return;
    const field: Field = {
      targets: [this.trailTarget(next.width, next.height), this.trailTarget(next.width, next.height)],
      cur: 0,
      width: next.width,
      height: next.height,
    };
    if (prev) {
      // Explorers live in 0..1 map space, so only the trail needs carrying over.
      this.resample(prev.targets[prev.cur], field.targets[0], field, [0, 0], [1, 1]);
      prev.targets.forEach((t) => deleteTarget(gl, t));
    } else {
      this.clear(field.targets[0]);
    }
    this.field = field;
  }

  /** Lay the crowd out afresh from the seed, on a clean map. */
  private reseed(): void {
    const gl = this.gl;
    if (!this.field || gl.isContextLost()) return;
    const grid = agentGrid(this.params.agents * AGENTS_PER_UNIT);
    if (!this.crowd || this.crowd.grid.rows !== grid.rows) {
      this.crowd?.targets.forEach((t) => deleteTarget(gl, t));
      this.crowd = { targets: [this.agentTarget(grid), this.agentTarget(grid)], cur: 0, grid };
    }
    const data = seedAgents(this.seed, this.params.start, this.field.width, this.field.height, 0, grid.count);
    const crowd = this.crowd;
    crowd.cur = 0;
    // Both halves, so rows that sit out while frames are slow start in place too.
    for (const t of crowd.targets) {
      gl.bindTexture(gl.TEXTURE_2D, t.texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.width, grid.rows, gl.RGBA, gl.FLOAT, data);
    }
    this.field.targets.forEach((t) => this.clear(t));
    this.frame = 0;
  }

  /** New crowd size: keep everyone who is already out there, clone more from them. */
  private regrowCrowd(): void {
    const gl = this.gl;
    const prev = this.crowd;
    if (!prev || !this.field || gl.isContextLost()) return;
    const grid = agentGrid(this.params.agents * AGENTS_PER_UNIT);
    if (grid.rows === prev.grid.rows) return;
    const crowd: Crowd = { targets: [this.agentTarget(grid), this.agentTarget(grid)], cur: 0, grid };
    const jitter: [number, number] = [2 / this.field.width, 2 / this.field.height];
    for (const t of crowd.targets) this.spawn(prev, t, grid, [0, 0], [1, 1], jitter);
    prev.targets.forEach((t) => deleteTarget(gl, t));
    this.crowd = crowd;
  }

  private spawn(
    src: Crowd,
    dst: RenderTarget,
    grid: AgentGrid,
    origin: [number, number],
    span: [number, number],
    jitter: [number, number],
  ): void {
    const gl = this.gl;
    const u = this.spawnProg.uniforms;
    gl.useProgram(this.spawnProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.targets[src.cur].texture);
    gl.uniform1i(u.uSrc, 0);
    gl.uniform1i(u.uSrcWidth, src.grid.width);
    gl.uniform1i(u.uSrcCount, src.grid.count);
    gl.uniform1i(u.uDstWidth, grid.width);
    gl.uniform2f(u.uOrigin, origin[0], origin[1]);
    gl.uniform2f(u.uSpan, span[0], span[1]);
    gl.uniform2f(u.uJitter, jitter[0], jitter[1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer);
    gl.viewport(0, 0, grid.width, grid.rows);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private resample(
    src: RenderTarget,
    dst: RenderTarget,
    size: { width: number; height: number },
    origin: [number, number],
    span: [number, number],
  ): void {
    const gl = this.gl;
    const u = this.resampleProg.uniforms;
    gl.useProgram(this.resampleProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.texture);
    gl.uniform1i(u.uSrc, 0);
    gl.uniform2f(u.uDst, size.width, size.height);
    gl.uniform2f(u.uOrigin, origin[0], origin[1]);
    gl.uniform2f(u.uSpan, span[0], span[1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer);
    gl.viewport(0, 0, size.width, size.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private clear(target: RenderTarget): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private trailTarget(width: number, height: number): RenderTarget {
    return createTarget(this.gl, this.trailFormat, width, height, this.gl.LINEAR);
  }

  private agentTarget(grid: AgentGrid): RenderTarget {
    return createTarget(this.gl, this.agentFormat, grid.width, grid.rows);
  }
}

/** Food fades in over its first few steps. */
function foodStrength(f: Food): number {
  return Math.min(1, f.age / FOOD_FADE_STEPS);
}
