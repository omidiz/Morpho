import { mixHex } from '../../logic/color';
import { unitHash } from '../../logic/rng';
import type { Palette } from '../../palettes';
import { WIDTH_STEPS, type Built, type Fit, type Plant } from './plant';

/** Colors for one plant, already hazed toward the background for far plants. */
interface Ink {
  /** One per width step, trunk first. */
  wood: string[];
  /** Leaf / petal colors, and the color of a blossom's heart. */
  tips: [string, string];
  heart: string;
}

/** How far plants at the very back fade into the background. */
const HAZE = 0.55;
const LEAF = 0x1eaf;
const SIZE = 0x512e;
const TILT = 0x7117;
const SHADE = 0x5ade;

function inkFor(palette: Palette, depth: number): Ink {
  const c = palette.colors;
  const n = c.length;
  const haze = HAZE * (1 - depth);
  const fade = (hex: string) => (haze > 0 ? mixHex(hex, palette.background, haze) : hex);
  // Trunks in the boldest color, twigs fading toward a softer one.
  const trunk = c[n - 1];
  const twig = c[Math.max(0, n - 3)];
  const wood = Array.from({ length: WIDTH_STEPS }, (_, q) => fade(mixHex(trunk, twig, q / (WIDTH_STEPS - 1))));
  return { wood, tips: [fade(c[n - 2]), fade(c[n - 1])], heart: fade(c[Math.max(0, n - 3)]) };
}

export interface SceneOptions {
  palette: Palette;
  /** Leaves slider, 0 = bare. */
  leaves: number;
}

/** Paint the whole picture: background, then each plant from back to front. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plants: readonly Plant[],
  { palette, leaves }: SceneOptions,
): void {
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  // A soft glow along the ground.
  const ground = ctx.createLinearGradient(0, height * 0.6, 0, height);
  ground.addColorStop(0, `${palette.background}00`);
  ground.addColorStop(1, mixHex(palette.background, palette.colors[0], 0.55));
  ctx.fillStyle = ground;
  ctx.fillRect(0, height * 0.6, width, height * 0.4);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const minLine = Math.max(0.75, 0.0011 * Math.min(width, height));
  for (const plant of plants) {
    const fit = plant.fit(width, height);
    const ink = inkFor(palette, plant.slot.depth);
    drawPlant(ctx, plant, fit, ink, minLine, leaves);
  }
}

function drawPlant(
  ctx: CanvasRenderingContext2D,
  plant: Plant,
  fit: Fit,
  ink: Ink,
  minLine: number,
  leaves: number,
): void {
  const { shown, t, bloom } = plant.growth;
  const trunk = plant.species.trunk * fit.height;
  if (shown >= 0 && t === 0) {
    drawBranches(ctx, plant.build(shown), fit, ink, trunk, minLine, 'all', 0);
  } else {
    // The next generation grows out from the root along the branches,
    // taking over from the current one as it goes.
    const next = plant.build(shown + 1);
    const front = easeInOut(t) * next.skel.reach * 1.001;
    if (shown >= 0) drawBranches(ctx, plant.build(shown), fit, ink, trunk, minLine, 'beyond', front);
    drawBranches(ctx, next, fit, ink, trunk, minLine, 'before', front);
  }
  if (bloom > 0 && leaves > 0 && shown >= 0) {
    drawTips(ctx, plant, plant.build(shown), fit, ink, leaves, bloom);
  }
}

/**
 * Stroke the segments of `b`: all of each, only the part closer to the root
 * than `front` (growing in), or only the part beyond it (about to be replaced).
 */
function drawBranches(
  ctx: CanvasRenderingContext2D,
  b: Built,
  fit: Fit,
  ink: Ink,
  trunk: number,
  minLine: number,
  part: 'all' | 'before' | 'beyond',
  front: number,
): void {
  const { lay, skel } = b;
  const { scale, tx, ty } = fit;
  for (let q = 0; q < WIDTH_STEPS; q++) {
    const lo = b.stepStart[q];
    const hi = b.stepStart[q + 1];
    if (lo === hi) continue;
    ctx.beginPath();
    let any = false;
    for (let k = lo; k < hi; k++) {
      const i = b.order[k];
      let a = 0;
      let e = 1;
      if (part !== 'all') {
        const f = Math.min(1, Math.max(0, (front - skel.start[i]) / skel.length[i]));
        if (part === 'before') e = f;
        else a = f;
        if (e <= a) continue;
      }
      const dx = lay.x1[i] - lay.x0[i];
      const dy = lay.y1[i] - lay.y0[i];
      ctx.moveTo(tx + (lay.x0[i] + dx * a) * scale, ty + (lay.y0[i] + dy * a) * scale);
      ctx.lineTo(tx + (lay.x0[i] + dx * e) * scale, ty + (lay.y0[i] + dy * e) * scale);
      any = true;
    }
    if (!any) continue;
    ctx.lineWidth = Math.max(minLine, trunk * b.stepThickness[q]);
    ctx.strokeStyle = ink.wood[q];
    ctx.stroke();
  }
}

/** Leaves, blossoms, pods or sparks at the twig ends, opening from the root outward. */
function drawTips(
  ctx: CanvasRenderingContext2D,
  plant: Plant,
  b: Built,
  fit: Fit,
  ink: Ink,
  leaves: number,
  bloom: number,
): void {
  const { lay, skel } = b;
  const { scale, tx, ty } = fit;
  const kind = plant.species.tip;
  const density = Math.min(1, leaves * 1.3) * (kind === 'blossom' ? 0.7 : 1);
  const base = plant.species.tipSize * fit.height * (0.55 + 0.65 * leaves);
  const reach = Math.max(1e-6, skel.reach);
  const paths: [Path2D, Path2D, Path2D] = [new Path2D(), new Path2D(), new Path2D()];
  let any = false;

  for (let k = 0; k < b.tips.length; k++) {
    const i = b.tips[k];
    const id = skel.id[i];
    if (unitHash(id, LEAF) >= density) continue;
    const open = Math.min(1, Math.max(0, bloom * 1.8 - (skel.start[i] / reach) * 0.8));
    if (open <= 0) continue;
    const r = base * (0.7 + 0.6 * unitHash(id, SIZE)) * easeOutBack(open);
    if (r <= 0.2) continue;
    any = true;
    const x = tx + lay.x1[i] * scale;
    const y = ty + lay.y1[i] * scale;
    const h = lay.heading[i] + (unitHash(id, TILT) - 0.5) * 1.1;
    const dx = Math.sin(h);
    const dy = -Math.cos(h);
    const shade = unitHash(id, SHADE) < 0.5 ? 0 : 1;
    const p = paths[shade];
    switch (kind) {
      case 'leaf': {
        const cx = x + dx * r * 0.8;
        const cy = y + dy * r * 0.8;
        const rot = h - Math.PI / 2;
        p.moveTo(cx + Math.cos(rot) * r, cy + Math.sin(rot) * r);
        p.ellipse(cx, cy, r, r * 0.42, rot, 0, Math.PI * 2);
        break;
      }
      case 'blossom': {
        for (let j = 0; j < 5; j++) {
          const a = h + (j * Math.PI * 2) / 5;
          const px = x + Math.cos(a) * r * 0.52;
          const py = y + Math.sin(a) * r * 0.52;
          p.moveTo(px + r * 0.46, py);
          p.arc(px, py, r * 0.46, 0, Math.PI * 2);
        }
        paths[2].moveTo(x + r * 0.3, y);
        paths[2].arc(x, y, r * 0.3, 0, Math.PI * 2);
        break;
      }
      case 'pod': {
        const cx = x + dx * r * 0.9;
        const cy = y + dy * r * 0.9;
        p.moveTo(cx + r, cy);
        p.arc(cx, cy, r, 0, Math.PI * 2);
        break;
      }
      case 'spark': {
        paths[2].moveTo(x + r * 2, y);
        paths[2].arc(x, y, r * 2, 0, Math.PI * 2);
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, Math.PI * 2);
        break;
      }
    }
  }
  if (!any) return;

  if (kind === 'spark') {
    // A faint halo behind each spark.
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = ink.tips[1];
    ctx.fill(paths[2]);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = ink.tips[0];
  ctx.fill(paths[0]);
  ctx.fillStyle = ink.tips[1];
  ctx.fill(paths[1]);
  if (kind === 'blossom') {
    ctx.fillStyle = ink.heart;
    ctx.fill(paths[2]);
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Overshoots a little before settling: leaves pop open. */
function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
