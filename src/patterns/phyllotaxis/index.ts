import { clampToSpec, type ParamSpec, type ParamValues } from '../../logic/params';
import { angleFromTurn, formatAngle, layoutHead, turnFromAngle, type Head } from '../../logic/phyllotaxis';
import { mixSeed, signedHash, unitHash } from '../../logic/rng';
import type { Palette } from '../../palettes';
import {
  UnsupportedError,
  type ExploreRules,
  type ExportOptions,
  type Pattern,
  type PatternInstance,
  type PatternOptions,
  type Preset,
} from '../types';
import { COLOR_MODES, drawHead, SHAPES } from './draw';

/** Time for a head to fill in, heart first. */
const GROW_MS = 2200;
const ROTATION = 0x0707;

/** Growing is decoration: with reduced motion, heads appear complete. */
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const ANGLE: ParamSpec = {
  key: 'angle',
  label: 'Angle',
  min: -1,
  max: 1,
  step: 0.001,
  default: 0,
  format: (turn) => formatAngle(angleFromTurn(turn)),
};

const PARAMS: ParamSpec[] = [
  ANGLE,
  { key: 'seeds', label: 'Seeds', min: 30, max: 3000, step: 10, default: 1200 },
  { key: 'size', label: 'Seed size', min: 0.3, max: 1.6, step: 0.01, default: 0.95 },
  { key: 'growth', label: 'Size growth', min: 0, max: 1, step: 0.01, default: 0.25 },
  { key: 'shape', label: 'Shape', min: 0, max: SHAPES.length - 1, step: 1, default: 0, control: 'choice', options: SHAPES },
  { key: 'color', label: 'Color by', min: 0, max: COLOR_MODES.length - 1, step: 1, default: 1, control: 'choice', options: COLOR_MODES },
];

/** The Angle slider's value for `degrees`, snapped to its step. */
const turn = (degrees: number) => clampToSpec(ANGLE, turnFromAngle(degrees));

const PRESETS: Preset[] = [
  {
    id: 'sunflower',
    name: 'Sunflower',
    values: { angle: 0, seeds: 1200, size: 0.95, growth: 0.25, shape: 0, color: 1 },
  },
  {
    id: 'pinecone',
    name: 'Pinecone',
    values: { angle: 0, seeds: 140, size: 1.3, growth: 0.6, shape: 1, color: 0 },
  },
  {
    id: 'daisy',
    name: 'Daisy',
    values: { angle: 0, seeds: 420, size: 0.9, growth: 0.1, shape: 2, color: 0 },
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    values: { angle: turn(137.1), seeds: 2600, size: 0.8, growth: 0.45, shape: 0, color: 1 },
  },
];

/**
 * Randomize: mostly close to the golden angle, where the spirals hold or
 * just begin to break into curved arms; any shape and
 * coloring; a comfortable count and size.
 */
const EXPLORE: ExploreRules = {
  angle: { jitter: 0.04 },
  seeds: { range: [200, 2400] },
  size: { range: [0.6, 1.25] },
  growth: { range: [0, 0.7] },
  // Ranges reaching half a step past each end give every choice the same odds.
  shape: { range: [-0.49, SHAPES.length - 0.51] },
  color: { range: [-0.49, COLOR_MODES.length - 0.51] },
};

export const phyllotaxis: Pattern = {
  id: 'spirals',
  name: 'Spirals',
  params: PARAMS,
  presets: PRESETS,
  hint: 'The middle of Angle is where the spirals lock together. Slide off it and back to watch them break and reform.',
  explore: EXPLORE,
  create: (options) => new SpiralsInstance(options),
};

class SpiralsInstance implements PatternInstance {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private seed: number;
  private params: ParamValues;
  private palette: Palette;
  private head: Head;
  /** Growth time so far, in ms. */
  private elapsed = 0;
  private needsDraw = true;

  constructor({ canvas, seed, params, palette }: PatternOptions) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new UnsupportedError('Canvas 2D is not available');
    this.ctx = ctx;
    this.seed = seed;
    this.params = { ...params };
    this.palette = palette;
    this.head = this.layout();
    this.regrow();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.needsDraw = true;
  }

  setParams(params: ParamValues): void {
    const prev = this.params;
    this.params = { ...params };
    if (['angle', 'seeds', 'size', 'growth'].some((k) => params[k] !== prev[k])) this.head = this.layout();
    this.needsDraw = true;
  }

  setPalette(palette: Palette): void {
    this.palette = palette;
    this.needsDraw = true;
  }

  reset(seed: number): void {
    this.seed = seed;
    this.head = this.layout();
    this.regrow();
  }

  step(dtMs: number): void {
    if (this.elapsed >= GROW_MS) return;
    this.elapsed = Math.min(GROW_MS, this.elapsed + Math.min(dtMs, 100));
    this.needsDraw = true;
  }

  render(): void {
    if (!this.needsDraw || this.width === 0) return;
    drawHead(this.ctx, this.width, this.height, this.head, this.style(this.elapsed / GROW_MS));
    this.needsDraw = false;
  }

  /** Seeds are vector, so the head is drawn afresh, complete, at the image's size. */
  async renderImage(width: number, height: number, { onProgress }: ExportOptions = {}): Promise<HTMLCanvasElement> {
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    onProgress?.(0.5);
    // Let the progress show before the (brief) drawing work.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    drawHead(ctx, width, height, this.head, this.style(1));
    onProgress?.(1);
    return out;
  }

  dispose(): void {}

  private layout(): Head {
    const p = this.params;
    const seed = this.seed;
    return layoutHead(
      { count: p.seeds, angle: angleFromTurn(p.angle), size: p.size, growth: p.growth },
      (i, salt) => signedHash(mixSeed(seed, i), salt),
    );
  }

  private style(grown: number) {
    return {
      palette: this.palette,
      shape: Math.round(this.params.shape),
      color: Math.round(this.params.color),
      rotation: unitHash(this.seed, ROTATION) * Math.PI * 2,
      grown,
    };
  }

  /** Fill the head in again from the heart (or at once, with reduced motion). */
  private regrow(): void {
    this.elapsed = reducedMotion() ? GROW_MS : 0;
    this.needsDraw = true;
  }
}
