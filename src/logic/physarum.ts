import { coverFit } from './export';
import { mixSeed, unitHash } from './rng';

/**
 * Physarum (slime mold), as a crowd of tiny explorers.
 *
 * Each explorer walks forward, leaves a trail, and feels ahead with three
 * feelers (left, ahead, right). It turns toward whichever feeler finds the
 * strongest trail. The trail spreads out a little and fades every step. That
 * is all: veins, roots and webs grow out of it on their own.
 *
 * This module holds the pure parts: friendly sliders → model values,
 * starting layouts, sizes and the export plan. The GPU side lives in
 * src/patterns/physarum/.
 */

/** Explorer states are stored this many to a texture row. */
export const AGENT_ROW = 1024;

/** The Explorers slider counts in thousands. */
export const AGENTS_PER_UNIT = 1000;

export interface AgentGrid {
  /** Explorers per texture row. */
  width: number;
  rows: number;
  /** width × rows: the count actually simulated (rounded up to whole rows). */
  count: number;
}

/** Texture layout for `count` explorers: whole rows of AGENT_ROW. */
export function agentGrid(count: number): AgentGrid {
  const rows = Math.max(1, Math.ceil(Math.max(1, count) / AGENT_ROW));
  return { width: AGENT_ROW, rows, count: rows * AGENT_ROW };
}

/**
 * Rows to keep moving when the frame governor hands out `budget` (0..1].
 * Never fewer than `minRows`, so a struggling device still shows a network.
 */
export function activeRows(rows: number, budget: number, minRows = 16): number {
  const b = Math.min(1, Math.max(0, budget));
  return Math.min(rows, Math.max(Math.min(minRows, rows), Math.round(rows * b)));
}

// --- Sliders → model ---------------------------------------------------------

/** Turn per step at Turn speed 0 and 1, in degrees. */
export const TURN_MIN_DEG = 2;
export const TURN_MAX_DEG = 70;

export function turnRadians(turn: number): number {
  return toRadians(TURN_MIN_DEG + clamp01(turn) * (TURN_MAX_DEG - TURN_MIN_DEG));
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Share of the trail lost per step at Trail fade 0 and 1. */
export const DECAY_MIN = 0.006;
export const DECAY_MAX = 0.25;
/**
 * Half-float trails round tiny deposits away when the trail is long-lived,
 * so devices without full-float blending never fade slower than this.
 */
export const DECAY_MIN_HALF_FLOAT = 0.02;

/** Trail fade (0..1) → share lost per step, spaced evenly on a log scale. */
export function decayFromFade(fade: number, minDecay = DECAY_MIN): number {
  const lo = Math.log(Math.max(minDecay, DECAY_MIN));
  const hi = Math.log(DECAY_MAX);
  return Math.exp(lo + clamp01(fade) * (hi - lo));
}

/**
 * Trail left by each explorer per step, chosen so the trail averages 1 over
 * the whole map however many explorers there are, however big the map, and
 * however fast it fades. So halving the crowd (to keep frames smooth) leaves
 * the brightness alone, and the display and food need no retuning.
 *
 * Steady state of m ← (m + d·n/cells)·(1 − decay) is m = d·n/cells·(1 − decay)/decay.
 */
export function depositPerAgent(cells: number, agents: number, decay: number): number {
  return ((cells / Math.max(1, agents)) * decay) / (1 - decay);
}

/**
 * Food adds this much per step at its center, so it stands this far above
 * the average trail once settled (before spreading out).
 */
export function foodRate(decay: number, peak: number): number {
  return (peak * decay) / (1 - decay);
}

// --- Trail grid -----------------------------------------------------------------

export interface TrailGrid {
  width: number;
  height: number;
  /** CSS pixels per cell actually used (≥ 1). */
  cellSize: number;
}

/** Cap on trail cells, so large desktop screens stay smooth. */
export const MAX_TRAIL_CELLS = 1_000_000;

/** One cell per CSS pixel, coarser if the screen would need more than MAX_TRAIL_CELLS. */
export function trailGrid(cssWidth: number, cssHeight: number, maxCells = MAX_TRAIL_CELLS): TrailGrid {
  let size = 1;
  const cells = cssWidth * cssHeight;
  if (cells > maxCells) size = Math.sqrt(cells / maxCells);
  return {
    width: Math.max(16, Math.round(cssWidth / size)),
    height: Math.max(16, Math.round(cssHeight / size)),
    cellSize: size,
  };
}

// --- Starting layouts -------------------------------------------------------------

export const START_LAYOUTS = ['Scatter', 'Sprout'] as const;
export const START_SCATTER = 0;
export const START_SPROUT = 1;

const TAU = Math.PI * 2;

/**
 * Starting explorers for agents [from, to), as (x, y, heading, 0) per agent.
 * x and y are 0..1 across the map with y up (texture order); headings are in
 * radians in cell space, so they mean the same on any screen shape.
 *
 * Each explorer is fixed by (seed, its index) alone, so any count gives the
 * same first explorers, and the layout keeps its shape on any screen.
 */
export function seedAgents(
  seed: number,
  layout: number,
  gridWidth: number,
  gridHeight: number,
  from: number,
  to: number,
): Float32Array {
  const out = new Float32Array(Math.max(0, to - from) * 4);
  // Offsets are in "short side" units, so the sprout stays round.
  const short = Math.min(gridWidth, gridHeight);
  const sx = short / gridWidth;
  const sy = short / gridHeight;
  for (let i = from, o = 0; i < to; i++, o += 4) {
    const h = mixSeed(seed, i);
    const r0 = unitHash(h, 1);
    const r1 = unitHash(h, 2);
    const r2 = unitHash(h, 3);
    let x: number;
    let y: number;
    let heading: number;
    if (layout === START_SPROUT) {
      // A small round sprout in the middle, every explorer heading outward.
      const a = r0 * TAU;
      const d = 0.06 * Math.sqrt(r1);
      x = 0.5 + Math.cos(a) * d * sx;
      y = 0.5 + Math.sin(a) * d * sy;
      heading = a + (r2 - 0.5) * 0.6;
    } else {
      x = r0;
      y = r1;
      heading = r2 * TAU;
    }
    out[o] = wrap01(x);
    out[o + 1] = wrap01(y);
    out[o + 2] = heading - Math.floor(heading / TAU) * TAU;
    out[o + 3] = 0;
  }
  return out;
}

// --- Food -----------------------------------------------------------------------

export interface Food {
  /** 0..1 across the canvas, y down (like taps). */
  x: number;
  y: number;
  /** Steps since it was dropped, so it can fade in. */
  age: number;
}

/** Most food on the map at once; the oldest goes first. */
export const MAX_FOOD = 24;

/** Add food at (x, y), dropping the oldest if there are too many. */
export function addFood(foods: readonly Food[], x: number, y: number, max = MAX_FOOD): Food[] {
  const next = [...foods, { x, y, age: 0 }];
  return next.length > max ? next.slice(next.length - max) : next;
}

interface XY {
  x: number;
  y: number;
}

/**
 * Where to drop food as a finger drags from `from` to `to`, given the last
 * drop: every `spacing` CSS pixels along the way. Points are 0..1 over a
 * cssWidth × cssHeight canvas.
 */
export function dropsAlong(
  last: XY,
  to: XY,
  cssWidth: number,
  cssHeight: number,
  spacing: number,
): XY[] {
  const dx = (to.x - last.x) * cssWidth;
  const dy = (to.y - last.y) * cssHeight;
  const dist = Math.hypot(dx, dy);
  const n = Math.floor(dist / spacing);
  const out: XY[] = [];
  for (let k = 1; k <= n; k++) {
    const t = (k * spacing) / dist;
    out.push({ x: last.x + (to.x - last.x) * t, y: last.y + (to.y - last.y) * t });
  }
  return out;
}

// --- Export ---------------------------------------------------------------------

/** Target size of one trail cell in an exported image, in image pixels. */
export const EXPORT_CELL_PX = 1;
/** Caps for an export, to stay within a phone's GPU memory. */
export const EXPORT_MAX_CELLS = 4_500_000;
export const EXPORT_MAX_AGENTS = 1_600_000;
/** How long an export keeps growing at full resolution. */
export const EXPORT_STEPS = 110;

export interface ExportPlan {
  /** Export trail size, in cells. */
  width: number;
  height: number;
  /** Export cells per screen cell (≥ 1 unless capped). Speeds and reach scale by this. */
  refine: number;
  /**
   * The part of the screen's map the image shows, 0..1 with y up:
   * screen = origin + export · span.
   */
  origin: [number, number];
  span: [number, number];
  /** Explorers in the export (whole rows). */
  agents: AgentGrid;
  steps: number;
}

/**
 * Plan an export of outWidth × outHeight pixels from a screen map covering a
 * cssWidth × cssHeight view, fitted like CSS `object-fit: cover`. The map is
 * regrown on a finer grid with more explorers, so veins get real detail
 * instead of being upscaled.
 */
export function exportPlan(
  cssWidth: number,
  cssHeight: number,
  screen: { width: number; height: number },
  screenAgents: number,
  outWidth: number,
  outHeight: number,
): ExportPlan {
  const fit = coverFit(cssWidth, cssHeight, outWidth, outHeight);
  const cellsPerCss = Math.sqrt((screen.width / cssWidth) * (screen.height / cssHeight));
  // Output pixels per screen cell.
  const screenCellPx = fit.scale / cellsPerCss;
  let cellPx = Math.min(EXPORT_CELL_PX, screenCellPx);
  cellPx = Math.max(cellPx, Math.sqrt((outWidth * outHeight) / EXPORT_MAX_CELLS));
  const width = Math.max(16, Math.round(outWidth / cellPx));
  const height = Math.max(16, Math.round(outHeight / cellPx));
  const refine = screenCellPx / cellPx;
  const span: [number, number] = [fit.width / cssWidth, fit.height / cssHeight];
  // The crop is centered, so from the bottom it starts where it does from the top.
  const origin: [number, number] = [fit.x / cssWidth, fit.y / cssHeight];
  // Keep the crowd as dense as on screen: the crop's share, refine² times over.
  const wanted = screenAgents * span[0] * span[1] * Math.max(1, refine * refine);
  // Whole rows, never past the cap.
  const cap = Math.floor(EXPORT_MAX_AGENTS / AGENT_ROW) * AGENT_ROW;
  const agents = agentGrid(Math.min(cap, Math.max(AGENT_ROW, wanted)));
  return { width, height, refine, origin, span, agents, steps: EXPORT_STEPS };
}

// --- Readouts -------------------------------------------------------------------

/** "300k", "1 million". */
export function formatAgents(thousands: number): string {
  if (thousands >= 1000) return `${Number((thousands / 1000).toFixed(2))} million`;
  return `${Math.round(thousands)}k`;
}

export function formatDegrees(degrees: number): string {
  return `${Number(degrees.toFixed(1))}°`;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function wrap01(x: number): number {
  return x - Math.floor(x);
}
