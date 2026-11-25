import { forestSize, plantSlots } from '../../logic/forest';
import type { ParamSpec, ParamValues } from '../../logic/params';
import { MAX_STEPS, SPECIES } from '../../logic/plantSpecies';
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
import { drawScene } from './draw';
import { Plant, type PlantSettings } from './plant';

const DEFAULT_SPECIES = SPECIES.findIndex((s) => s.id === 'tree');

/** Growing is decoration: with reduced motion, plants appear fully grown. */
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const PARAMS: ParamSpec[] = [
  { key: 'plant', label: 'Plant', min: 0, max: SPECIES.length - 1, step: 1, default: DEFAULT_SPECIES, control: 'hidden' },
  { key: 'angle', label: 'Branching angle', min: 0.5, max: 1.6, step: 0.01, default: 1 },
  { key: 'steps', label: 'Growth steps', min: 1, max: MAX_STEPS, step: 1, default: 5 },
  { key: 'randomness', label: 'Randomness', min: 0, max: 1, step: 0.01, default: 0.35 },
  { key: 'wind', label: 'Wind', min: 0, max: 1, step: 0.01, default: 0.15 },
  { key: 'leaves', label: 'Leaves', min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: 'forest', label: 'Forest', min: 0, max: 1, step: 1, default: 0, control: 'switch' },
];

/** One chip per kind of plant. Picking one keeps the other sliders as they are. */
const PRESETS: Preset[] = SPECIES.map((s, i) => ({ id: s.id, name: s.name, values: { plant: i } }));

/** Randomize: any plant (jitter 0 takes a random preset's), within ranges that look good. */
const EXPLORE: ExploreRules = {
  plant: { jitter: 0 },
  angle: { range: [0.8, 1.25] },
  randomness: { range: [0.15, 0.65] },
  wind: { range: [0, 0.5] },
  leaves: { range: [0.3, 1] },
};

export const plants: Pattern = {
  id: 'plants',
  name: 'Plants',
  params: PARAMS,
  presets: PRESETS,
  explore: EXPLORE,
  create: (options) => new PlantsInstance(options),
};

class PlantsInstance implements PatternInstance {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private seed: number;
  private params: ParamValues;
  private palette: Palette;
  private plants: Plant[] = [];
  private needsDraw = true;

  constructor({ canvas, seed, params, palette }: PatternOptions) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new UnsupportedError('Canvas 2D is not available');
    this.ctx = ctx;
    this.seed = seed;
    this.params = { ...params };
    this.palette = palette;
  }

  resize(width: number, height: number): void {
    const before = this.width > 0 ? forestSize(this.width / this.height) : 0;
    this.width = width;
    this.height = height;
    if (this.plants.length === 0) this.plantAll();
    // A forest gets more trees on a wider screen. Existing ones stay as they are.
    else if (this.params.forest && forestSize(width / height) !== before) this.replant();
    this.needsDraw = true;
  }

  setParams(params: ParamValues): void {
    const prev = this.params;
    this.params = { ...params };
    if (params.plant !== prev.plant || params.forest !== prev.forest) {
      this.plantAll();
    } else {
      const settings = this.settings();
      for (const p of this.plants) p.update(settings);
    }
    this.needsDraw = true;
  }

  setPalette(palette: Palette): void {
    this.palette = palette;
    this.needsDraw = true;
  }

  reset(seed: number): void {
    this.seed = seed;
    this.plantAll();
  }

  step(dtMs: number): void {
    for (const p of this.plants) if (p.step(dtMs)) this.needsDraw = true;
  }

  render(): void {
    if (!this.needsDraw || this.width === 0) return;
    drawScene(this.ctx, this.width, this.height, this.plants, this.sceneOptions());
    this.needsDraw = false;
  }

  /** Lay the plants out afresh for the image's shape, fully grown, and draw them there. */
  async renderImage(width: number, height: number, { onProgress }: ExportOptions = {}): Promise<HTMLCanvasElement> {
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    const settings = this.settings();
    const grown = plantSlots(this.seed, width / height, this.params.forest === 1).map((slot) =>
      sprout(new Plant(slot, settings), true),
    );
    onProgress?.(0.5);
    // Let the progress show before the (brief) drawing work.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    drawScene(ctx, width, height, grown, this.sceneOptions());
    onProgress?.(1);
    return out;
  }

  dispose(): void {
    this.plants = [];
  }

  private settings(): PlantSettings {
    const p = this.params;
    return {
      species: SPECIES[Math.round(p.plant)] ?? SPECIES[DEFAULT_SPECIES],
      angle: p.angle,
      randomness: p.randomness,
      wind: p.wind,
      steps: p.steps,
    };
  }

  private sceneOptions() {
    return { palette: this.palette, leaves: this.params.leaves };
  }

  private slots() {
    const aspect = this.width > 0 ? this.width / this.height : 1;
    return plantSlots(this.seed, aspect, this.params.forest === 1);
  }

  /** Start every plant over from a seed. */
  private plantAll(): void {
    const settings = this.settings();
    const still = reducedMotion();
    this.plants = this.slots().map((slot) => sprout(new Plant(slot, settings), still));
    this.needsDraw = true;
  }

  /** New slots for the frame: plants that are still in it keep growing where they were. */
  private replant(): void {
    const settings = this.settings();
    const old = new Map(this.plants.map((p) => [p.slot.index, p]));
    const still = reducedMotion();
    this.plants = this.slots().map((slot) => {
      const p = old.get(slot.index);
      if (!p) return sprout(new Plant(slot, settings), still);
      p.slot = slot;
      return p;
    });
  }
}

/** A new plant, fully grown already if `grown`. */
function sprout(plant: Plant, grown: boolean): Plant {
  if (grown) plant.growth.finish();
  return plant;
}
