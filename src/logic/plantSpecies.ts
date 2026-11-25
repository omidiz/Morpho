import type { LSystem } from './lsystem';

/** What grows at the end of each twig. */
export type TipKind = 'leaf' | 'blossom' | 'pod' | 'spark';

/** One kind of plant: its rules and how it is drawn. */
export interface Species {
  id: string;
  name: string;
  system: LSystem;
  /** Branching angle at slider value 1, degrees. */
  angle: number;
  /** Turn for < and >, degrees (for zigzags). */
  kink?: number;
  /** Segments get this much shorter each generation, so each one refines the last. */
  shrink: number;
  /** Generation shown at growth step 1; step n shows `firstGeneration + n - 1`. */
  firstGeneration: number;
  /** Starting direction, degrees clockwise from straight up. */
  heading?: number;
  /** Most a segment's direction drifts at full randomness, degrees. */
  wobble: number;
  /** Trunk width as a fraction of the plant's height. */
  trunk: number;
  tip: TipKind;
  /** Leaf or blossom size as a fraction of the plant's height. */
  tipSize: number;
  /** How strongly wind (or water) bends it. */
  sway: number;
}

/** Growth steps offered by the slider. */
export const MAX_STEPS = 6;

/**
 * Most segments any plant may have. The species below stay under it at the
 * top growth step; the budget is a safety net so no setting can lock up a phone.
 */
export const MAX_SEGMENTS = 16_000;

export const SPECIES: readonly Species[] = [
  {
    id: 'fern',
    name: 'Fern',
    system: {
      axiom: 'X',
      rules: {
        X: [
          { to: 'F+[[X]-X]-F[-FX]+X', weight: 3 },
          { to: 'F-[[X]+X]+F[+FX]-X', weight: 1 },
        ],
        F: 'FF',
      },
    },
    angle: 25,
    shrink: 0.5,
    firstGeneration: 1,
    heading: 8,
    wobble: 4,
    trunk: 0.012,
    tip: 'leaf',
    tipSize: 0.008,
    sway: 1,
  },
  {
    id: 'tree',
    name: 'Tree',
    system: {
      axiom: 'X',
      rules: {
        X: [
          { to: 'F[+X][-X]FX', weight: 2 },
          { to: 'F[+X]F[-X]X', weight: 1 },
          { to: 'F[-X]F[+X]X', weight: 1 },
        ],
        F: 'FF',
      },
    },
    angle: 32,
    shrink: 0.5,
    firstGeneration: 3,
    wobble: 6,
    trunk: 0.034,
    tip: 'leaf',
    tipSize: 0.011,
    sway: 0.8,
  },
  {
    id: 'bush',
    name: 'Bush',
    system: {
      axiom: '[--X][-X][X][+X][++X]',
      rules: {
        X: [
          { to: 'F[+X][-X]FX', weight: 2 },
          { to: 'F[+X]FX', weight: 1 },
          { to: 'F[-X]FX', weight: 1 },
        ],
        F: 'FF',
      },
    },
    angle: 20,
    shrink: 0.5,
    firstGeneration: 2,
    wobble: 6,
    trunk: 0.02,
    tip: 'blossom',
    tipSize: 0.014,
    sway: 0.8,
  },
  {
    id: 'seaweed',
    name: 'Seaweed',
    system: {
      axiom: '[--X][-X][X][+X][++X]',
      rules: {
        X: [
          { to: 'F<F<F>F>[+Y]X', weight: 2 },
          { to: 'F>F>F<F<[-Y]X', weight: 2 },
          { to: 'F<F>F>F<[+X][-X]', weight: 1 },
        ],
        Y: 'F<F>Y',
        F: 'FF',
      },
    },
    angle: 11,
    kink: 14,
    shrink: 0.5,
    firstGeneration: 1,
    wobble: 5,
    trunk: 0.016,
    tip: 'pod',
    tipSize: 0.009,
    sway: 1.8,
  },
  {
    id: 'lightning',
    name: 'Lightning tree',
    system: {
      axiom: 'X',
      rules: {
        X: [
          { to: 'F[+X][-X]FX', weight: 1 },
          { to: 'F[++X]F[-X]X', weight: 1 },
          { to: 'F[+X]F[--X]X', weight: 1 },
        ],
        F: [
          { to: '<F>>F<', weight: 1 },
          { to: '>F<<F>', weight: 1 },
        ],
      },
    },
    angle: 28,
    kink: 14,
    shrink: 0.5,
    firstGeneration: 2,
    wobble: 3,
    trunk: 0.018,
    tip: 'spark',
    tipSize: 0.008,
    sway: 0.6,
  },
];

/** The generation a species shows at growth step `steps`. */
export function generationFor(species: Species, steps: number): number {
  const s = Math.min(MAX_STEPS, Math.max(1, Math.round(steps)));
  return species.firstGeneration + s - 1;
}
