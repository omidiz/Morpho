import type { ParamSpec, ParamValues } from '../logic/params';
import type { Palette } from '../palettes';

export type { ParamSpec, ParamValues };

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
  /** Throws UnsupportedError if this device can't run the pattern. */
  create(options: PatternOptions): PatternInstance;
}

/** Thrown by Pattern.create when the browser lacks something it needs. */
export class UnsupportedError extends Error {}
