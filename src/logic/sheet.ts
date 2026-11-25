/** How the bottom sheet settles after a drag, and how fast the live thumbnails grow. */

/** Flicks faster than this (px per ms) decide on their own, wherever the sheet is. */
export const FLICK_SPEED = 0.35;

/**
 * Whether a sheet let go at `offset` (0 = fully open, `closedOffset` = closed)
 * moving at `velocity` (px/ms, positive = downward) should end up open.
 */
export function settlesOpen(offset: number, closedOffset: number, velocity: number): boolean {
  if (velocity <= -FLICK_SPEED) return true;
  if (velocity >= FLICK_SPEED) return false;
  return offset < closedOffset / 2;
}

/** How far open the sheet is, from 0 (closed) to 1 (open). */
export function openness(offset: number, closedOffset: number): number {
  if (closedOffset <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - offset / closedOffset));
}

/** Steps a thumbnail grows in its first frames, so it shows the pattern rather than seeds. */
export const THUMB_WARMUP_STEPS = 240;

/**
 * Simulation steps to give a thumbnail this frame, `age` steps after it
 * started: fast-forward until it has grown in, then a gentle one at a time
 * (or none, for people who prefer less motion).
 */
export function thumbSteps(age: number, reducedMotion: boolean): number {
  if (age < THUMB_WARMUP_STEPS) return Math.min(6, THUMB_WARMUP_STEPS - age);
  return reducedMotion ? 0 : 1;
}
