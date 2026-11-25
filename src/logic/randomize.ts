import { clampToSpec, type ParamSpec, type ParamValues } from './params';
import { hashSeed, mulberry32, type Rng } from './rng';
import type { AppState } from './urlState';

/**
 * How "Randomize" picks one parameter. Parameters without a rule keep their
 * current value (for things like speed, which are a preference, not a look).
 *
 * - `jitter`: start from a random preset's value and move up to ± this much.
 *   Use it where only a thin region looks good.
 * - `range`: anywhere in [min, max], a subset of the slider's range.
 */
export type ExploreRule = { jitter: number } | { range: readonly [min: number, max: number] };

export type ExploreRules = Readonly<Record<string, ExploreRule>>;

/** The parts of a pattern Randomize needs. */
export interface ExploreSchema {
  id: string;
  params: readonly ParamSpec[];
  presets: readonly { values: ParamValues }[];
  explore: ExploreRules;
}

/** Salt so the choices don't correlate with the field drawn from the same seed. */
const EXPLORE_SALT = 0x9e3779b9;

/**
 * A new state for `seed`: a preset-like parameter set, a different palette
 * and the seed itself. The pattern stays the same. Pure: the same inputs
 * always give the same result, so it can be tested and reproduced.
 */
export function randomizeState(
  current: AppState,
  pattern: ExploreSchema,
  palettes: readonly { id: string }[],
  seed: string,
): AppState {
  const rng = mulberry32((hashSeed(seed) ^ EXPLORE_SALT) >>> 0);
  // Draw in a fixed order (preset, params in schema order, palette) so results are stable.
  const preset = pattern.presets.length ? pick(pattern.presets, rng) : undefined;
  const params: ParamValues = {};
  for (const spec of pattern.params) {
    const rule = pattern.explore[spec.key];
    const now = current.params[spec.key] ?? spec.default;
    params[spec.key] = clampToSpec(spec, explore(rule, preset?.values[spec.key] ?? now, now, rng));
  }
  const others = palettes.filter((p) => p.id !== current.palette);
  const palette = pick(others.length ? others : palettes, rng).id;
  return { pattern: pattern.id, seed, palette, params };
}

function explore(rule: ExploreRule | undefined, base: number, now: number, rng: Rng): number {
  if (!rule) return now;
  if ('range' in rule) {
    const [min, max] = rule.range;
    return min + rng() * (max - min);
  }
  return base + (rng() * 2 - 1) * rule.jitter;
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
