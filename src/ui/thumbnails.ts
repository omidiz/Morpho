import type { ParamValues } from '../logic/params';
import { THUMB_WARMUP_STEPS, thumbSteps } from '../logic/sheet';
import type { Palette } from '../palettes';
import type { Pattern, PatternInstance } from '../patterns/types';

/** What a thumbnail should show: the same seed and palette as the main canvas. */
export interface ThumbState {
  seed: number;
  palette: Palette;
  /** The sliders of each pattern, as the switcher would find them. */
  paramsFor(pattern: Pattern): ParamValues;
}

interface Thumb {
  pattern: Pattern;
  slot: HTMLElement;
  canvas: HTMLCanvasElement | null;
  instance: PatternInstance | null;
  /** Gave up on this one (no WebGL2, say): the tile stays a plain swatch. */
  failed: boolean;
  /** Simulation steps since the last start, for the warm-up. */
  age: number;
  seed: number;
  palette: Palette | null;
  params: ParamValues | null;
  dirty: boolean;
}

/** A frame at 60 fps. Thumbnails always step at this pace, whatever the real frame time. */
const FRAME_MS = 1000 / 60;

/**
 * Small live previews of every pattern for the switcher. Each runs its own
 * tiny instance with the current seed and palette, and only while the
 * switcher can be seen. They are created on first show, so a phone that
 * never opens the controls pays nothing for them.
 */
export class LiveThumbnails {
  private readonly thumbs: Thumb[];
  private visible = false;
  private frame = 0;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    patterns: readonly Pattern[],
    slotFor: (pattern: Pattern) => HTMLElement,
    private state: ThumbState,
  ) {
    this.thumbs = patterns.map((pattern) => ({
      pattern,
      slot: slotFor(pattern),
      canvas: null,
      instance: null,
      failed: false,
      age: 0,
      seed: state.seed,
      palette: null,
      params: null,
      dirty: true,
    }));
  }

  /** Thumbnails only grow while they can be seen. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) for (const t of this.thumbs) this.ensure(t);
  }

  /** Bring every preview up to date with `state`. Cheap when nothing changed. */
  sync(state: ThumbState): void {
    this.state = state;
    for (const t of this.thumbs) if (t.instance) this.apply(t);
  }

  /** Called once per animation frame. `playing` false holds them still, like the main canvas. */
  tick(playing: boolean): void {
    if (!this.visible) return;
    this.frame++;
    for (let i = 0; i < this.thumbs.length; i++) {
      const t = this.thumbs[i];
      if (!t.instance) continue;
      // Once grown, each preview moves on every other frame, staggered: a quarter of the work.
      const warm = t.age >= THUMB_WARMUP_STEPS;
      if (playing && (!warm || (this.frame + i) % 2 === 0)) {
        const n = thumbSteps(t.age, this.reducedMotion.matches);
        for (let k = 0; k < n; k++) t.instance.step(FRAME_MS);
        t.age += n;
        if (n > 0) t.dirty = true;
      }
      if (t.dirty) {
        t.instance.render();
        t.dirty = false;
      }
    }
  }

  dispose(): void {
    for (const t of this.thumbs) this.drop(t);
  }

  private ensure(t: Thumb): void {
    if (t.instance || t.failed) return;
    const size = t.slot.clientWidth;
    if (size === 0) return; // not laid out yet; tried again on the next show
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixels = Math.max(16, Math.round(size * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = pixels;
    canvas.height = pixels;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (t.canvas !== canvas) return;
      t.instance = null;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (t.canvas !== canvas) return;
      this.drop(t);
      if (this.visible) this.ensure(t);
    });
    const params = this.paramsFor(t);
    try {
      t.instance = t.pattern.create({ canvas, seed: this.state.seed, params, palette: this.state.palette });
    } catch {
      t.failed = true;
      return;
    }
    // Zoomed out: the instance thinks the tile is `zoom` times larger than it is.
    const zoom = t.pattern.thumbnail?.zoom ?? 1;
    t.instance.resize(pixels, pixels, ratio / zoom);
    t.canvas = canvas;
    t.slot.replaceChildren(canvas);
    t.seed = this.state.seed;
    t.palette = this.state.palette;
    t.params = params;
    t.age = 0;
    t.dirty = true;
  }

  private apply(t: Thumb): void {
    const inst = t.instance!;
    const params = this.paramsFor(t);
    if (!sameValues(params, t.params)) {
      inst.setParams(params);
      t.params = params;
      t.dirty = true;
    }
    if (this.state.palette !== t.palette) {
      inst.setPalette(this.state.palette);
      t.palette = this.state.palette;
      t.dirty = true;
    }
    if (this.state.seed !== t.seed) {
      inst.reset(this.state.seed);
      t.seed = this.state.seed;
      t.age = 0;
      t.dirty = true;
    }
  }

  private paramsFor(t: Thumb): ParamValues {
    return { ...this.state.paramsFor(t.pattern), ...t.pattern.thumbnail?.params };
  }

  private drop(t: Thumb): void {
    t.instance?.dispose();
    t.instance = null;
    t.canvas?.remove();
    t.canvas = null;
  }
}

function sameValues(a: ParamValues, b: ParamValues | null): boolean {
  if (!b) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}
