import { mixHex } from '../../logic/color';
import type { Head } from '../../logic/phyllotaxis';
import type { Palette } from '../../palettes';

export const SHAPES = ['Dots', 'Petals', 'Rings'] as const;
export const COLOR_MODES = ['Spirals', 'Center out'] as const;

export interface HeadStyle {
  palette: Palette;
  /** Index into SHAPES. */
  shape: number;
  /** Index into COLOR_MODES. */
  color: number;
  /** Turn of the whole head, in radians. */
  rotation: number;
  /** Growth animation, 0 (nothing yet) to 1 (every seed in place). */
  grown: number;
}

/** Shades from the heart to the rim when coloring by distance. */
const DISTANCE_SHADES = 24;
/** Share of the growth time over which seeds start, heart first; each then takes the rest to pop in. */
const SPREAD = 0.8;

/** Seed `i` of `count`'s size during growth: 0 before it starts, popping a little past 1, then 1. */
export function seedScale(i: number, count: number, grown: number): number {
  if (grown >= 1) return 1;
  const t = (grown - (SPREAD * i) / count) / (1 - SPREAD);
  if (t <= 0) return 0;
  return t >= 1 ? 1 : easeOutBack(t);
}

/** Paint the background and the head, centered and as large as fits. */
export function drawHead(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  head: Head,
  { palette, shape, color, rotation, grown }: HeadStyle,
): void {
  const bg = palette.background;
  const colors = palette.colors;
  const cx = width / 2;
  const cy = height / 2;
  const size = 0.44 * Math.min(width, height);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  // A soft glow behind the head.
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 1.5);
  glow.addColorStop(0, mixHex(bg, colors[0], 0.6));
  glow.addColorStop(1, `${bg}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const inks = inksFor(palette, color, head.arms);
  const band = armBands(head.arms, inks.length);
  const paths = inks.map(() => new Path2D());
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const n = head.count;
  for (let i = 0; i < n; i++) {
    const s = seedScale(i, n, grown);
    if (s <= 0) continue;
    const r = head.radius[i] * size * s;
    if (r < 0.15) continue;
    const hx = head.x[i];
    const hy = head.y[i];
    const x = cx + (hx * cos - hy * sin) * size;
    const y = cy + (hx * sin + hy * cos) * size;
    const ink =
      color === 0
        ? band[head.arm[i]]
        : Math.min(DISTANCE_SHADES - 1, Math.floor(head.distance[i] * DISTANCE_SHADES));
    const p = paths[ink];
    switch (shape) {
      case 1: {
        // An almond pointing away from the heart.
        const a = head.heading[i] + rotation;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const len = r * 1.25;
        const wide = r * 1.15;
        p.moveTo(x - ux * len, y - uy * len);
        p.quadraticCurveTo(x - uy * wide, y + ux * wide, x + ux * len, y + uy * len);
        p.quadraticCurveTo(x + uy * wide, y - ux * wide, x - ux * len, y - uy * len);
        p.closePath();
        break;
      }
      case 2: {
        // An open ring: the inner circle runs the other way, so it is left empty.
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, Math.PI * 2);
        const hole = r * 0.58;
        p.moveTo(x + hole, y);
        p.arc(x, y, hole, 0, Math.PI * 2, true);
        break;
      }
      default:
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  for (let k = 0; k < paths.length; k++) {
    ctx.fillStyle = inks[k];
    ctx.fill(paths[k]);
  }
}

/**
 * The colors seeds are filled with. Spirals: neighbouring arms take turns
 * through the palette's bolder colors. Center out: a ramp across the whole
 * palette from the heart to the rim.
 */
function inksFor(palette: Palette, color: number, arms: number): string[] {
  const c = palette.colors;
  if (color === 0) {
    // Leave out the faintest color when there are enough others to take turns.
    const bold = c.length >= 4 ? c.slice(1) : [...c];
    // Two arms only (a near-straight angle) read better as two colors.
    return arms < bold.length ? bold.slice(-Math.max(1, arms)) : bold;
  }
  return Array.from({ length: DISTANCE_SHADES }, (_, k) => ramp(c, 0.12 + (0.88 * k) / (DISTANCE_SHADES - 1)));
}

/**
 * Which color each arm takes when coloring by spirals. Neighbouring arms
 * share a color in bands about three arms wide, so the spirals read as
 * broad sweeps; the bands go round the colors a whole number of times, so
 * there is no seam. A head with only a few arms gives each arm its own.
 */
export function armBands(arms: number, colors: number): Int32Array {
  const out = new Int32Array(arms);
  const bands = arms <= colors * 2 ? arms : colors * Math.max(1, Math.round(arms / (colors * 3)));
  for (let a = 0; a < arms; a++) out[a] = Math.floor((a * bands) / arms) % colors;
  return out;
}

/** Position 0 to 1 along the colors. */
function ramp(colors: readonly string[], t: number): string {
  const f = Math.min(1, Math.max(0, t)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(f));
  return mixHex(colors[i], colors[i + 1], f - i);
}

/** Overshoots a little before settling: seeds pop in. */
function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
