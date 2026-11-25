import type { PlantSlot } from '../../logic/forest';
import { Growth } from '../../logic/growth';
import { grow, growMore, layout, thickness, turtle, type Layout, type Skeleton, type Word } from '../../logic/lsystem';
import { generationFor, MAX_SEGMENTS, type Species } from '../../logic/plantSpecies';

const DEG = Math.PI / 180;
/** Width steps a plant is drawn with: one path per step keeps drawing fast. */
export const WIDTH_STEPS = 12;

/** Everything about the plant the sliders control. */
export interface PlantSettings {
  species: Species;
  /** Multiplier on the species' branching angle. */
  angle: number;
  randomness: number;
  wind: number;
  steps: number;
}

/** One generation, ready to draw. */
export interface Built {
  skel: Skeleton;
  lay: Layout;
  /** Segment indices grouped by width step (thick first): `order[stepStart[q]…stepStart[q+1]]`. */
  order: Uint32Array;
  stepStart: Uint32Array;
  /** Thickness (trunk = 1) drawn for each width step. */
  stepThickness: Float32Array;
  /** Segments at the very ends of twigs. */
  tips: Uint32Array;
}

/** How plant space maps to pixels: X = tx + x·scale, Y = ty + y·scale. */
export interface Fit {
  scale: number;
  tx: number;
  ty: number;
  /** Height of the grown plant, in pixels. */
  height: number;
}

/** One plant: its words for every generation, built lazily, and how far it has grown. */
export class Plant {
  private words: Word[];
  private builds = new Map<number, Built>();
  readonly growth: Growth;

  constructor(
    public slot: PlantSlot,
    private settings: PlantSettings,
  ) {
    this.words = grow(settings.species.system, this.wanted(), slot.seed, MAX_SEGMENTS);
    this.growth = new Growth(this.target, slot.delay);
  }

  /** The generation it is growing towards. */
  get target(): number {
    return Math.min(this.wanted(), this.words.length - 1);
  }

  get species(): Species {
    return this.settings.species;
  }

  /** New slider values for the same species. */
  update(next: PlantSettings): void {
    const prev = this.settings;
    this.settings = next;
    if (next.angle !== prev.angle || next.randomness !== prev.randomness || next.wind !== prev.wind) {
      this.builds.clear();
    }
    if (next.steps !== prev.steps) {
      this.words = growMore(this.words, next.species.system, this.wanted(), MAX_SEGMENTS);
      this.growth.setTarget(this.target);
    }
  }

  /** Advance the animation; true if the picture changed. */
  step(dtMs: number): boolean {
    return this.growth.step(dtMs, (g) => this.build(g).skel.count === 0);
  }

  build(generation: number): Built {
    let b = this.builds.get(generation);
    if (!b) {
      b = buildGeneration(this.words[generation], generation, this.settings);
      this.builds.set(generation, b);
    }
    return b;
  }

  /** Fit the fully grown plant into its slot in a width × height frame. */
  fit(width: number, height: number): Fit {
    const { lay } = this.build(this.target);
    const w = Math.max(1e-6, lay.maxX - lay.minX);
    const h = Math.max(1e-6, lay.maxY - lay.minY);
    const scale = Math.min((this.slot.height * height) / h, (this.slot.width * width) / w);
    const tx = this.slot.x * width - ((lay.minX + lay.maxX) / 2) * scale;
    const ty = this.slot.ground * height - lay.maxY * scale;
    return { scale, tx, ty, height: h * scale };
  }

  private wanted(): number {
    return Math.max(1, generationFor(this.settings.species, this.settings.steps) - this.slot.detailDrop);
  }
}

function buildGeneration(word: Word, generation: number, s: PlantSettings): Built {
  const sp = s.species;
  const length = sp.shrink ** generation;
  const skel = turtle(word, {
    angle: sp.angle * s.angle * DEG,
    kink: (sp.kink ?? 0) * DEG,
    length,
    randomness: s.randomness,
    heading: (sp.heading ?? 0) * DEG,
    // Drift adds up along a branch like a random walk, so shorter segments drift less.
    wobble: sp.wobble * DEG * Math.sqrt(length),
  });
  const lay = layout(skel, s.wind * sp.sway);

  // Sort segments into width steps on a log scale, from trunk (0) to twig.
  const n = skel.count;
  const thinnest = Math.log(Math.max(1e-6, 1 / Math.sqrt(Math.max(1, skel.totalTips))));
  const step = new Uint8Array(n);
  const counts = new Uint32Array(WIDTH_STEPS + 1);
  const tips: number[] = [];
  for (let i = 0; i < n; i++) {
    const q = thinnest < 0 ? Math.round((Math.log(thickness(skel, i)) / thinnest) * (WIDTH_STEPS - 1)) : 0;
    step[i] = Math.min(WIDTH_STEPS - 1, Math.max(0, q));
    counts[step[i] + 1]++;
    if (skel.children[i] === 0) tips.push(i);
  }
  const stepStart = new Uint32Array(WIDTH_STEPS + 1);
  for (let q = 1; q <= WIDTH_STEPS; q++) stepStart[q] = stepStart[q - 1] + counts[q];
  const fill = stepStart.slice(0, WIDTH_STEPS);
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[fill[step[i]]++] = i;
  const stepThickness = new Float32Array(WIDTH_STEPS);
  for (let q = 0; q < WIDTH_STEPS; q++) stepThickness[q] = Math.exp((q / (WIDTH_STEPS - 1)) * thinnest);

  return { skel, lay, order, stepStart, stepThickness, tips: Uint32Array.from(tips) };
}
