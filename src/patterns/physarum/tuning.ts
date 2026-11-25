/** Look and feel shared by the GPU and CPU versions of the slime mold. */

import type { Food } from '../../logic/physarum';

/** Simulation steps per 60 Hz frame. Explorers walk one map cell per step. */
export const STEPS_PER_FRAME = 2;
/** Below this budget the governor also trims steps, not just explorers. */
export const STEP_TRIM_BELOW = 0.35;
/**
 * Least share of the crowd kept moving when frames are slow. Low, so a weak
 * GPU still gets smooth frames from a thinner crowd.
 */
export const MIN_BUDGET = 0.05;
/**
 * Feelers can't tell trail apart above this (a multiple of the map's
 * average): where a crowd piles up, the trail feels flat and explorers
 * drift out along the veins again, rather than collapsing into a blob.
 */
export const SENSE_CAP = 1.5;
/** Most trail a cell can hold, to keep half floats in range. */
export const TRAIL_MAX = 200;
/**
 * Share of each cell's trail that spreads to its neighbors per step. Low,
 * so veins stay crisp instead of haloed (halo width ≈ √(DIFFUSE / decay)).
 */
export const DIFFUSE = 0.15;
/** Trail (averaging 1 over the map) → color: 1 − exp(−trail · EXPOSURE). */
export const EXPOSURE = 0.16;
/**
 * Food: how strongly it glows in the trail (a multiple of the average), how
 * far off explorers feel it and how hard it pulls (beside SENSE_CAP), the
 * dot's size, and how fast it appears.
 */
export const FOOD_PEAK = 10;
export const FOOD_RADIUS_CSS = 4;
export const FOOD_REACH_CSS = 30;
export const FOOD_PULL = 1.2;
export const FOOD_DOT_CSS = 4.5;
export const FOOD_FADE_STEPS = 40;
/** Dragging drops food this far apart, in CSS pixels. */
export const FOOD_SPACING_CSS = 40;

/** Food fades in over its first few steps. */
export function foodStrength(f: Food): number {
  return Math.min(1, f.age / FOOD_FADE_STEPS);
}
