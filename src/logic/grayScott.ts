import type { Rng } from './rng';

/**
 * Gray-Scott reaction-diffusion, translated into friendly controls.
 *
 * Two chemicals: A fills the dish, B eats A to make more B. "feed" adds A,
 * "kill" removes B. Interesting patterns only live in a thin, tilted band of
 * (feed, kill) space hugging the curve kill = √feed / 2 − feed. Raw sliders
 * would mostly show a blank or flat screen, so:
 *
 * - "Food" picks feed within the range where patterns can live.
 * - "Fade" moves across the band at that feed, from a window just below the
 *   curve (dense labyrinths) to just above it (sparse spots). The window
 *   narrows as feed grows, because the band does.
 *
 * The limits were found by sweeping the whole map and looking at the results.
 */

export const FEED_MIN = 0.018;
export const FEED_MAX = 0.066;
/** Kill offset from the curve at Fade = 0 (any feed). */
const OFFSET_LOW = -0.0018;
/** Kill offset from the curve at Fade = 1, at FEED_MIN and FEED_MAX. */
const OFFSET_HIGH_AT_MIN = 0.008;
const OFFSET_HIGH_AT_MAX = 0.0024;

/** The curve the band hugs. Above it, the plain mixture is the only steady state. */
export function bandEdgeKill(feed: number): number {
  return Math.sqrt(feed) / 2 - feed;
}

/** Range of kill offsets (from bandEdgeKill) that Fade spans at this feed. */
export function killOffsetRange(feed: number): [low: number, high: number] {
  const t = (feed - FEED_MIN) / (FEED_MAX - FEED_MIN);
  return [OFFSET_LOW, OFFSET_HIGH_AT_MIN + (OFFSET_HIGH_AT_MAX - OFFSET_HIGH_AT_MIN) * t];
}

export interface FeedKill {
  feed: number;
  kill: number;
}

/** Friendly sliders (both 0..1) → model parameters. */
export function toFeedKill(food: number, fade: number): FeedKill {
  const feed = FEED_MIN + clamp01(food) * (FEED_MAX - FEED_MIN);
  const [low, high] = killOffsetRange(feed);
  return { feed, kill: bandEdgeKill(feed) + low + clamp01(fade) * (high - low) };
}

/** Model parameters → friendly sliders (inverse of toFeedKill, unclamped). */
export function fromFeedKill(feed: number, kill: number): { food: number; fade: number } {
  const food = (feed - FEED_MIN) / (FEED_MAX - FEED_MIN);
  const [low, high] = killOffsetRange(feed);
  const fade = (kill - bandEdgeKill(feed) - low) / (high - low);
  return { food, fade };
}

/** Simulation steps per 60 Hz frame for the "Growth speed" slider (1..10). */
export function stepsPerFrame(speed: number): number {
  return Math.max(1, speed) * 2.4;
}

export interface GridSize {
  width: number;
  height: number;
  /** CSS pixels per grid cell actually used (may be larger than requested). */
  cellSize: number;
}

/** Hard cap on simulated cells, so huge or high-DPI screens stay smooth. */
export const MAX_CELLS = 1_000_000;

/**
 * Grid dimensions for a viewport of cssWidth × cssHeight CSS pixels, with each
 * cell covering `cellSize` CSS pixels. The grid is coarser than the screen;
 * the display shader smooths it back up.
 */
export function gridSize(cssWidth: number, cssHeight: number, cellSize: number): GridSize {
  let size = Math.max(1, cellSize);
  const cells = (cssWidth / size) * (cssHeight / size);
  if (cells > MAX_CELLS) size *= Math.sqrt(cells / MAX_CELLS);
  return {
    width: Math.max(8, Math.round(cssWidth / size)),
    height: Math.max(8, Math.round(cssHeight / size)),
    cellSize: size,
  };
}

/**
 * Starting state as interleaved (A, B) pairs, row by row from the bottom
 * (WebGL texture order). Mostly plain A, with a scattering of B blobs whose
 * positions come from the seeded RNG. Positions are relative to the grid, so
 * the same seed lays out a similar arrangement on any screen.
 */
export function seedField(width: number, height: number, rng: Rng): Float32Array {
  const data = new Float32Array(width * height * 2);
  for (let i = 0; i < data.length; i += 2) data[i] = 1;

  // Patterns have a natural size in cells, so blobs are sized in cells too:
  // big enough to take hold, few enough that you can watch them spread.
  const count = Math.round(Math.min(60, Math.max(4, (width * height) / 6000)));
  for (let n = 0; n < count; n++) {
    const cx = rng() * width;
    const cy = rng() * height;
    const r = 3 + rng() * 5;
    stamp(data, width, height, cx, cy, r, rng);
  }
  return data;
}

/** Drop one roughly-round blob of B at (cx, cy) with radius r, wrapping at edges. */
export function stamp(
  data: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
  rng: Rng,
): void {
  const r2 = r * r;
  const x0 = Math.floor(cx - r);
  const y0 = Math.floor(cy - r);
  const x1 = Math.ceil(cx + r);
  const y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      const wx = ((x % width) + width) % width;
      const wy = ((y % height) + height) % height;
      const i = (wy * width + wx) * 2;
      // A little noise breaks symmetry so blobs don't grow as perfect rings.
      data[i] = 0.5 + (rng() - 0.5) * 0.1;
      data[i + 1] = 0.25 + (rng() - 0.5) * 0.1;
    }
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
