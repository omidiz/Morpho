import { mixSeed, unitHash } from './rng';

/** Where one plant stands in the picture. Fractions of the frame unless noted. */
export interface PlantSlot {
  /** Stable per plant, so a plant keeps its shape when the frame changes shape. */
  index: number;
  /** Seed for this plant's own randomness. */
  seed: number;
  /** Horizontal center of the plant. */
  x: number;
  /** Height of the ground line it grows from. */
  ground: number;
  /** Tallest it may be, as a fraction of the frame height. */
  height: number;
  /** Widest it may be, as a fraction of the frame width. */
  width: number;
  /** 0 = far away (small, hazy), 1 = in front. */
  depth: number;
  /** Generations fewer than the front plants: far plants need less detail. */
  detailDrop: number;
  /** When it starts growing, in milliseconds after the others. */
  delay: number;
}

/** Plants in a forest for a frame of this aspect ratio (width / height). */
export function forestSize(aspect: number): number {
  return Math.min(8, Math.max(3, Math.round(2 + 2.6 * aspect)));
}

/** A lone plant, centered, as large as fits. */
function lonePlant(seed: number): PlantSlot {
  return {
    index: 0,
    seed: mixSeed(seed, 0),
    x: 0.5,
    ground: 0.93,
    height: 0.76,
    width: 0.86,
    depth: 1,
    detailDrop: 0,
    delay: 0,
  };
}

const DEPTH = 0xd3e7;
const SHIFT = 0x5f1f7;
const ORDER = 0x0bde4;

/**
 * Plants for one picture, back to front (the order to draw them in). With
 * `forest` off there is one plant; on, several of different sizes spread
 * across the frame, the near ones larger and lower, the far ones smaller
 * and higher up. Pure: the same seed and aspect always give the same forest.
 */
export function plantSlots(seed: number, aspect: number, forest: boolean): PlantSlot[] {
  if (!forest) return [lonePlant(seed)];
  const n = forestSize(aspect);
  const depths = Array.from({ length: n }, (_, i) => unitHash(mixSeed(seed, i), DEPTH));
  // Always one plant right at the front, so the forest has a hero.
  const top = depths.indexOf(Math.max(...depths));
  depths[top] = 1;
  const slots = depths.map((depth, i): PlantSlot => {
    const shift = (unitHash(mixSeed(seed, i), SHIFT) - 0.5) * 0.7;
    const width = Math.min(0.9, (2.4 / n) * (0.6 + 0.6 * depth));
    // Far plants may be cut off by the edge, as in a real view; the nearest stays whole.
    const margin = width * (depth === 1 ? 0.5 : 0.25);
    return {
      index: i,
      seed: mixSeed(seed, i),
      x: Math.min(1 - margin, Math.max(margin, (i + 0.5 + shift) / n)),
      ground: 0.97 - 0.13 * (1 - depth),
      height: 0.34 + 0.46 * depth,
      width,
      depth,
      detailDrop: depth < 0.3 ? 2 : depth < 0.75 ? 1 : 0,
      delay: Math.floor(unitHash(mixSeed(seed, i), ORDER) * 900),
    };
  });
  return slots.sort((a, b) => a.depth - b.depth || a.index - b.index);
}
