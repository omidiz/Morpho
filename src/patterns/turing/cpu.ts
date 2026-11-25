import { FrameGovernor, StepAccumulator } from '../../logic/governor';
import { exportGrid, gridSize, seedField, stepsPerFrame, toFeedKill, type GridSize } from '../../logic/grayScott';
import { paintSegment, resampleField, stepGrayScott } from '../../logic/grayScottCpu';
import type { ParamValues } from '../../logic/params';
import { mulberry32, type Rng } from '../../logic/rng';
import { rampTable, shadeTuring } from '../../logic/shade';
import type { Palette } from '../../palettes';
import { context2d, imageCanvas, nextFrame, paintInBands, paletteStops, Raster } from '../cpu';
import type { ExportOptions, PatternInstance, PatternOptions, Point } from '../types';
import { BRUSH_RADIUS_CSS, EMBOSS } from './tuning';

/**
 * Cells the CPU simulates on screen. Far fewer than the GPU's, so the grid
 * is coarser and the pattern a little larger, but it grows the same way.
 */
const CPU_MAX_CELLS = 40_000;
/** Cells for an export, and the work done per frame while growing it. */
const CPU_EXPORT_MAX_CELLS = 300_000;
const CPU_EXPORT_CELL_STEPS_PER_FRAME = 1_500_000;
/** Screen pixels painted per grid cell along each side; the browser smooths the rest. */
const RASTER_PER_CELL = 1.5;

/** Turing patterns on the CPU, for browsers without WebGL2. */
export class CpuTuringInstance implements PatternInstance {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly raster = new Raster();
  private field: Float32Array | null = null;
  private spare: Float32Array | null = null;
  private grid: GridSize | null = null;
  private width = 0;
  private height = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private seed: number;
  private params: ParamValues;
  private feedKill: { feed: number; kill: number };
  private ramp: Float32Array;
  private readonly governor = new FrameGovernor();
  private readonly accumulator = new StepAccumulator();
  private strokes: [Point, Point][] = [];
  private brushRng: Rng;
  private exporting = false;

  constructor({ canvas, seed, params, palette }: PatternOptions) {
    this.ctx = context2d(canvas);
    this.seed = seed;
    this.brushRng = mulberry32(seed);
    this.params = { ...params };
    this.feedKill = toFeedKill(params.food, params.fade);
    this.ramp = rampTable(paletteStops(palette));
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.cssWidth = width / pixelRatio;
    this.cssHeight = height / pixelRatio;
    this.rebuildGrid();
  }

  setParams(params: ParamValues): void {
    const scaleChanged = params.scale !== this.params.scale;
    this.params = { ...params };
    this.feedKill = toFeedKill(params.food, params.fade);
    if (scaleChanged) this.rebuildGrid();
  }

  setPalette(palette: Palette): void {
    this.ramp = rampTable(paletteStops(palette));
  }

  reset(seed: number): void {
    this.seed = seed;
    this.brushRng = mulberry32(seed);
    this.strokes = [];
    if (this.grid) this.field = seedField(this.grid.width, this.grid.height, mulberry32(seed));
  }

  paint(from: Point, to: Point): void {
    this.strokes.push([from, to]);
  }

  step(dtMs: number): void {
    if (!this.field || !this.grid || this.exporting) return;
    this.flushStrokes();
    const budget = this.governor.update(dtMs);
    const steps = this.accumulator.next(stepsPerFrame(this.params.speed), dtMs, budget);
    const { width, height } = this.grid;
    const { feed, kill } = this.feedKill;
    for (let i = 0; i < steps; i++) {
      stepGrayScott(this.field, this.spare!, width, height, feed, kill);
      [this.field, this.spare] = [this.spare!, this.field];
    }
  }

  render(): void {
    if (!this.field || !this.grid || this.width === 0) return;
    this.flushStrokes();
    const { width: gw, height: gh } = this.grid;
    const w = Math.max(1, Math.min(this.width, Math.round(gw * RASTER_PER_CELL)));
    const h = Math.max(1, Math.min(this.height, Math.round(gh * RASTER_PER_CELL)));
    const image = this.raster.pixels(w, h);
    shadeTuring(this.field, gw, gh, { data: image.data, width: w, height: h, row0: 0, row1: h }, this.ramp, EMBOSS);
    this.raster.drawTo(this.ctx, this.width, this.height);
  }

  /** As on the GPU: regrow what is on screen on a finer grid, then paint it at full size. */
  async renderImage(width: number, height: number, { onProgress }: ExportOptions = {}): Promise<HTMLCanvasElement> {
    if (!this.field || !this.grid) throw new Error('Nothing to export yet');
    if (this.exporting) throw new Error('Already exporting');
    this.flushStrokes();
    this.exporting = true;
    try {
      const screen = this.grid;
      const plan = exportGrid(this.cssWidth, this.cssHeight, screen, width, height, CPU_EXPORT_MAX_CELLS);
      let field: Float32Array = resampleField(this.field, screen.width, screen.height, 2, plan.width, plan.height, plan.origin, plan.stride);
      let spare: Float32Array = new Float32Array(field.length);
      const { feed, kill } = this.feedKill;
      const perFrame = Math.max(1, Math.floor(CPU_EXPORT_CELL_STEPS_PER_FRAME / (plan.width * plan.height)));
      for (let done = 0; done < plan.steps; ) {
        const n = Math.min(perFrame, plan.steps - done);
        for (let i = 0; i < n; i++) {
          stepGrayScott(field, spare, plan.width, plan.height, feed, kill, plan.reaction);
          [field, spare] = [spare, field];
        }
        done += n;
        onProgress?.(0.85 * (done / plan.steps));
        await nextFrame();
      }
      const out = imageCanvas(width, height);
      const image = out.ctx.createImageData(width, height);
      const ramp = this.ramp;
      await paintInBands(
        out.ctx,
        image,
        (row0, row1) =>
          shadeTuring(field, plan.width, plan.height, { data: image.data, width, height, row0, row1 }, ramp, EMBOSS * plan.refine),
        onProgress,
        0.85,
      );
      return out.canvas;
    } finally {
      this.exporting = false;
    }
  }

  dispose(): void {
    this.field = this.spare = null;
    this.raster.dispose();
  }

  private flushStrokes(): void {
    if (this.strokes.length === 0 || !this.field || !this.grid) return;
    const { width, height, cellSize } = this.grid;
    const radius = Math.max(2, BRUSH_RADIUS_CSS / cellSize);
    for (const [a, b] of this.strokes) {
      // Taps have y down; the field has y up.
      paintSegment(this.field, width, height, a.x * width, (1 - a.y) * height, b.x * width, (1 - b.y) * height, radius, this.brushRng);
    }
    this.strokes = [];
  }

  /** (Re)size the grid for the view and pattern size, keeping what has grown. */
  private rebuildGrid(): void {
    if (this.cssWidth <= 0 || this.cssHeight <= 0) return;
    const next = gridSize(this.cssWidth, this.cssHeight, this.params.scale, CPU_MAX_CELLS);
    const prev = this.grid;
    this.grid = next;
    if (prev && this.field && prev.width === next.width && prev.height === next.height) return;
    this.field =
      prev && this.field
        ? resampleField(this.field, prev.width, prev.height, 2, next.width, next.height)
        : seedField(next.width, next.height, mulberry32(this.seed));
    this.spare = new Float32Array(this.field.length);
  }
}
