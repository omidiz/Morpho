import { turing } from './turing';
import type { Pattern } from './types';

/** Every pattern in the studio. The first one is the default. */
export const PATTERNS: readonly Pattern[] = [turing];

export function findPattern(id: string): Pattern {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
}
