import type { ParamSpec, ParamValues } from '../logic/params';
import type { ExploreRules } from '../logic/randomize';
import type { Palette } from '../palettes';

export type { ExploreRules, ParamSpec, ParamValues };

/** A named set of slider values. Keys not listed keep their current value. */
export interface Preset {
  id: string;
  name: string;
  values: ParamValues;
}

/** A point in normalized canvas space: (0, 0) top-left, (1, 1) bottom-right. */
export interface Point {
  x: number;
  y: number;
}

export interface PatternOptions {
  /**
   * A fresh canvas, owned by this instance. (A canvas can hold only one kind
   * of context, so WebGL and Canvas 2D patterns each get their own.)
   */
  canvas: HTMLCanvasElement;
  /** Integer seed; all randomness must come from it. */
  seed: number;
  params: ParamValues;
  palette: Palette;
}

export interface ExportOptions {
  /** Called as the work moves along, with a fraction from 0 to 1. */
  onProgress?(fraction: number): void;
}

/** A running pattern on one canvas. */
export interface PatternInstance {
  /** Advance the simulation by one animation frame of `dtMs` milliseconds. */
  step(dtMs: number): void;
  /** Draw the current state to the canvas. */
  render(): void;
  /** Canvas backing store is now width × height device pixels (`pixelRatio` per CSS px). */
  resize(width: number, height: number, pixelRatio: number): void;
  setParams(params: ParamValues): void;
  setPalette(palette: Palette): void;
  /** Start over from a new seed. */
  reset(seed: number): void;
  /**
   * Draw the current pattern afresh at exactly width × height pixels (not an
   * upscale of the screen) and resolve with a canvas holding the image. The
   * view is fitted like CSS `object-fit: cover`. Simulations may keep running
   * for a moment at the new resolution so the detail is real.
   */
  renderImage(width: number, height: number, options?: ExportOptions): Promise<HTMLCanvasElement>;
  /** Paint along a stroke from `from` to `to` (a tap has from === to). */
  paint?(from: Point, to: Point): void;
  dispose(): void;
}

export interface Pattern {
  id: string;
  /** Friendly name shown in the UI. */
  name: string;
  /** The UI builds one slider per entry, in this order. */
  params: readonly ParamSpec[];
  presets: readonly Preset[];
  /**
   * How "Randomize" varies each parameter, kept to ranges that look good.
   * Parameters left out keep their current value.
   */
  explore: ExploreRules;
  /** Throws UnsupportedError if this device can't run the pattern. */
  create(options: PatternOptions): PatternInstance;
}

/** Thrown by Pattern.create when the browser lacks something it needs. */
export class UnsupportedError extends Error {}
