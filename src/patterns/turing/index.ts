import { hexToRgb } from '../../logic/color';
import { FrameGovernor, StepAccumulator } from '../../logic/governor';
import {
  exportGrid,
  fromFeedKill,
  gridSize,
  seedField,
  stepsPerFrame,
  toFeedKill,
  type GridSize,
} from '../../logic/grayScott';
import type { ParamSpec, ParamValues } from '../../logic/params';
import { mulberry32 } from '../../logic/rng';
import { MAX_STOPS, rampStops, type Palette } from '../../palettes';
import {
  createProgram,
  createTarget,
  deleteTarget,
  FULLSCREEN_VS,
  pickFloatFormat,
  probeWebGL2,
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
import { CpuTuringInstance } from './cpu';
import { BRUSH_FS, DISPLAY_FS, RESAMPLE_FS, STEP_FS } from './shaders';
import { BRUSH_RADIUS_CSS, EMBOSS } from './tuning';

/**
 * Model parameters for each look, picked by sweeping the Gray-Scott map and
 * watching each candidate grow (see src/logic/grayScott.ts).
 */
const LOOKS: { id: string; name: string; feed: number; kill: number }[] = [
  { id: 'leopard', name: 'Leopard', feed: 0.022, kill: 0.05666 }, // irregular spots, a few rosettes
  { id: 'zebra', name: 'Zebra', feed: 0.0276, kill: 0.057 }, // long, mostly parallel stripes
  { id: 'coral', name: 'Coral', feed: 0.0545, kill: 0.062 }, // branching fronts that fill in
  { id: 'maze', name: 'Maze', feed: 0.0468, kill: 0.06037 }, // dense winding labyrinth
  { id: 'cells', name: 'Cells', feed: 0.0367, kill: 0.0649 }, // spots that keep dividing
];

const PRESETS: Preset[] = LOOKS.map(({ id, name, feed, kill }) => {
  const { food, fade } = fromFeedKill(feed, kill);
  return { id, name, values: { food: round3(food), fade: round3(fade) } };
});

const PARAMS: ParamSpec[] = [
  { key: 'speed', label: 'Growth speed', min: 1, max: 10, step: 1, default: 5 },
  { key: 'scale', label: 'Pattern size', min: 1, max: 4, step: 0.1, default: 2 },
  { key: 'food', label: 'Food', min: 0, max: 1, step: 0.001, default: PRESETS[2].values.food },
  { key: 'fade', label: 'Fade', min: 0, max: 1, step: 0.001, default: PRESETS[2].values.fade },
];

/**
 * Randomize: patterns only live in a thin band of the Food/Fade map, so stay
 * close to one of the looks; any comfortable size; leave speed alone.
 */
const EXPLORE: ExploreRules = {
  food: { jitter: 0.04 },
  fade: { jitter: 0.06 },
  scale: { range: [1.4, 3.2] },
};

/** Export work per frame, in cell updates, so the page stays responsive. */
const EXPORT_CELL_STEPS_PER_FRAME = 12_000_000;
/** Exports are drawn and read back in tiles no bigger than this. */
const EXPORT_TILE = 1024;

export const turing: Pattern = {
  id: 'turing',
  name: 'Turing',
  params: PARAMS,
  presets: PRESETS,
  explore: EXPLORE,
  thumbnail: { zoom: 2.5 },
  hint: 'Touch the pattern to plant new seeds.',
  create(options) {
    if (gpuReady()) {
      try {
        return new TuringInstance(options);
      } catch (err) {
        if (!(err instanceof UnsupportedError)) throw err;
      }
    }
    // No WebGL2 (or no float textures): the same pattern, smaller, on the CPU.
    return new CpuTuringInstance(options);
  },
};

let gpu: boolean | undefined;
/** Whether this browser can run the GPU version (checked once). */
function gpuReady(): boolean {
  return (gpu ??= probeWebGL2((gl) => pickFloatFormat(gl) !== null));
}

class TuringInstance implements PatternInstance {
  private readonly gl: WebGL2RenderingContext;
  private readonly format: FloatFormat;
  private readonly vao: WebGLVertexArrayObject;
  private readonly stepProg: Program;
  private readonly brushProg: Program;
  private readonly resampleProg: Program;
  private readonly displayProg: Program;

  /** Ping-pong pair; `targets[current]` holds the latest state. */
  private targets: [RenderTarget, RenderTarget] | null = null;
  private current = 0;
  private grid: GridSize | null = null;

  private cssWidth = 0;
  private cssHeight = 0;
  private seed: number;
  private params: ParamValues;
  private feedKill = { feed: 0, kill: 0 };
  private readonly colors = new Float32Array(MAX_STOPS * 3);
  private stops = 2;
  private exporting = false;
  private readonly governor = new FrameGovernor();
  private readonly accumulator = new StepAccumulator();
  private strokes: [Point, Point][] = [];
  private strokeCount = 0;

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
    const format = pickFloatFormat(gl);
    if (!format) throw new UnsupportedError('Float render targets are not available');
    this.gl = gl;
    this.format = format;
    this.vao = gl.createVertexArray()!;
    this.stepProg = createProgram(gl, FULLSCREEN_VS, STEP_FS, [
      'uState', 'uTexel', 'uFeedKill', 'uReaction',
    ]);
    this.brushProg = createProgram(gl, FULLSCREEN_VS, BRUSH_FS, [
      'uState', 'uTexel', 'uSeg', 'uRadius', 'uSalt',
    ]);
    this.resampleProg = createProgram(gl, FULLSCREEN_VS, RESAMPLE_FS, [
      'uSrc', 'uSrcSize', 'uOrigin', 'uStride',
    ]);
    this.displayProg = createProgram(gl, FULLSCREEN_VS, DISPLAY_FS, [
      'uState', 'uSize', 'uResolution', 'uOffset', 'uColors', 'uStops', 'uEmboss',
    ]);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);

    this.seed = seed;
    this.params = { ...params };
    this.feedKill = toFeedKill(params.food, params.fade);
    this.setPalette(palette);
  }

  resize(width: number, height: number, pixelRatio: number): void {
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
    const stops = rampStops(palette).slice(0, MAX_STOPS);
    stops.forEach((hex, i) => this.colors.set(hexToRgb(hex), i * 3));
    this.stops = stops.length;
  }

  reset(seed: number): void {
    this.seed = seed;
    this.strokes = [];
    if (this.targets && this.grid) this.upload(this.targets[this.current], this.grid);
  }

  paint(from: Point, to: Point): void {
    this.strokes.push([from, to]);
  }

  step(dtMs: number): void {
    const gl = this.gl;
    if (!this.targets || !this.grid || gl.isContextLost() || this.exporting) return;
    this.flushStrokes();
    const budget = this.governor.update(dtMs);
    const steps = this.accumulator.next(stepsPerFrame(this.params.speed), dtMs, budget);
    if (steps === 0) return;

    this.useStep(this.grid, this.feedKill, 1);
    for (let i = 0; i < steps; i++) this.pass();
  }

  render(): void {
    const gl = this.gl;
    if (!this.targets || !this.grid || gl.isContextLost()) return;
    this.flushStrokes();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.useDisplay(this.targets[this.current], this.grid, gl.drawingBufferWidth, gl.drawingBufferHeight, EMBOSS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Regrow what is on screen on a finer grid sized for the image, let it
   * settle there for a moment, then draw it at width × height. The screen
   * keeps showing the current state, paused, until this finishes.
   */
  async renderImage(
    width: number,
    height: number,
    { onProgress }: ExportOptions = {},
  ): Promise<HTMLCanvasElement> {
    const gl = this.gl;
    if (!this.targets || !this.grid || gl.isContextLost()) throw new Error('Nothing to export yet');
    if (this.exporting) throw new Error('Already exporting');
    this.flushStrokes();
    const plan = exportGrid(this.cssWidth, this.cssHeight, this.grid, width, height);
    const maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0]);
    if (plan.width > maxSize || plan.height > maxSize) throw new Error('Image is too large for this device');

    this.exporting = true;
    const feedKill = { ...this.feedKill };
    const grid: GridSize = { width: plan.width, height: plan.height, cellSize: 0 };
    const sim: [RenderTarget, RenderTarget] = [
      createTarget(gl, this.format, grid.width, grid.height),
      createTarget(gl, this.format, grid.width, grid.height),
    ];
    const tileSize = Math.min(EXPORT_TILE, maxSize);
    try {
      // 1. Copy the visible part of the screen grid onto the finer grid.
      const r = this.resampleProg.uniforms;
      gl.useProgram(this.resampleProg.program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sim[0].framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, this.targets[this.current].texture);
      gl.viewport(0, 0, grid.width, grid.height);
      gl.uniform1i(r.uSrc, 0);
      gl.uniform2f(r.uSrcSize, this.grid.width, this.grid.height);
      gl.uniform2f(r.uOrigin, plan.origin[0], plan.origin[1]);
      gl.uniform2f(r.uStride, plan.stride[0], plan.stride[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 2. Keep growing at full resolution, a slice per frame.
      let cur = 0;
      const perFrame = Math.max(1, Math.floor(EXPORT_CELL_STEPS_PER_FRAME / (grid.width * grid.height)));
      for (let done = 0; done < plan.steps; ) {
        const n = Math.min(perFrame, plan.steps - done);
        this.useStep(grid, feedKill, plan.reaction);
        for (let i = 0; i < n; i++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, sim[1 - cur].framebuffer);
          gl.bindTexture(gl.TEXTURE_2D, sim[cur].texture);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          cur = 1 - cur;
        }
        done += n;
        await waitForGpu(gl);
        if (gl.isContextLost()) throw new Error('Lost the graphics context');
        onProgress?.(0.9 * (done / plan.steps));
      }

      // 3. Draw through the palette, tile by tile, into a 2D canvas.
      return readTiles(
        gl,
        width,
        height,
        tileSize,
        (x0, y0) => {
          this.useDisplay(sim[cur], grid, width, height, EMBOSS * plan.refine);
          gl.uniform2f(this.displayProg.uniforms.uOffset, x0, y0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        (f) => onProgress?.(0.9 + 0.1 * f),
      );
    } finally {
      if (!gl.isContextLost()) {
        sim.forEach((t) => deleteTarget(gl, t));
      }
      this.exporting = false;
    }
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl.isContextLost()) {
      if (this.targets) this.targets.forEach((t) => deleteTarget(gl, t));
      for (const p of [this.stepProg, this.brushProg, this.resampleProg, this.displayProg]) {
        gl.deleteProgram(p.program);
      }
      gl.deleteVertexArray(this.vao);
    }
    this.targets = null;
    // Hand GPU memory back right away rather than waiting for GC.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private useStep(grid: GridSize, feedKill: { feed: number; kill: number }, reaction: number): void {
    const gl = this.gl;
    const u = this.stepProg.uniforms;
    gl.useProgram(this.stepProg.program);
    gl.uniform1i(u.uState, 0);
    gl.uniform2f(u.uTexel, 1 / grid.width, 1 / grid.height);
    gl.uniform2f(u.uFeedKill, feedKill.feed, feedKill.kill);
    gl.uniform1f(u.uReaction, reaction);
    gl.viewport(0, 0, grid.width, grid.height);
  }

  /** Bind the display program for drawing `state` into a width × height image. */
  private useDisplay(state: RenderTarget, grid: GridSize, width: number, height: number, emboss: number): void {
    const gl = this.gl;
    const u = this.displayProg.uniforms;
    gl.useProgram(this.displayProg.program);
    gl.bindTexture(gl.TEXTURE_2D, state.texture);
    gl.uniform1i(u.uState, 0);
    gl.uniform2f(u.uSize, grid.width, grid.height);
    gl.uniform2f(u.uResolution, width, height);
    gl.uniform2f(u.uOffset, 0, 0);
    gl.uniform3fv(u.uColors, this.colors);
    gl.uniform1i(u.uStops, this.stops);
    gl.uniform1f(u.uEmboss, emboss);
  }

  /** One full-grid pass: read targets[current], write the other, then swap. */
  private pass(): void {
    const gl = this.gl;
    const src = this.targets![this.current];
    const dst = this.targets![1 - this.current];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, src.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.current = 1 - this.current;
  }

  private flushStrokes(): void {
    if (this.strokes.length === 0 || !this.targets || !this.grid) return;
    const gl = this.gl;
    const { width, height, cellSize } = this.grid;
    const u = this.brushProg.uniforms;
    gl.useProgram(this.brushProg.program);
    gl.uniform1i(u.uState, 0);
    gl.uniform2f(u.uTexel, 1 / width, 1 / height);
    gl.uniform1f(u.uRadius, Math.max(2, BRUSH_RADIUS_CSS / cellSize));
    gl.viewport(0, 0, width, height);
    for (const [a, b] of this.strokes) {
      // Normalized canvas space has y down; textures have y up.
      gl.uniform4f(u.uSeg, a.x * width, (1 - a.y) * height, b.x * width, (1 - b.y) * height);
      gl.uniform1ui(u.uSalt, this.strokeCount++ & 0xffff);
      this.pass();
    }
    this.strokes = [];
  }

  /** (Re)allocate the grid for the current viewport and pattern size, keeping what has grown. */
  private rebuildGrid(): void {
    if (this.cssWidth <= 0 || this.cssHeight <= 0 || this.gl.isContextLost()) return;
    const next = gridSize(this.cssWidth, this.cssHeight, this.params.scale);
    const prev = this.grid;
    this.grid = next;
    if (prev && this.targets && prev.width === next.width && prev.height === next.height) return;

    const gl = this.gl;
    const fresh: [RenderTarget, RenderTarget] = [
      createTarget(gl, this.format, next.width, next.height),
      createTarget(gl, this.format, next.width, next.height),
    ];
    if (this.targets && prev) {
      const u = this.resampleProg.uniforms;
      gl.useProgram(this.resampleProg.program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fresh[0].framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, this.targets[this.current].texture);
      gl.viewport(0, 0, next.width, next.height);
      gl.uniform1i(u.uSrc, 0);
      gl.uniform2f(u.uSrcSize, prev.width, prev.height);
      gl.uniform2f(u.uOrigin, 0, 0);
      gl.uniform2f(u.uStride, prev.width / next.width, prev.height / next.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.targets.forEach((t) => deleteTarget(gl, t));
      this.targets = fresh;
      this.current = 0;
    } else {
      this.targets = fresh;
      this.current = 0;
      this.upload(fresh[0], next);
    }
  }

  private upload(target: RenderTarget, grid: GridSize): void {
    const gl = this.gl;
    const data = seedField(grid.width, grid.height, mulberry32(this.seed));
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.width, grid.height, gl.RG, gl.FLOAT, data);
  }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
