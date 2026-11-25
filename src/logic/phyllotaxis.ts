/**
 * Seed heads: seeds placed one after another, each turned by the same angle
 * from the last and set a little further out. With the golden angle the
 * seeds pack evenly and spiral arms appear; any other angle breaks them into
 * spokes or curved arms.
 */

/** The golden angle, 360° / φ², in degrees. */
export const GOLDEN_ANGLE = 180 * (3 - Math.sqrt(5));

/** How far the Angle slider reaches either side of the golden angle, in degrees. */
export const ANGLE_REACH = 45;
/** Share of the slider's reach that grows evenly; the rest speeds up toward the ends. */
const LINEAR = 0.08;

/**
 * The Angle slider runs from -1 to 1 with the golden angle in the middle.
 * It is finest near the middle, where a tenth of a degree already turns
 * spirals into spokes, and sweeps faster toward the ends, past the 2, 3
 * and 5 arms of 180°, 120° and 144° (from about 92° to 182°).
 */
export function angleFromTurn(turn: number): number {
  const t = Math.min(1, Math.max(-1, turn));
  return GOLDEN_ANGLE + ANGLE_REACH * (LINEAR * t + (1 - LINEAR) * t * Math.abs(t));
}

/** The slider position for an angle in degrees (the inverse of angleFromTurn). */
export function turnFromAngle(degrees: number): number {
  const d = (degrees - GOLDEN_ANGLE) / ANGLE_REACH;
  const s = Math.sign(d);
  const a = Math.abs(d);
  // Solve (1 - L) t² + L t = a for t ≥ 0.
  const k = 1 - LINEAR;
  const t = (-LINEAR + Math.sqrt(LINEAR * LINEAR + 4 * k * a)) / (2 * k);
  return Math.min(1, Math.max(-1, s * t));
}

/** "137.51°", and a quiet note when it is the golden angle (to the shown precision). */
export function formatAngle(degrees: number): string {
  const shown = degrees.toFixed(2);
  return shown === GOLDEN_ANGLE.toFixed(2) ? `${shown}° golden` : `${shown}°`;
}

/** Distance from x to the nearest whole number. */
function offWhole(x: number): number {
  return Math.abs(x - Math.round(x));
}

/**
 * The spiral family that stands out around seed `n` when each seed turns by
 * `turn` of a full circle and sits at radius n^`exponent`: seeds n, n + q,
 * n + 2q… lie on one arm, and there are q arms. It is the q whose seeds sit
 * closest together there (the contact spirals). With the golden angle and
 * even packing (exponent ½) q is a Fibonacci number that grows with the
 * head: 13, 21, 34, 55…
 */
export function spiralCount(turn: number, n: number, exponent = 0.5, maxCount = 400): number {
  const m = Math.max(1, n);
  const r0 = m ** exponent;
  let best = 1;
  let bestDist = Infinity;
  for (let q = 1; q <= maxCount; q++) {
    const r1 = (m + q) ** exponent;
    const around = 2 * Math.PI * offWhole(q * turn);
    const dist = r0 * r0 + r1 * r1 - 2 * r0 * r1 * Math.cos(around);
    if (dist < bestDist * (1 - 1e-9)) {
      bestDist = dist;
      best = q;
    }
  }
  return best;
}

/**
 * Order of the q arms around the circle: seed i (0 ≤ i < q) starts arm
 * `armOrder[i]`, counted around from 0 to q - 1, so neighbouring arms get
 * neighbouring numbers.
 */
export function armOrder(turn: number, q: number): Int32Array {
  const ids = Array.from({ length: q }, (_, i) => i);
  const at = (i: number) => (((i * turn) % 1) + 1) % 1;
  ids.sort((a, b) => at(a) - at(b));
  const order = new Int32Array(q);
  ids.forEach((i, k) => (order[i] = k));
  return order;
}

export interface HeadSettings {
  /** Number of seeds. */
  count: number;
  /** Turn between one seed and the next, in degrees. */
  angle: number;
  /** Seed size as a share of the room each has: 1 just touches its neighbours. */
  size: number;
  /** 0: every seed the same size. 1: seeds grow strongly from the center out. */
  growth: number;
}

/** A laid-out head in a unit circle: the outermost seed's edge is at radius 1. */
export interface Head {
  count: number;
  x: Float32Array;
  y: Float32Array;
  /** Direction from the center to each seed, in radians. */
  heading: Float32Array;
  /** Seed radius. */
  radius: Float32Array;
  /** Distance from the center, 0 to 1. */
  distance: Float32Array;
  /** Which spiral arm each seed is on, counted around the circle; 0 to arms - 1. */
  arm: Int32Array;
  arms: number;
}

/** Largest share the size-growth slider gives seed size as a power of distance. */
const MAX_GROWTH_POWER = 0.6;

/**
 * Place the seeds. With no growth they spread at radius ∝ √n, so each has
 * the same room (the classic sunflower). With growth, a seed's size goes as
 * distance^k and the spacing widens to match, so the head stays evenly
 * packed: small seeds at the heart, large ones at the rim.
 *
 * `jitter(i, salt)` returns a number in [-1, 1) for small natural variation
 * in size and position; leave it out for a perfect head.
 */
export function layoutHead(
  { count, angle, size, growth }: HeadSettings,
  jitter: (i: number, salt: number) => number = () => 0,
): Head {
  const n = Math.max(1, Math.round(count));
  const k = MAX_GROWTH_POWER * Math.min(1, Math.max(0, growth));
  // r ∝ n^e keeps the head evenly packed when seed size ∝ r^k.
  const e = 1 / (2 - 2 * k);
  const turn = angle / 360;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const heading = new Float32Array(n);
  const radius = new Float32Array(n);
  const distance = new Float32Array(n);

  let outer = 0;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const r = u ** e;
    // Room per seed: the area of the ring it sits in, shared out.
    const room = r * Math.sqrt((2 * Math.PI * e) / (i + 0.5));
    const rad = 0.5 * size * room * (1 + 0.08 * jitter(i, 1));
    const a = 2 * Math.PI * ((i * turn) % 1);
    const wobble = 0.12 * room;
    x[i] = r * Math.cos(a) + wobble * jitter(i, 2);
    y[i] = r * Math.sin(a) + wobble * jitter(i, 3);
    heading[i] = a;
    radius[i] = rad;
    distance[i] = r;
    outer = Math.max(outer, Math.hypot(x[i], y[i]) + rad);
  }
  // Fit the whole head, edges of the outer seeds included, in the unit circle.
  const fit = 1 / outer;
  for (let i = 0; i < n; i++) {
    x[i] *= fit;
    y[i] *= fit;
    radius[i] *= fit;
  }

  // Arms: the family that stands out two thirds of the way out.
  const arms = spiralCount(turn, Math.round(n * 0.66), e);
  const order = armOrder(turn, arms);
  const arm = new Int32Array(n);
  for (let i = 0; i < n; i++) arm[i] = order[i % arms];

  return { count: n, x, y, heading, radius, distance, arm, arms };
}
