/** One user-facing control. The UI builds a slider from each of these. */
export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export type ParamValues = Record<string, number>;

/** Number of decimals needed to represent `step` exactly (0.01 → 2). */
export function stepDecimals(step: number): number {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Clamp to [min, max] and snap to the nearest step (measured from min). */
export function clampToSpec(spec: ParamSpec, value: number): number {
  if (!Number.isFinite(value)) return spec.default;
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  const snapped = spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step;
  const fixed = Number(snapped.toFixed(stepDecimals(spec.step)));
  return Math.min(spec.max, Math.max(spec.min, fixed));
}

export function defaultValues(schema: readonly ParamSpec[]): ParamValues {
  const out: ParamValues = {};
  for (const spec of schema) out[spec.key] = spec.default;
  return out;
}

/** Fill in every key in the schema: valid values are clamped, missing or bad ones use defaults. */
export function sanitizeValues(
  schema: readonly ParamSpec[],
  values: Readonly<Record<string, unknown>>,
): ParamValues {
  const out: ParamValues = {};
  for (const spec of schema) {
    const raw = values[spec.key];
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    out[spec.key] = Number.isFinite(n) ? clampToSpec(spec, n) : spec.default;
  }
  return out;
}

/** Format a value with just enough decimals for its step (for URLs). */
export function formatValue(spec: ParamSpec, value: number): string {
  return String(Number(value.toFixed(stepDecimals(spec.step))));
}
