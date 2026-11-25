import { formatValue, sanitizeValues, type ParamSpec, type ParamValues } from './params';
import { isValidSeed } from './rng';

/** Everything needed to reproduce a pattern. Lives in the URL query string. */
export interface AppState {
  pattern: string;
  seed: string;
  params: ParamValues;
}

/** The parts of a pattern that URL state needs to know about. */
export interface PatternSchema {
  id: string;
  params: readonly ParamSpec[];
}

const RESERVED = new Set(['p', 'seed']);

export function encodeState(state: AppState, schema: PatternSchema): string {
  const q = new URLSearchParams();
  q.set('p', state.pattern);
  q.set('seed', state.seed);
  for (const spec of schema.params) {
    if (RESERVED.has(spec.key)) continue;
    const v = state.params[spec.key];
    if (v !== undefined) q.set(spec.key, formatValue(spec, v));
  }
  return `?${q.toString()}`;
}

/**
 * Read state from a query string. Unknown patterns fall back to the first one,
 * bad seeds are replaced with `newSeed()`, and parameters are clamped.
 */
export function decodeState(
  search: string,
  patterns: readonly PatternSchema[],
  newSeed: () => string,
): AppState {
  const q = new URLSearchParams(search);
  const schema = patterns.find((p) => p.id === q.get('p')) ?? patterns[0];
  const seedRaw = q.get('seed');
  const seed = seedRaw && isValidSeed(seedRaw) ? seedRaw : newSeed();
  const raw: Record<string, string> = {};
  for (const [k, v] of q) raw[k] = v;
  return { pattern: schema.id, seed, params: sanitizeValues(schema.params, raw) };
}
